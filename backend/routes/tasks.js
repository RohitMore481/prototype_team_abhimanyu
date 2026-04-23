const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const creditService = require('../services/creditService');

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

// GET all tasks (role-filtered, project-aware)
router.get('/', auth, (req, res) => {
  const { projectId } = req.query;
  let tasks;
  let query = `
    SELECT t.*, u.name as worker_name, u.status as worker_status, u.profile_picture as worker_picture, m.name as machine_name, m.status as machine_status, s.name as supervisor_name,
    (SELECT SUM(credits) FROM credit_logs cl WHERE cl.task_id = t.id) as credits_earned
    FROM tasks t
    LEFT JOIN users u ON t.assigned_worker_id = u.id
    LEFT JOIN machines m ON t.machine_id = m.id
    LEFT JOIN users s ON t.created_by = s.id
`;
  const params = [];

  if (req.user.role === 'worker') {
    query += " WHERE t.assigned_worker_id = ?";
    params.push(req.user.id);
  } else {
    // Start WHERE clause if needed
    const conditions = [];
    if (req.user.role === 'supervisor') {
      if (!req.user.project_id) return res.json([]);
      conditions.push("t.project_id = ?");
      params.push(req.user.project_id);
    } else if (projectId) {
      conditions.push("t.project_id = ?");
      params.push(projectId);
    } else {
      conditions.push("t.project_id IN (SELECT id FROM projects WHERE status = 'active')");
    }

    if (req.query.workerId) {
      conditions.push("t.assigned_worker_id = ?");
      params.push(req.query.workerId);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
  }

  query += " ORDER BY t.created_at DESC";
  tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// GET all unassigned tasks (Task Pool) - Scope to worker's project
router.get('/pool', auth, (req, res) => {
  if ((req.user.role === 'worker' || req.user.role === 'supervisor') && !req.user.project_id) {
    return res.json([]); // Workers/Supervisors without project see NO pool tasks
  }

  let query = `
    SELECT t.*, m.name as machine_name, s.name as supervisor_name
    FROM tasks t
    LEFT JOIN machines m ON t.machine_id = m.id
    LEFT JOIN users s ON t.created_by = s.id
    WHERE t.assigned_worker_id IS NULL 
    AND t.status = 'not_started'
    AND (m.status IS NULL OR m.status != 'breakdown')
  `;
  const params = [];

  if (req.user.role === 'worker' || req.user.role === 'supervisor') {
    query += " AND t.project_id = ?";
    params.push(req.user.project_id);
  }

  query += " ORDER BY CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at ASC";

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// GET pending tasks summary for worker logout/go-offline
router.get('/pending/:userId', auth, (req, res) => {
  try {
    const pendingTasks = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE assigned_worker_id = ? AND status IN ('not_started', 'in_progress', 'paused')`).get(req.params.userId).count;
    const delayedTasks = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE assigned_worker_id = ? AND status = 'delayed'`).get(req.params.userId).count;
    const estimatedTime = db.prepare(`SELECT SUM(expected_minutes) as est FROM tasks WHERE assigned_worker_id = ? AND status IN ('not_started', 'in_progress', 'paused', 'delayed')`).get(req.params.userId).est || 0;

    res.json({ pendingTasks, delayedTasks, estimatedTime });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending tasks: ' + err.message });
  }
});

// claim task route
router.put('/:id/claim', auth, (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'Only workers can claim tasks' });
  if (!req.user.project_id) return res.status(403).json({ error: 'You must be assigned to a project to claim tasks.' });

  const taskId = req.params.id;
  const task = db.prepare(`
    SELECT t.*, m.status as machine_status 
    FROM tasks t 
    LEFT JOIN machines m ON t.machine_id = m.id 
    WHERE t.id = ?
  `).get(taskId);

  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.project_id !== req.user.project_id) return res.status(403).json({ error: 'This task belongs to another project.' });
  if (task.assigned_worker_id) return res.status(400).json({ error: 'Task already assigned' });

  if (task.machine_status === 'breakdown') {
    return res.status(400).json({ error: 'Cannot claim task: Machine is currently broken down.' });
  }

  // Check if user is on break
  const user = db.prepare('SELECT is_on_break FROM users WHERE id = ?').get(req.user.id);
  if (user && user.is_on_break === 1) {
    return res.status(400).json({ error: 'Cannot accept new tasks while on break. Please end your break first.' });
  }

  // Check if user already has an active task
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

  // Scoping check
  if (req.user.role === 'worker' || req.user.role === 'supervisor') {
    if (task.project_id !== req.user.project_id) {
      if (req.user.role === 'worker' && task.assigned_worker_id === req.user.id) {
        // Exception: if it's their task but project changed (unlikely but safe)
      } else {
        return res.status(403).json({ error: 'Access denied: Task is outside your project scope.' });
      }
    }
  }

  res.json(task);
});

// POST create task (Admin/Supervisor)
router.post('/', auth, (req, res) => {
  if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });
  const { title, description, machine_id, priority, expected_minutes, credit_value } = req.body;
  let project_id = req.body.project_id;

  if (req.user.role === 'supervisor') {
    if (!req.user.project_id) return res.status(403).json({ error: 'Supervisor must be assigned to a project to create tasks.' });
    project_id = req.user.project_id;
  }

  if (!title) return res.status(400).json({ error: 'Title required' });

  if (machine_id) {
    const machine = db.prepare('SELECT id, status, project_id FROM machines WHERE id = ?').get(machine_id);
    if (machine && machine.status === 'breakdown') {
      return res.status(400).json({ error: 'Cannot assign task to a broken machine.' });
    }
    if (req.user.role === 'supervisor' && machine && machine.project_id !== req.user.project_id) {
      return res.status(403).json({ error: 'You can only assign tasks to machines within your project.' });
    }
  }

  const result = db.prepare(`
    INSERT INTO tasks (title, description, machine_id, priority, expected_minutes, created_by, status, project_id, credit_value)
    VALUES (?, ?, ?, ?, ?, ?, 'not_started', ?, ?)
  `).run(title, description || '', machine_id || null, priority || 'medium', expected_minutes || 30, req.user.id, project_id || null, credit_value || 1);

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
router.put('/:id', auth, async (req, res) => {
  const taskId = req.params.id;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Scoping check
  if (req.user.role === 'worker') {
    if (task.assigned_worker_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your task' });
    }
  } else if (req.user.role === 'supervisor') {
    if (task.project_id !== req.user.project_id) {
      return res.status(403).json({ error: 'This task does not belong to your project.' });
    }
  }

  const { action, pause_reason, note, title, machine_id, assigned_worker_id, priority, expected_minutes, status_override, credit_value } = req.body;
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
    // Block action if on break
    if (req.user.role === 'worker') {
      const user = db.prepare('SELECT is_on_break FROM users WHERE id = ?').get(req.user.id);
      if (user.is_on_break === 1 && (action === 'start' || action === 'resume')) {
        return res.status(400).json({ error: 'Cannot start or resume tasks while on break. Please end your break first.' });
      }
    }

    switch (action) {
      case 'pause_request':
        if (req.user.role !== 'worker') return res.status(403).json({ error: 'Only workers can request a pause' });
        if (!pause_reason) return res.status(400).json({ error: 'A valid reason is required to pause this task.' });

        db.prepare("INSERT INTO requests (user_id, type, status, data) VALUES (?, 'pause', 'pending', ?)").run(
          req.user.id, JSON.stringify({ task_id: taskId, title: task.title, reason: pause_reason, note: note })
        );

        const superIds = db.prepare("SELECT id FROM users WHERE role IN ('admin', 'supervisor')").all().map(r => r.id);
        notifyAndEmit(req, superIds, `Task pause requested by ${req.user.name} for: ${pause_reason}`, 'warning', 'request:new', {});
        return res.json({ success: true, message: 'Pause request submitted. Waiting for approval.' });

      case 'start':
        if (task.status !== 'not_started' && task.status !== 'paused') {
          return res.status(400).json({ error: 'Cannot start task in current state.' });
        }
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
        if (task.assigned_worker_id) {
          db.prepare("UPDATE users SET status = 'busy' WHERE id = ?").run(task.assigned_worker_id);
          if (io) io.emit('user:status', { userId: task.assigned_worker_id, status: 'busy' });
        }
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
        if (task.assigned_worker_id) {
          db.prepare("UPDATE users SET status = 'paused', last_idle_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.assigned_worker_id);
          if (io) io.emit('user:status', { userId: task.assigned_worker_id, status: 'paused', last_idle_at: new Date().toISOString() });
        }
        if (task.machine_id) {
          const otherActive = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE machine_id = ? AND id != ? AND status = 'in_progress'").get(task.machine_id, taskId);
          if (otherActive.c === 0) {
            const nextTask = db.prepare("SELECT * FROM tasks WHERE machine_id = ? AND status = 'not_started' ORDER BY priority DESC, created_at ASC LIMIT 1").get(task.machine_id);
            const nextStatus = nextTask ? 'occupied' : 'idle';
            db.prepare("UPDATE machines SET status = ?, idle_since = ? WHERE id = ?").run(nextStatus, nextStatus === 'idle' ? now : null, task.machine_id);
            const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(task.machine_id);
            emitUpdate(req, 'machine:status', machine);
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
        if (task.assigned_worker_id) {
          db.prepare("UPDATE users SET status = 'idle', last_idle_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.assigned_worker_id);
          if (io) io.emit('user:status', { userId: task.assigned_worker_id, status: 'idle', last_idle_at: new Date().toISOString() });
          const autoAssign = req.app.get('autoAssign');
          if (autoAssign) autoAssign.attemptAutoAssign(io);
        }
        if (task.machine_id) {
          const otherActive = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE machine_id = ? AND id != ? AND status = 'in_progress'").get(task.machine_id, taskId);
          if (otherActive.c === 0) {
            const nextTask = db.prepare("SELECT * FROM tasks WHERE machine_id = ? AND status = 'not_started' ORDER BY priority DESC, created_at ASC LIMIT 1").get(task.machine_id);
            const nextStatus = nextTask ? 'occupied' : 'idle';
            db.prepare("UPDATE machines SET status = ?, idle_since = ? WHERE id = ?").run(nextStatus, nextStatus === 'idle' ? now : null, task.machine_id);
            const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(task.machine_id);
            emitUpdate(req, 'machine:status', machine);
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
          if (req.body.project_id !== undefined) updateFields.project_id = req.body.project_id;
          logAction = 'overridden';
        }
    }
  }

  if (credit_value !== undefined) updateFields.credit_value = credit_value;

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

  if (logAction === 'completed' || updateFields.status === 'completed') {
    await creditService.awardTaskCompletion(taskId);
    if (io && task.assigned_worker_id) {
      io.emit('credits:updated', { userId: task.assigned_worker_id });
    }
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

  if (req.user.role === 'supervisor') {
    if (task.project_id !== req.user.project_id) {
      return res.status(403).json({ error: 'Forbidden: This task belongs to another project.' });
    }
  }

  const io = req.app.get('io');
  const now = new Date().toISOString();

  if (task.assigned_worker_id) {
    const msg = `⚠️ Task "${task.title}" has been deleted by an administrator.`;
    notifyAndEmit(req, [task.assigned_worker_id], msg, 'warning', 'notification:new', { message: msg, type: 'warning' });
  }

  db.prepare('DELETE FROM task_logs WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

  if (task.machine_id) {
    const activeOnMachine = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE machine_id = ? AND status = 'in_progress'").get(task.machine_id);
    if (activeOnMachine.c === 0) {
      const nextTask = db.prepare("SELECT * FROM tasks WHERE machine_id = ? AND status = 'not_started' ORDER BY priority DESC, created_at ASC LIMIT 1").get(task.machine_id);
      const newMachineStatus = nextTask ? 'occupied' : 'idle';
      db.prepare("UPDATE machines SET status = ?, idle_since = ? WHERE id = ?").run(newMachineStatus, newMachineStatus === 'idle' ? now : null, task.machine_id);
      const updatedMachine = db.prepare('SELECT * FROM machines WHERE id = ?').get(task.machine_id);
      emitUpdate(req, 'machine:status', updatedMachine);
      if (nextTask && nextTask.assigned_worker_id) {
        const msg = `🟢 Machine "${updatedMachine.name}" is now free! Your task "${nextTask.title}" is ready to start.`;
        notifyAndEmit(req, [nextTask.assigned_worker_id], msg, 'success', 'notification:new', { message: msg, type: 'success' });
      }
    }
  }

  if (task.assigned_worker_id) {
    const workerPendingTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE assigned_worker_id = ? AND status IN ('in_progress', 'not_started', 'paused')").get(task.assigned_worker_id);
    if (workerPendingTasks.c === 0) {
      db.prepare("UPDATE users SET status = 'idle', last_idle_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.assigned_worker_id);
      if (io) io.emit('user:status', { userId: task.assigned_worker_id, status: 'idle', last_idle_at: new Date().toISOString() });
    }
  }

  if (io) {
    io.emit('task:deleted', { id: taskId });
    const autoAssign = req.app.get('autoAssign');
    if (autoAssign) autoAssign.attemptAutoAssign(io);
  }

  res.json({ success: true });
});

// GET pending task status for worker logout validation
router.get('/pending/:userId', auth, (req, res) => {
  const userId = req.params.userId;

  try {
    const pending = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE assigned_worker_id = ? AND status IN ('not_started', 'in_progress', 'paused')").get(userId);
    const delayed = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE assigned_worker_id = ? AND status = 'delayed'").get(userId);
    const estimated = db.prepare("SELECT SUM(expected_minutes) as total FROM tasks WHERE assigned_worker_id = ? AND status IN ('not_started', 'in_progress', 'paused', 'delayed')").get(userId);

    res.json({
      pendingTasks: pending.count || 0,
      delayedTasks: delayed.count || 0,
      estimatedTime: estimated.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending tasks: ' + err.message });
  }
});

module.exports = router;
