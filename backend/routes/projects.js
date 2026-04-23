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

function recordMachineAssignment(machineId, projectId) {
    try {
        db.prepare('INSERT INTO machine_project_history (machine_id, project_id) VALUES (?, ?)').run(machineId, projectId);
    } catch (e) { }
}

function recordMachineUnassignment(machineId, projectId) {
    try {
        db.prepare('UPDATE machine_project_history SET unassigned_at = CURRENT_TIMESTAMP WHERE machine_id = ? AND project_id = ? AND unassigned_at IS NULL').run(machineId, projectId);
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
            query += ` WHERE p.id IN (
                SELECT project_id FROM user_project_history WHERE user_id = ?
                UNION
                SELECT project_id FROM users WHERE id = ? AND project_id IS NOT NULL
            )`;
            params.push(req.user.id, req.user.id);
        }

        query += " ORDER BY p.created_at DESC";
        const projects = db.prepare(query).all(...params);
        res.json(projects);
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/my-history', auth, (req, res) => {
    try {
        let query;
        let params = [req.user.id];

        if (req.user.role === 'admin') {
            query = `
                SELECT 
                    p.id as project_id, 
                    p.name as project_name, 
                    p.description as project_description,
                    p.created_at as assigned_at, -- Using project creation as start for admin view
                    NULL as unassigned_at,
                    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'completed') as completedTasks
                FROM projects p
                WHERE p.status = 'completed'
                ORDER BY p.created_at DESC
            `;
            params = [];
        } else if (req.user.role === 'supervisor') {
            query = `
                SELECT h.*, p.name as project_name, p.description as project_description,
                    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'completed') as completedTasks,
                    (SELECT SUM(COALESCE(credit_value, 1)) FROM tasks t WHERE t.project_id = p.id AND t.status = 'completed') as collectedCredits
                FROM user_project_history h
                JOIN projects p ON h.project_id = p.id
                WHERE h.user_id = ?
                ORDER BY h.assigned_at DESC
            `;
            params = [req.user.id];
        } else {
            query = `
                SELECT h.*, p.name as project_name, p.description as project_description,
                    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.assigned_worker_id = h.user_id AND t.status = 'completed') as completedTasks,
                    (SELECT SUM(COALESCE(credit_value, 1)) FROM tasks t WHERE t.project_id = p.id AND t.assigned_worker_id = h.user_id AND t.status = 'completed') as collectedCredits
                FROM user_project_history h
                JOIN projects p ON h.project_id = p.id
                WHERE h.user_id = ?
                ORDER BY h.assigned_at DESC
            `;
            params = [req.user.id];
        }
        const history = db.prepare(query).all(...params);
        res.json(history);
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});


// GET project details
router.get('/:id', auth, (req, res) => {
    try {
        const projectId = req.params.id;

        if (req.user.role === 'worker' || req.user.role === 'supervisor') {
            const isAssigned = Number(projectId) === Number(req.user.project_id);
            const inHistory = db.prepare('SELECT id FROM user_project_history WHERE user_id = ? AND project_id = ?').get(req.user.id, projectId);

            if (!isAssigned && !inHistory) {
                return res.status(403).json({ error: 'Access denied: You can only view details for projects you are or were assigned to.' });
            }
        }

        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (!project) return res.status(404).json({ error: 'Project find failed' });

        const users = db.prepare('SELECT id, name, email, role, status, profile_picture FROM users WHERE project_id = ?').all(project.id);
        const workers = users.filter(u => u.role === 'worker');
        const supervisors = users.filter(u => u.role === 'supervisor');

        let machines = db.prepare('SELECT id, name, type, status FROM machines WHERE project_id = ?').all(project.id);
        let tasks = db.prepare('SELECT id, title, status, priority, started_at, completed_at, expected_minutes, assigned_worker_id, credit_value FROM tasks WHERE project_id = ?').all(project.id);

        let detailedTasks = db.prepare(`
            SELECT t.*, u.name as worker_name 
            FROM tasks t 
            LEFT JOIN users u ON t.assigned_worker_id = u.id 
            WHERE t.project_id = ?
        `).all(project.id);

        let taskLogs = db.prepare(`
            SELECT tl.*, u.name as user_name, t.title as task_title
            FROM task_logs tl
            JOIN tasks t ON tl.task_id = t.id
            LEFT JOIN users u ON tl.performed_by = u.id
            WHERE t.project_id = ?
            ORDER BY tl.timestamp DESC
        `).all(project.id);

        // Scope to worker
        if (req.user.role === 'worker') {
            tasks = tasks.filter(t => t.assigned_worker_id === req.user.id);
            detailedTasks = detailedTasks.filter(t => t.assigned_worker_id === req.user.id);
            taskLogs = taskLogs.filter(l => l.performed_by === req.user.id);
            machines = []; // Workers don't need machine tracking details here
        }

        // Fetch user history for the project
        const userHistory = db.prepare(`
            SELECT h.*, u.name, u.role, u.profile_picture 
            FROM user_project_history h
            JOIN users u ON h.user_id = u.id
            WHERE h.project_id = ?
        `).all(project.id);

        // Fetch machine history for the project
        const machineHistory = db.prepare(`
            SELECT h.*, m.name, m.type
            FROM machine_project_history h
            JOIN machines m ON h.machine_id = m.id
            WHERE h.project_id = ?
        `).all(project.id);

        // Calculate Stats
        const stats = {
            taskCounts: {
                total: tasks.length,
                completed: tasks.filter(t => t.status === 'completed').length,
                delayed: tasks.filter(t => t.status === 'delayed').length,
            },
            teamSize: new Set(userHistory.map(h => h.user_id)).size,
            machineUsage: new Set(machineHistory.map(h => h.machine_id)).size,
            efficiency: 0, // Percetange of tasks completed within/under expected time
        };

        if (stats.taskCounts.completed > 0) {
            const completedWithTime = tasks.filter(t => t.status === 'completed' && t.started_at && t.completed_at);
            if (completedWithTime.length > 0) {
                let totalActualMins = 0;
                let totalExpectedMins = 0;
                completedWithTime.forEach(t => {
                    const actual = Math.max(1, (new Date(t.completed_at) - new Date(t.started_at)) / 60000); // Min 1 min
                    totalActualMins += actual;
                    totalExpectedMins += t.expected_minutes;
                });
                stats.efficiency = totalActualMins > 0 ? Math.min(100, Math.round((totalExpectedMins / totalActualMins) * 100)) : 100;
            } else {
                stats.efficiency = 100; // Default
            }
        }

        res.json({
            ...project,
            workers,
            supervisors,
            machines,
            tasks,
            detailedTasks,
            taskLogs,
            userHistory,
            machineHistory,
            stats
        });

    } catch (err) {
        console.error('API Error:', err);
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
                    recordMachineAssignment(mid, projectId);
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
                const currentMachines = db.prepare("SELECT id FROM machines WHERE project_id = ?").all(projectId);
                const removedMachines = currentMachines.filter(cm => !machineIds.includes(cm.id));
                removedMachines.forEach(rm => recordMachineUnassignment(rm.id, projectId));

                db.prepare('UPDATE machines SET project_id = NULL WHERE project_id = ?').run(projectId);
                for (const mid of machineIds) {
                    db.prepare('UPDATE machines SET project_id = ? WHERE id = ?').run(projectId, mid);
                    const existing = db.prepare('SELECT id FROM machine_project_history WHERE machine_id = ? AND project_id = ? AND unassigned_at IS NULL').get(mid, projectId);
                    if (!existing) recordMachineAssignment(mid, projectId);
                }
            }

        });
        updateProj();
        res.json({ success: true });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/:id/complete
router.post('/:id/complete', auth, (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Only admins and supervisors can complete projects.' });

    const projectId = req.params.id;
    try {
        const incompleteTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status != 'completed'").get(projectId);
        if (incompleteTasks.count > 0) {
            return res.status(400).json({ error: 'Cannot complete project. All assigned tasks must be completed first.' });
        }

        const completeProj = db.transaction(() => {
            // Update project status
            db.prepare("UPDATE projects SET status = 'completed' WHERE id = ?").run(projectId);

            // Record unassignments for everyone
            const users = db.prepare('SELECT id FROM users WHERE project_id = ?').all(projectId);
            users.forEach(u => recordUnassignment(u.id, projectId));

            const machines = db.prepare('SELECT id FROM machines WHERE project_id = ?').all(projectId);
            machines.forEach(m => recordMachineUnassignment(m.id, projectId));

            // Actually unassign
            db.prepare('UPDATE users SET project_id = NULL WHERE project_id = ?').run(projectId);
            db.prepare('UPDATE machines SET project_id = NULL WHERE project_id = ?').run(projectId);

            // Notify everyone
            const proj = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
            const msg = `Project ${proj.name} has been marked as completed. All resources have been released.`;
            users.forEach(u => {
                createNotification(u.id, msg, 'success');
                emitNotification(req, u.id, msg, 'success');
            });
        });

        completeProj();
        res.json({ success: true });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE project
router.delete('/:id', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can delete projects.' });
    try {
        const projectId = req.params.id;

        const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const deleteProj = db.transaction(() => {
            db.prepare('DELETE FROM user_project_history WHERE project_id = ?').run(projectId);
            db.prepare('DELETE FROM machine_project_history WHERE project_id = ?').run(projectId);
            db.prepare('UPDATE users SET project_id = NULL WHERE project_id = ?').run(projectId);
            db.prepare('UPDATE machines SET project_id = NULL, status = \'idle\' WHERE project_id = ?').run(projectId);
            db.prepare('UPDATE tasks SET project_id = NULL WHERE project_id = ?').run(projectId);
            db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
        });

        deleteProj();
        res.json({ success: true });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST unassign specific user
router.post('/:id/unassign-user', auth, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const projectId = req.params.id;
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID is required' });

        db.prepare('UPDATE users SET project_id = NULL WHERE id = ? AND project_id = ?').run(userId, projectId);
        recordUnassignment(userId, projectId);

        const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
        const msg = `You have been unassigned from project: ${project?.name || 'Project'}`;
        createNotification(userId, msg, 'info');
        emitNotification(req, userId, msg, 'info');

        res.json({ success: true });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST unassign specific machine
router.post('/:id/unassign-machine', auth, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const projectId = req.params.id;
        const { machineId } = req.body;
        if (!machineId) return res.status(400).json({ error: 'Machine ID is required' });

        db.prepare('UPDATE machines SET project_id = NULL, status = \'idle\' WHERE id = ? AND project_id = ?').run(machineId, projectId);
        recordMachineUnassignment(machineId, projectId);

        res.json({ success: true });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});


// POST assign specific user
router.post('/:id/assign-user', auth, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const projectId = req.params.id;
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID is required' });

        db.prepare('UPDATE users SET project_id = ? WHERE id = ?').run(projectId, userId);
        recordAssignment(userId, projectId);

        const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
        const msg = `You have been assigned to project: ${project?.name || 'Project'}`;
        createNotification(userId, msg, 'info');
        emitNotification(req, userId, msg, 'info');

        res.json({ success: true });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST assign specific machine
router.post('/:id/assign-machine', auth, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const projectId = req.params.id;
        const { machineId } = req.body;

        if (!machineId) return res.status(400).json({ error: 'Machine ID is required' });

        const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        db.prepare('UPDATE machines SET project_id = ?, status = \'occupied\' WHERE id = ?').run(projectId, machineId);
        recordMachineAssignment(machineId, projectId);

        res.json({ success: true });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
