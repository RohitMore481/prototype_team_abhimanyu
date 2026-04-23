const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const creditService = require('../services/creditService');

// GET current user's credit summary
router.get('/summary', auth, async (req, res) => {
    try {
        await creditService.updateDailyActivity(req.user.id);
        const user = db.prepare('SELECT project_id, streak_count, last_active_at FROM users WHERE id = ?').get(req.user.id);

        let total_credits = 0;
        let today_credits = 0;

        if (user && user.project_id) {
            const sumRes = db.prepare(`
                SELECT 
                    SUM(CASE WHEN status = 'completed' THEN COALESCE(credit_value, 1) ELSE 0 END) as total,
                    SUM(CASE WHEN status = 'completed' AND date(completed_at) = date('now') THEN COALESCE(credit_value, 1) ELSE 0 END) as today
                FROM tasks
                WHERE assigned_worker_id = ? AND project_id = ?
            `).get(req.user.id, user.project_id);

            total_credits = sumRes.total || 0;
            today_credits = sumRes.today || 0;
        }

        res.json({
            summary: {
                total_credits,
                today_credits,
                streak_count: user?.streak_count || 0
            },
            recentLogs: []
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET leaderboard
router.get('/leaderboard', auth, (req, res) => {
    try {
        let projectId = req.user.project_id;
        let isScoped = false;

        if (req.user.role === 'supervisor' || req.user.role === 'worker') {
            const user = db.prepare('SELECT project_id FROM users WHERE id = ?').get(req.user.id);
            projectId = user ? user.project_id : null;
            isScoped = true;
        } else if (req.user.role === 'admin' && req.query.projectId) {
            projectId = req.query.projectId;
            isScoped = true;
        }

        if (isScoped && !projectId) {
            return res.json([]);
        }

        const leaderboard = db.prepare(`
          SELECT 
            u.id, 
            u.name, 
            u.profile_picture, 
            u.streak_count,
            SUM(CASE WHEN t.status = 'completed' THEN COALESCE(t.credit_value, 1) ELSE 0 END) as total_credits,
            SUM(CASE WHEN t.status = 'completed' AND date(t.completed_at) = date('now') THEN COALESCE(t.credit_value, 1) ELSE 0 END) as today_credits
          FROM users u
          JOIN tasks t ON t.assigned_worker_id = u.id
          WHERE u.role = 'worker'
          ${isScoped ? 'AND u.project_id = ? AND t.project_id = ?' : ''}
          GROUP BY u.id
          ORDER BY total_credits DESC
          LIMIT 10
        `).all(...(isScoped ? [projectId, projectId] : []));

        res.json(leaderboard);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST ping activity (optional dedicated endpoint)
router.post('/ping', auth, async (req, res) => {
    try {
        const result = await creditService.updateDailyActivity(req.user.id);
        res.json({ status: 'ok', ...result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
