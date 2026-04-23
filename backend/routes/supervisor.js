const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET recent logout alerts for supervisors
router.get('/alerts', auth, (req, res) => {
    if (req.user.role !== 'supervisor' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    const { status, workerId } = req.query;

    try {
        let projectId = req.user.project_id;
        let isScoped = false;

        if (req.user.role === 'supervisor') {
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

        let query = `SELECT a.* FROM alerts a JOIN users u ON a.worker_id = u.id WHERE 1=1`;
        const params = [];

        if (isScoped) {
            query += ` AND u.project_id = ?`;
            params.push(projectId);
        }

        if (status === 'active') {
            query += ` AND a.status = 'unread'`;
        } else if (status === 'resolved') {
            query += ` AND a.status = 'reviewed'`;
        }

        if (workerId) {
            query += ` AND a.worker_id = ?`;
            params.push(workerId);
        }

        query += ` ORDER BY a.timestamp DESC LIMIT 50`;

        const alerts = db.prepare(query).all(...params);
        res.json(alerts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch supervisor alerts: ' + err.message });
    }
});

// PUT resolve an alert
router.put('/alerts/:id/resolve', auth, (req, res) => {
    if (req.user.role !== 'supervisor' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const result = db.prepare("UPDATE alerts SET status = 'reviewed' WHERE id = ?").run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Alert not found' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to resolve alert: ' + err.message });
    }
});

module.exports = router;
