const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

function createNotification(userId, message, type = 'info') {
  try {
    db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(userId, message, type);
  } catch (e) { }
}

function emitUpdate(req, eventName, data) {
  const io = req.app.get('io');
  if (io) io.emit(eventName, data);
}

function notifyAndEmit(req, userIds, message, type, eventName, eventData) {
  const io = req.app.get('io');
  userIds.forEach(uid => {
    if (uid) {
      createNotification(uid, message, type);
      if (io) io.to(`user_${uid}`).emit('notification:new', { message, type });
    }
  });
  if (eventName && io) io.emit(eventName, eventData);
}

// GET all tasks (role-filtered)
router.get('/', auth, (req, res) => {
  let tasks;
  if (req.user.role === 'worker') {
    tasks = db.prepare(`
      SELECT t.*, u.name as worker_name, u.status as worker_status, u.profile_picture as worker_picture, m.name as machine_name, m.status as machine_status, s.name as supervisor_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_worker_id = u.id
      LEFT JOIN machines m ON t.machine_id = m.id
      LEFT JOIN users s ON t.created_by = s.id
      WHERE t.assigned_worker_id = ?
      ORDER BY t.created_at DESC
    `).all(req.user.id);
  } else {
    tasks = db.prepare(`
      SELECT t.*, u.name as worker_name, u.status as worker_status, u.profile_picture as worker_picture, m.name as machine_name, m.status as machine_status, s.name as supervisor_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_worker_id = u.id
      LEFT JOIN machines m ON t.machine_id = m.id
      LEFT JOIN users s ON t.created_by = s.id
      ORDER BY t.created_at DESC
    `).all();
  }
  res.json(tasks);
});

// GET all unassigned tasks (Task Pool)
router.get('/pool', auth, (req, res) => {
  const tasks = db.prepare(`
    SELECT t.*, m.name as machine_name, s.name as supervisor_name
    FROM tasks t
    LEFT JOIN machines m ON t.machine_id = m.id
    LEFT JOIN users s ON t.created_by = s.id
    WHERE t.assigned_worker_id IS NULL 
    AND t.status = 'not_started'
    AND (m.status IS NULL OR m.status != 'breakdown')
    ORDER BY CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at ASC
  `).all();
  res.json(tasks);
});

// claim task route
router.put('/:id/claim', auth, (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'Only workers can claim tasks' });
  const taskId = req.params.id;

  const task = db.prepare(`
    SELECT t.*, m.status as machine_status 
    FROM tasks t 
    LEFT JOIN machines m ON t.machine_id = m.id 
    WHERE t.id = ?
  `).get(taskId);

  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.assigned_worker_id) return res.status(400).json({ error: 'Task already assigned' });
  if (task.machine_status === 'breakdown') {
    return res.status(400).json({ error: 'Cannot claim task: Machine is currently broken down.' });
  }

  // 1. Check if user is on break
  const user = db.prepare('SELECT is_on_break FROM users WHERE id = ?').get(req.user.id);
  if (user && user.is_on_break === 1) {
    return res.status(400).json({ error: 'Cannot accept new tasks while on break. Please end your break first.' });
  }

  // 2. Check if user already has an active task
  const activeTask = db.prepare("SELECT id FROM tasks WHERE assigned_worker_id = ? AND status = 'in_progress'").get(req.user.id);
  if (activeTask) {
    return res.status(400).json({ error: 'You are already working on another task. Please pause or complete it before accepting a new one.' });
  }

  db.prepare('UPDATE tasks SET assigned_worker_id = ? WHERE id = ?').run(req.user.id, taskId);
  db.prepare('INSERT INTO task_logs (task_id, action, note, performed_by) VALUES (?, ?, ?, ?)').run(taskId, 'assigned', 'Worker claimed task from pool', req.user.id);

  const updatedTask = db.prepare(`SELECT t.*, u.name as worker_name, m.name as machine_name, m.status as machine_status FROM tasks t LEFT JOIN users u ON t.assigned_worker_id = u.id LEFT JOIN machines m ON t.machine_id = m.id WHERE t.id = ?`).get(taskId);

  emitUpdate(req, 'task:updated', updatedTask);
  res.json(updatedTask);
});

// GET single task
router.get('/:id', auth, (req, res) => {
  const task = db.prepare(`
    SELECT t.*, u.name as worker_name, m.name as machine_name, m.status as machine_status
    FROM tasks t
    LEFT JOIN users u ON t.assigned_worker_id = u.id
    LEFT JOIN machines m ON t.machine_id = m.id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// POST create task (Admin/Supervisor)
router.post('/', auth, (req, res) => {
  if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });
  const { title, description, machine_id, priority, expected_minutes } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  if (machine_id) {
    const machine = db.prepare('SELECT status FROM machines WHERE id = ?').get(machine_id);
    if (machine && machine.status === 'breakdown') {
      return res.status(400).json({ error: 'Cannot assign task to a broken machine.' });
    }
  }

  const result = db.prepare(`
    INSERT INTO tasks (title, description, machine_id, priority, expected_minutes, created_by, status)
    VALUES (?, ?, ?, ?, ?, ?, 'not_started')
  `).run(title, description || '', machine_id || null, priority || 'medium', expected_minutes || 30, req.user.id);

  const newTask = db.prepare(`
    SELECT t.*, m.name as machine_name, s.name as supervisor_name, m.status as machine_status
    FROM tasks t
    LEFT JOIN machines m ON t.machine_id = m.id
    LEFT JOIN users s ON t.created_by = s.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  const io = req.app.get('io');
  if (io) io.emit('task:updated', newTask);
  res.json(newTask);
});

// PUT update task status (Worker actions + Supervisor override)
router.put('/:id', auth, (req, res) => {
  const taskId = req.params.id;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Workers can only update their own tasks
  if (req.user.role === 'worker') {
    if (task.assigned_worker_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your task' });
    }
    // Block action if on break
    const user = db.prepare('SELECT is_on_break FROM users WHERE id = ?').get(req.user.id);
    if (user.is_on_break === 1 && (action === 'start' || action === 'resume')) {
      return res.status(400).json({ error: 'Cannot start or resume tasks while on break. Please end your break first.' });
    }
  }

  const { action, pause_reason, note, title, machine_id, assigned_worker_id, priority, expected_minutes, status_override } = req.body;

  const io = req.app.get('io');
  const now = new Date().toISOString();
  let updateFields = {};
  let logAction = action;

  // Handle direct status override (Admin/Supervisor)
  if (status_override && req.user.role !== 'worker') {
    updateFields.status = status_override;
    if (status_override === 'completed') {
      updateFields.completed_at = now;
    }
    logAction = 'overridden';
  } else {
    switch (action) {
      case 'start':
        if (task.status !== 'not_started' && task.status !== 'paused') {
          return res.status(400).json({ error: 'Cannot start task in current state.' });
        }
        // Check machine status (Queuing prevention)
        if (task.machine_id) {
          const machine = db.prepare('SELECT status FROM machines WHERE id = ?').get(task.machine_id);
          if (machine.status === 'running') {
            return res.status(400).json({ error: 'Machinery is currently held by another worker. Please wait.' });
          }
        }
        const deadline = new Date(Date.now() + (task.expected_minutes * 60 * 1000)).toISOString();
        updateFields = {
          status: 'in_progress',
          started_at: task.started_at || now,
          deadline_at: deadline,
          last_action_at: now
        };
        logAction = task.status === 'paused' ? 'resumed' : 'started';
        // Update worker to busy
        if (task.assigned_worker_id) {
          db.prepare("UPDATE users SET status = 'busy' WHERE id = ?").run(task.assigned_worker_id);
          if (io) io.emit('user:status', { userId: task.assigned_worker_id, status: 'busy' });
        }
        // Update machine to running
        if (task.machine_id) {
          db.prepare("UPDATE machines SET status = 'running', last_active_at = ?, idle_since = NULL WHERE id = ?").run(now, task.machine_id);
          const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(task.machine_id);
          emitUpdate(req, 'machine:status', machine);
        }
        break;

      case 'pause':
        const elapsedSinceLastStart = task.last_action_at ? Math.floor((new Date() - new Date(task.last_action_at)) / 1000) : 0;
        updateFields = {
          status: 'paused',
          total_elapsed_seconds: (task.total_elapsed_seconds || 0) + elapsedSinceLastStart,
          last_action_at: null
        };
        logAction = 'paused';
        // Update worker to paused
        if (task.assigned_worker_id) {
          db.prepare("UPDATE users SET status = 'paused', last_idle_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.assigned_worker_id);
          if (io) io.emit('user:status', { userId: task.assigned_worker_id, status: 'paused', last_idle_at: new Date().toISOString() });
        }
        // Check if machine has other active tasks or becomes free
        if (task.machine_id) {
          const otherActive = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE machine_id = ? AND id != ? AND status = 'in_progress'").get(task.machine_id, taskId);
          if (otherActive.c === 0) {
            // Check if there is a next task in queue for this machine
            const nextTask = db.prepare("SELECT * FROM tasks WHERE machine_id = ? AND status = 'not_started' ORDER BY priority DESC, created_at ASC LIMIT 1").get(task.machine_id);
            const nextStatus = nextTask ? 'occupied' : 'idle';
            db.prepare("UPDATE machines SET status = ?, idle_since = ? WHERE id = ?").run(nextStatus, nextStatus === 'idle' ? now : null, task.machine_id);
            const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(task.machine_id);
            emitUpdate(req, 'machine:status', machine);

            // Notify next worker
            if (nextTask && nextTask.assigned_worker_id) {
              const msg = `🟢 Machine "${machine.name}" is now free! You can start your task: "${nextTask.title}".`;
              notifyAndEmit(req, [nextTask.assigned_worker_id], msg, 'success', 'notification:new', { message: msg, type: 'success' });
            }
          }
        }
        break;

      case 'complete':
        if (task.status === 'completed') return res.status(400).json({ error: 'Already completed.' });
        const elapsedSinceLastStartComp = task.last_action_at ? Math.floor((new Date() - new Date(task.last_action_at)) / 1000) : 0;
        updateFields = {
          status: 'completed',
          completed_at: now,
          total_elapsed_seconds: (task.total_elapsed_seconds || 0) + elapsedSinceLastStartComp,
          last_action_at: null
        };
        logAction = 'completed';
        // Update worker to idle
        if (task.assigned_worker_id) {
          db.prepare("UPDATE users SET status = 'idle', last_idle_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.assigned_worker_id);
          if (io) io.emit('user:status', { userId: task.assigned_worker_id, status: 'idle', last_idle_at: new Date().toISOString() });
          // Trigger next assignment
          const autoAssign = req.app.get('autoAssign');
          if (autoAssign) autoAssign.attemptAutoAssign(io);
        }
        // Check if machine has other active tasks or becomes free
        if (task.machine_id) {
          const otherActive = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE machine_id = ? AND id != ? AND status = 'in_progress'").get(task.machine_id, taskId);
          if (otherActive.c === 0) {
            // Check if there is a next task in queue for this machine
            const nextTask = db.prepare("SELECT * FROM tasks WHERE machine_id = ? AND status = 'not_started' ORDER BY priority DESC, created_at ASC LIMIT 1").get(task.machine_id);
            const nextStatus = nextTask ? 'occupied' : 'idle';
            db.prepare("UPDATE machines SET status = ?, idle_since = ? WHERE id = ?").run(nextStatus, nextStatus === 'idle' ? now : null, task.machine_id);
            const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(task.machine_id);
            emitUpdate(req, 'machine:status', machine);

            // Notify next worker
            if (nextTask && nextTask.assigned_worker_id) {
              const msg = `🟢 Machine "${machine.name}" is now free! You can start your task: "${nextTask.title}".`;
              notifyAndEmit(req, [nextTask.assigned_worker_id], msg, 'success', 'notification:new', { message: msg, type: 'success' });
            }
          }
        }
        break;

      default:
        // General field update (Admin/Supervisor)
        if (req.user.role !== 'worker') {
          if (title !== undefined) updateFields.title = title;
          if (machine_id !== undefined) {
            const machine = db.prepare('SELECT status FROM machines WHERE id = ?').get(machine_id);
            if (machine && machine.status === 'breakdown') {
              return res.status(400).json({ error: 'Cannot assign task to a broken machine.' });
            }
            updateFields.machine_id = machine_id;
          }
          if (assigned_worker_id !== undefined) updateFields.assigned_worker_id = assigned_worker_id;
          if (priority !== undefined) updateFields.priority = priority;
          if (expected_minutes !== undefined) updateFields.expected_minutes = expected_minutes;
          logAction = 'overridden';
        }
    }
  }

  if (Object.keys(updateFields).length > 0) {
    const setClauses = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updateFields), taskId];
    db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`).run(...values);
  }

  if (logAction) {
    db.prepare('INSERT INTO task_logs (task_id, action, pause_reason, note, performed_by) VALUES (?, ?, ?, ?, ?)')
      .run(taskId, logAction, pause_reason || null, note || null, req.user.id);
  }

  const updatedTask = db.prepare(`
    SELECT t.*, u.name as worker_name, u.profile_picture as worker_picture, m.name as machine_name, m.status as machine_status
    FROM tasks t
    LEFT JOIN users u ON t.assigned_worker_id = u.id
    LEFT JOIN machines m ON t.machine_id = m.id
    WHERE t.id = ?
  `).get(taskId);

  // Notify supervisor on completion/delay
  if (logAction === 'completed') {
    const supervisors = db.prepare("SELECT id FROM users WHERE role IN ('admin','supervisor')").all();
    supervisors.forEach(s => createNotification(s.id, `Task "${updatedTask.title}" completed by ${req.user.name}`, 'success'));
  }

  emitUpdate(req, 'task:updated', updatedTask);
  res.json(updatedTask);
});

// DELETE task (Admin/Supervisor)
router.delete('/:id', auth, (req, res) => {
  if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

  const taskId = parseInt(req.params.id);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const io = req.app.get('io');
  const now = new Date().toISOString();

  // Notify worker if task was assigned
  if (task.assigned_worker_id) {
    const msg = `⚠️ Task "${task.title}" has been deleted by an administrator.`;
    notifyAndEmit(req, [task.assigned_worker_id], msg, 'warning', 'notification:new', { message: msg, type: 'warning' });
  }

  // 1. Delete associated logs and the task itself
  db.prepare('DELETE FROM task_logs WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

  // 2. Machine Status Recalculation
  // If the task was occupying a machine, check if it should now be idle or re-queued
  if (task.machine_id) {
    const activeOnMachine = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE machine_id = ? AND status = 'in_progress'").get(task.machine_id);

    if (activeOnMachine.c === 0) {
      // Machine is no longer "Running". Check for next pending task.
      const nextTask = db.prepare("SELECT * FROM tasks WHERE machine_id = ? AND status = 'not_started' ORDER BY priority DESC, created_at ASC LIMIT 1").get(task.machine_id);

      const newMachineStatus = nextTask ? 'occupied' : 'idle';
      db.prepare("UPDATE machines SET status = ?, idle_since = ? WHERE id = ?").run(newMachineStatus, newMachineStatus === 'idle' ? now : null, task.machine_id);

      const updatedMachine = db.prepare('SELECT * FROM machines WHERE id = ?').get(task.machine_id);
      emitUpdate(req, 'machine:status', updatedMachine);

      // Notify the next worker in line if the machine is now "Occupied" (reserved for them)
      if (nextTask && nextTask.assigned_worker_id) {
        const msg = `🟢 Machine "${updatedMachine.name}" is now free! Your task "${nextTask.title}" is ready to start.`;
        notifyAndEmit(req, [nextTask.assigned_worker_id], msg, 'success', 'notification:new', { message: msg, type: 'success' });
      }
    }
  }

  // 3. Worker Status Recalculation
  if (task.assigned_worker_id) {
    const workerPendingTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE assigned_worker_id = ? AND status IN ('in_progress', 'not_started', 'paused')").get(task.assigned_worker_id);

    if (workerPendingTasks.c === 0) {
      // Worker has no more work, set to idle
      db.prepare("UPDATE users SET status = 'idle', last_idle_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.assigned_worker_id);
      if (io) io.emit('user:status', { userId: task.assigned_worker_id, status: 'idle', last_idle_at: new Date().toISOString() });
    }
  }

  // 4. Real-time Refresh & Auto-Assignment Trigger
  if (io) {
    io.emit('task:deleted', { id: taskId });
    // Trigger auto-assignment to fill any idle capacity created by this deletion
    const autoAssign = req.app.get('autoAssign');
    if (autoAssign) autoAssign.attemptAutoAssign(io);
  }

  res.json({ success: true });
});

module.exports = router;
