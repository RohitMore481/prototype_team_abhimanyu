const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

function createNotification(userId, message, type = 'info') {
    try {
        db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(userId, message, type);
    } catch (e) { }
}

function emitNotification(req, userId, message, type = 'info') {
    const io = req.app.get('io');
    if (io) io.to(`user_${userId}`).emit('notification:new', { message, type });
}

function recordAssignment(userId, projectId) {
    try {
        db.prepare('INSERT INTO user_project_history (user_id, project_id) VALUES (?, ?)').run(userId, projectId);
    } catch (e) { }
}

function recordUnassignment(userId, projectId) {
    try {
        db.prepare('UPDATE user_project_history SET unassigned_at = CURRENT_TIMESTAMP WHERE user_id = ? AND project_id = ? AND unassigned_at IS NULL').run(userId, projectId);
    } catch (e) { }
}

// GET all projects
router.get('/', auth, (req, res) => {
    try {
        let query = `
            SELECT p.*,
                (SELECT COUNT(*) FROM users u WHERE u.project_id = p.id AND u.role = 'worker') as workerCount,
                (SELECT COUNT(*) FROM users u WHERE u.project_id = p.id AND u.role = 'supervisor') as supervisorCount,
                (SELECT COUNT(*) FROM machines m WHERE m.project_id = p.id) as machineCount,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as taskCount
            FROM projects p
        `;
        const params = [];

        if (req.user.role === 'worker' || req.user.role === 'supervisor') {
            if (!req.user.project_id) return res.json([]);
            query += " WHERE p.id = ?";
            params.push(req.user.project_id);
        }

        query += " ORDER BY p.created_at DESC";
        const projects = db.prepare(query).all(...params);
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/projects/my-history (MUST BE BEFORE /:id)
router.get('/my-history', auth, (req, res) => {
    try {
        const history = db.prepare(`
            SELECT h.*, p.name as project_name, p.description as project_description,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.assigned_worker_id = h.user_id AND t.status = 'completed') as completedTasks
            FROM user_project_history h
            JOIN projects p ON h.project_id = p.id
            WHERE h.user_id = ?
            ORDER BY h.assigned_at DESC
        `).all(req.user.id);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET project details
router.get('/:id', auth, (req, res) => {
    try {
        const projectId = req.params.id;

        if (req.user.role === 'worker' || req.user.role === 'supervisor') {
            if (Number(projectId) !== Number(req.user.project_id)) {
                return res.status(403).json({ error: 'Access denied: You can only view details for your assigned project.' });
            }
        }

        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (!project) return res.status(404).json({ error: 'Project find failed' });

        const users = db.prepare('SELECT id, name, email, role, status, profile_picture FROM users WHERE project_id = ?').all(project.id);
        const workers = users.filter(u => u.role === 'worker');
        const supervisors = users.filter(u => u.role === 'supervisor');

        const machines = db.prepare('SELECT id, name, type, status FROM machines WHERE project_id = ?').all(project.id);
        const tasks = db.prepare('SELECT id, title, status, priority FROM tasks WHERE project_id = ?').all(project.id);

        res.json({ ...project, workers, supervisors, machines, tasks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create project
router.post('/', auth, (req, res) => {
    if (req.user.role === 'worker' || req.user.role === 'supervisor') return res.status(403).json({ error: 'Only admins can create projects.' });

    const { name, description, workerIds, supervisorIds, machineIds } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });

    try {
        let projectId;
        const createProj = db.transaction(() => {
            const result = db.prepare('INSERT INTO projects (name, description) VALUES (?, ?)').run(name, description);
            projectId = Number(result.lastInsertRowid);

            if (workerIds && Array.isArray(workerIds)) {
                for (const wid of workerIds) {
                    db.prepare('UPDATE users SET project_id = ? WHERE id = ?').run(projectId, wid);
                    recordAssignment(wid, projectId);
                    const msg = `You have been assigned to project: ${name}`;
                    createNotification(wid, msg, 'success');
                    emitNotification(req, wid, msg, 'success');
                }
            }

            if (supervisorIds && Array.isArray(supervisorIds)) {
                for (const sid of supervisorIds) {
                    db.prepare('UPDATE users SET project_id = ? WHERE id = ?').run(projectId, sid);
                    recordAssignment(sid, projectId);
                    const msg = `You have been assigned to lead project: ${name}`;
                    createNotification(sid, msg, 'success');
                    emitNotification(req, sid, msg, 'success');
                }
            }

            if (machineIds && Array.isArray(machineIds)) {
                for (const mid of machineIds) {
                    db.prepare('UPDATE machines SET project_id = ? WHERE id = ?').run(projectId, mid);
                }
            }
        });

        createProj();
        res.json({ id: projectId, name, description, success: true });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Project name already exists' });
        res.status(500).json({ error: err.message });
    }
});

// PUT update project (assign/unassign workers/machines)
router.put('/:id', auth, (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

    const projectId = Number(req.params.id);
    if (req.user.role === 'supervisor' && projectId !== Number(req.user.project_id)) {
        return res.status(403).json({ error: 'You can only update your own project.' });
    }

    const { name, description, workerIds, supervisorIds, machineIds } = req.body;

    try {
        const updateProj = db.transaction(() => {
            if (name || description) {
                db.prepare('UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?').run(name, description, projectId);
            }

            if (workerIds && Array.isArray(workerIds)) {
                const currentWorkers = db.prepare("SELECT id FROM users WHERE project_id = ? AND role = 'worker'").all(projectId);
                const removedWorkers = currentWorkers.filter(cw => !workerIds.includes(cw.id));
                removedWorkers.forEach(rw => recordUnassignment(rw.id, projectId));

                db.prepare("UPDATE users SET project_id = NULL WHERE project_id = ? AND role = 'worker'").run(projectId);
                for (const wid of workerIds) {
                    db.prepare('UPDATE users SET project_id = ? WHERE id = ?').run(projectId, wid);
                    const existing = db.prepare('SELECT id FROM user_project_history WHERE user_id = ? AND project_id = ? AND unassigned_at IS NULL').get(wid, projectId);
                    if (!existing) recordAssignment(wid, projectId);

                    const proj = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
                    if (proj) {
                        const msg = `You have been assigned to project: ${proj.name}`;
                        createNotification(wid, msg, 'success');
                        emitNotification(req, wid, msg, 'success');
                    }
                }
            }

            if (supervisorIds && Array.isArray(supervisorIds)) {
                const currentSupervisors = db.prepare("SELECT id FROM users WHERE project_id = ? AND role = 'supervisor'").all(projectId);
                const removedSupervisors = currentSupervisors.filter(cs => !supervisorIds.includes(cs.id));
                removedSupervisors.forEach(rs => recordUnassignment(rs.id, projectId));

                db.prepare("UPDATE users SET project_id = NULL WHERE project_id = ? AND role = 'supervisor'").run(projectId);
                for (const sid of supervisorIds) {
                    db.prepare('UPDATE users SET project_id = ? WHERE id = ?').run(projectId, sid);
                    const existing = db.prepare('SELECT id FROM user_project_history WHERE user_id = ? AND project_id = ? AND unassigned_at IS NULL').get(sid, projectId);
                    if (!existing) recordAssignment(sid, projectId);

                    const proj = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
                    if (proj) {
                        const msg = `You have been assigned to lead project: ${proj.name}`;
                        createNotification(sid, msg, 'success');
                        emitNotification(req, sid, msg, 'success');
                    }
                }
            }

            if (machineIds && Array.isArray(machineIds)) {
                db.prepare('UPDATE machines SET project_id = NULL WHERE project_id = ?').run(projectId);
                for (const mid of machineIds) {
                    db.prepare('UPDATE machines SET project_id = ? WHERE id = ?').run(projectId, mid);
                }
            }
        });
        updateProj();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE project
router.delete('/:id', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can delete projects.' });
    try {
        const projectId = req.params.id;
        db.prepare('UPDATE user_project_history SET unassigned_at = CURRENT_TIMESTAMP WHERE project_id = ? AND unassigned_at IS NULL').run(projectId);
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
