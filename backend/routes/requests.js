const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// Helper to create notifications
function createNotification(userId, message, type = 'info') {
    try {
        db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(userId, message, type);
    } catch (e) { console.error('Notification error:', e); }
}

// GET all requests (Supervisor/Admin only)
router.get('/', auth, (req, res) => {
    if (req.user.role === 'worker') {
        // Workers can only see their own requests
        const requests = db.prepare(`
      SELECT r.*, u.name as user_name, u.profile_picture as user_picture
      FROM requests r 
      JOIN users u ON r.user_id = u.id 
      WHERE r.user_id = ? 
      ORDER BY r.created_at DESC
    `).all(req.user.id);
        return res.json(requests);
    }

    const requests = db.prepare(`
    SELECT r.*, u.name as user_name, u.profile_picture as user_picture
    FROM requests r 
    JOIN users u ON r.user_id = u.id 
    ORDER BY r.created_at DESC
  `).all();
    res.json(requests);
});

// POST a new request (Worker)
router.post('/', auth, (req, res) => {
    const { type, data } = req.body;
    const userId = req.user.id;

    if (!['break', 'breakdown'].includes(type)) {
        return res.status(400).json({ error: 'Invalid request type' });
    }

    // Check for existing pending request of same type
    const existing = db.prepare("SELECT id FROM requests WHERE user_id = ? AND type = ? AND status = 'pending'").get(userId, type);
    if (existing) {
        return res.status(400).json({ error: `You already have a pending ${type} request.` });
    }

    const result = db.prepare('INSERT INTO requests (user_id, type, data) VALUES (?, ?, ?)').run(userId, type, JSON.stringify(data || {}));
    const newRequest = db.prepare('SELECT r.*, u.name as user_name, u.profile_picture as user_picture FROM requests r JOIN users u ON r.user_id = u.id WHERE r.id = ?').get(result.lastInsertRowid);

    // Notify supervisors
    const supervisors = db.prepare("SELECT id FROM users WHERE role IN ('admin', 'supervisor')").all();
    const io = req.app.get('io');
    const message = `New ${type} request from ${req.user.name}`;

    supervisors.forEach(s => {
        createNotification(s.id, message, 'info');
        if (io) io.to(`user_${s.id}`).emit('notification:new', { message, type: 'info' });
    });

    if (io) io.emit('request:new', newRequest);

    res.json(newRequest);
});

// PUT update request status (Supervisor/Admin)
router.put('/:id', auth, (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

    const { status } = req.body;
    const requestId = req.params.id;

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request already processed' });

    const io = req.app.get('io');
    const now = new Date().toISOString();

    const transaction = db.transaction(() => {
        db.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?').run(status, now, requestId);

        if (status === 'approved') {
            if (request.type === 'break') {
                // Trigger break start logic
                const userId = request.user_id;
                const activeTasks = db.prepare("SELECT id FROM tasks WHERE assigned_worker_id = ? AND status = 'in_progress'").all(userId);
                const pausedTaskIds = activeTasks.map(t => t.id);

                for (const taskId of pausedTaskIds) {
                    db.prepare("UPDATE tasks SET status = 'paused' WHERE id = ?").run(taskId);
                    db.prepare('INSERT INTO task_logs (task_id, action, note, performed_by) VALUES (?, ?, ?, ?)').run(taskId, 'paused', 'Auto-paused for approved break', userId);
                    if (io) {
                        const updatedTask = db.prepare(`SELECT t.*, u.name as worker_name, m.name as machine_name FROM tasks t LEFT JOIN users u ON t.assigned_worker_id = u.id LEFT JOIN machines m ON t.machine_id = m.id WHERE t.id = ?`).get(taskId);
                        io.emit('task:updated', updatedTask);
                    }
                }

                db.prepare("UPDATE users SET is_on_break = 1, status = 'paused', last_idle_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
                db.prepare("INSERT INTO break_logs (user_id, start_time, paused_tasks) VALUES (?, ?, ?)").run(userId, now, JSON.stringify(pausedTaskIds));

                if (io) io.emit('user:status', { userId, is_on_break: 1, status: 'paused' });
            } else if (request.type === 'breakdown') {
                // Trigger breakdown logic
                const data = JSON.parse(request.data || '{}');
                const machineId = data.machine_id;
                if (machineId) {
                    db.prepare("UPDATE machines SET status = 'breakdown', idle_since = ? WHERE id = ?").run(now, machineId);
                    // Pause tasks on this machine
                    const tasksOnMachine = db.prepare("SELECT id FROM tasks WHERE machine_id = ? AND (status = 'in_progress' OR status = 'not_started')").all(machineId);
                    for (const task of tasksOnMachine) {
                        db.prepare("UPDATE tasks SET status = 'paused' WHERE id = ?").run(task.id);
                        db.prepare('INSERT INTO task_logs (task_id, action, note, performed_by) VALUES (?, ?, ?, ?)').run(task.id, 'paused', 'Machine breakdown reported', request.user_id);
                        if (io) {
                            const updatedTask = db.prepare(`SELECT t.*, u.name as worker_name, m.name as machine_name FROM tasks t LEFT JOIN users u ON t.assigned_worker_id = u.id LEFT JOIN machines m ON t.machine_id = m.id WHERE t.id = ?`).get(task.id);
                            io.emit('task:updated', updatedTask);
                        }
                    }
                    if (io) {
                        const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(machineId);
                        io.emit('machine:status', machine);
                    }
                }
            }
        }
    });

    try {
        transaction();
        const updatedRequest = db.prepare('SELECT r.*, u.name as user_name, u.profile_picture as user_picture FROM requests r JOIN users u ON r.user_id = u.id WHERE r.id = ?').get(requestId);

        // Notify user
        const msg = `Your ${request.type} request has been ${status}.`;
        createNotification(request.user_id, msg, status === 'approved' ? 'success' : 'warning');
        if (io) {
            io.to(`user_${request.user_id}`).emit('notification:new', { message: msg, type: status === 'approved' ? 'success' : 'warning' });
            io.emit('request:updated', updatedRequest);
        }

        res.json(updatedRequest);
    } catch (err) {
        console.error('Request Update Error:', err);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

module.exports = router;
