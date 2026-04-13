const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

const BREAK_DURATION_MINS = 30;
const BREAK_DURATION_MS = BREAK_DURATION_MINS * 60 * 1000;

function stopBreakInternal(userId, io) {
    const now = new Date().toISOString();
    let result = false;

    const transaction = db.transaction(() => {
        const currentBreak = db.prepare("SELECT * FROM break_logs WHERE user_id = ? AND end_time IS NULL").get(userId);
        if (!currentBreak) return;

        db.prepare("UPDATE users SET is_on_break = 0, status = 'idle', last_idle_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
        db.prepare("UPDATE break_logs SET end_time = ? WHERE id = ?").run(now, currentBreak.id);

        // Resume tasks
        if (currentBreak.paused_tasks) {
            try {
                const taskIds = JSON.parse(currentBreak.paused_tasks);
                for (const taskId of taskIds) {
                    const task = db.prepare("SELECT status FROM tasks WHERE id = ? AND assigned_worker_id = ?").get(taskId, userId);
                    if (task && task.status === 'paused') {
                        db.prepare("UPDATE tasks SET status = 'in_progress' WHERE id = ?").run(taskId);
                        db.prepare('INSERT INTO task_logs (task_id, action, note, performed_by) VALUES (?, ?, ?, ?)').run(taskId, 'resumed', 'Automatically resumed after break', userId);

                        // Set worker to busy if any task starts
                        db.prepare("UPDATE users SET status = 'busy' WHERE id = ?").run(userId);

                        if (io) {
                            const updatedTask = db.prepare(`SELECT t.*, u.name as worker_name, m.name as machine_name FROM tasks t LEFT JOIN users u ON t.assigned_worker_id = u.id LEFT JOIN machines m ON t.machine_id = m.id WHERE t.id = ?`).get(taskId);
                            io.emit('task:updated', updatedTask);
                        }
                    }
                }
            } catch (e) { console.error('Resume error:', e); }
        }
        result = true;
    });

    try {
        transaction();
        if (result && io) io.emit('user:status', { userId, is_on_break: 0, status: 'idle' });
        return result;
    } catch (err) {
        console.error('StopBreakInternal error:', err);
        return false;
    }
}

// GET break status for current user
router.get('/status', auth, (req, res) => {
    const userId = req.user.id;
    const user = db.prepare('SELECT is_on_break FROM users WHERE id = ?').get(userId);
    const breakToday = db.prepare("SELECT * FROM break_logs WHERE user_id = ? AND date = DATE('now', 'localtime') ORDER BY id DESC LIMIT 1").get(userId);

    // Auto-end check
    if (user.is_on_break && breakToday && !breakToday.end_time) {
        const elapsedMs = Date.now() - new Date(breakToday.start_time).getTime();
        if (elapsedMs >= BREAK_DURATION_MS) {
            stopBreakInternal(userId, req.app.get('io'));
            return res.json({ is_on_break: false, already_taken_today: true, current_break: null });
        }
    }

    res.json({
        is_on_break: !!user.is_on_break,
        already_taken_today: !!breakToday,
        current_break: breakToday && !breakToday.end_time ? breakToday : null,
        duration_mins: BREAK_DURATION_MINS
    });
});

// POST start break
router.post('/start', auth, (req, res) => {
    const userId = req.user.id;
    const io = req.app.get('io');
    const now = new Date().toISOString();

    // Check if already taken today
    const existing = db.prepare("SELECT id FROM break_logs WHERE user_id = ? AND date = DATE('now', 'localtime')").get(userId);
    if (existing) return res.status(400).json({ error: 'Break already taken today' });

    // Execute in transaction
    const transaction = db.transaction(() => {
        // 1. Find and Pause any active tasks
        const activeTasks = db.prepare("SELECT id FROM tasks WHERE assigned_worker_id = ? AND status = 'in_progress'").all(userId);
        const pausedTaskIds = activeTasks.map(t => t.id);

        for (const taskId of pausedTaskIds) {
            db.prepare("UPDATE tasks SET status = 'paused' WHERE id = ?").run(taskId);
            db.prepare('INSERT INTO task_logs (task_id, action, note, performed_by) VALUES (?, ?, ?, ?)').run(taskId, 'paused', 'Auto-paused for worker break', userId);

            if (io) {
                const updatedTask = db.prepare(`SELECT t.*, u.name as worker_name, m.name as machine_name FROM tasks t LEFT JOIN users u ON t.assigned_worker_id = u.id LEFT JOIN machines m ON t.machine_id = m.id WHERE t.id = ?`).get(taskId);
                io.emit('task:updated', updatedTask);
            }
        }

        // 2. Update user status
        db.prepare("UPDATE users SET is_on_break = 1, status = 'paused', last_idle_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId);

        // 3. Log break with paused task IDs
        db.prepare("INSERT INTO break_logs (user_id, start_time, paused_tasks) VALUES (?, ?, ?)").run(userId, now, JSON.stringify(pausedTaskIds));
    });

    try {
        transaction();
        if (io) io.emit('user:status', { userId, is_on_break: 1, status: 'paused' });

        // Set auto-end timeout
        setTimeout(() => stopBreakInternal(userId, io), BREAK_DURATION_MS);

        res.json({ success: true });
    } catch (err) {
        console.error('Break Start Error:', err);
        res.status(500).json({ error: 'Failed to start break' });
    }
});

// POST stop break
router.post('/stop', auth, (req, res) => {
    const success = stopBreakInternal(req.user.id, req.app.get('io'));
    if (success) res.json({ success: true });
    else res.status(500).json({ error: 'Failed to end break' });
});

module.exports = router;
