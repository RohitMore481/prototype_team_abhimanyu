const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const projectImportService = require('../services/projectImportService');

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
router.get('/', auth, async (req, res) => {
    try {
        // Auto project import & structure generation
        await projectImportService.sync();

        let query = `
            SELECT p.*,
                (SELECT COUNT(*) FROM users u WHERE u.project_id = p.id AND u.role = 'worker') as workerCount,
                (SELECT COUNT(*) FROM users u WHERE u.project_id = p.id AND u.role = 'supervisor') as supervisorCount,
                (SELECT COUNT(*) FROM machines m WHERE m.project_id = p.id) as machineCount,
                (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as taskCount,
                (SELECT COUNT(*) FROM assemblies a WHERE a.project_id = p.id) as totalAssemblies,
                (SELECT COUNT(*) FROM sub_assemblies sa JOIN assemblies a ON sa.assembly_id = a.id WHERE a.project_id = p.id) as totalSubAssemblies,
                (
                    SELECT CASE 
                        WHEN COUNT(sa.id) = 0 THEN 0 
                        ELSE ROUND(SUM(se.progress) * 1.0 / COUNT(sa.id)) 
                    END
                    FROM sub_assemblies sa 
                    JOIN assemblies a ON sa.assembly_id = a.id 
                    LEFT JOIN sub_assembly_execution se ON sa.id = se.sub_assembly_id
                    WHERE a.project_id = p.id
                ) as completionPercentage
            FROM projects p
        `;
        const params = [];

        if (req.user.role === 'worker') {
            query += ` WHERE p.id IN (
                SELECT project_id FROM users WHERE id = ? AND project_id IS NOT NULL
                UNION
                SELECT a.project_id 
                FROM assemblies a 
                JOIN sub_assemblies sa ON sa.assembly_id = a.id 
                JOIN sub_assembly_execution se ON se.sub_assembly_id = sa.id 
                WHERE se.assigned_worker_id = ?
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

        if (req.user.role === 'worker') {
            const isAssigned = Number(projectId) === Number(req.user.project_id);
            const inHistory = db.prepare('SELECT id FROM user_project_history WHERE user_id = ? AND project_id = ?').get(req.user.id, projectId);
            
            // Check if worker is assigned to any subassembly in this project
            const saAssigned = db.prepare(`
                SELECT 1 FROM sub_assemblies sa
                JOIN assemblies a ON sa.assembly_id = a.id
                JOIN sub_assembly_execution se ON sa.id = se.sub_assembly_id
                WHERE a.project_id = ? AND se.assigned_worker_id = ?
            `).get(projectId, req.user.id);

            if (!isAssigned && !inHistory && !saAssigned) {
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

        // Fetch Odoo Assemblies -> Subassemblies -> Components & execution details
        const assemblies = db.prepare('SELECT * FROM assemblies WHERE project_id = ?').all(project.id);
        for (const asm of assemblies) {
            asm.sub_assemblies = db.prepare(`
                SELECT sa.*, 
                       se.assigned_worker_id, 
                       u.name as workerName, 
                       se.status as executionStatus, 
                       se.progress, 
                       se.delays, 
                       se.notes 
                FROM sub_assemblies sa 
                LEFT JOIN sub_assembly_execution se ON sa.id = se.sub_assembly_id 
                LEFT JOIN users u ON se.assigned_worker_id = u.id 
                WHERE sa.assembly_id = ?
            `).all(asm.id);
            
            for (const sa of asm.sub_assemblies) {
                sa.components = db.prepare('SELECT * FROM components WHERE sub_assembly_id = ?').all(sa.id);
            }
        }

        // Calculate dependency status for sub-assemblies
        const odooDeps = db.prepare(`
            SELECT d.from_sub_assembly_id AS "from", d.to_sub_assembly_id AS "to"
            FROM odoo_dependencies d
            JOIN sub_assemblies sa1 ON d.from_sub_assembly_id = sa1.id
            JOIN assemblies a1 ON sa1.assembly_id = a1.id
            WHERE a1.project_id = ?
        `).all(project.id);

        const overrides = db.prepare(`
            SELECT from_sub_assembly_id AS "from", to_sub_assembly_id AS "to", action
            FROM shopfloor_graph_overrides
            WHERE project_id = ?
        `).all(project.id);

        const edges = [];
        for (const dep of odooDeps) {
            edges.push({ from: dep.from, to: dep.to });
        }
        for (const ov of overrides) {
            if (ov.action === 'remove') {
                const idx = edges.findIndex(e => e.from === ov.from && e.to === ov.to);
                if (idx !== -1) edges.splice(idx, 1);
            } else if (ov.action === 'add') {
                if (!edges.some(e => e.from === ov.from && e.to === ov.to)) {
                    edges.push({ from: ov.from, to: ov.to });
                }
            }
        }

        const allSubAssemblies = assemblies.flatMap(a => a.sub_assemblies);
        const saMap = {};
        allSubAssemblies.forEach(sa => {
            saMap[sa.id] = sa;
        });

        allSubAssemblies.forEach(sa => {
            const prerequisites = edges.filter(e => e.to === sa.id).map(e => e.from);
            if (prerequisites.length === 0) {
                sa.dependencyStatus = 'Ready';
            } else {
                let isBlocked = false;
                for (const prereqId of prerequisites) {
                    const prereqSa = saMap[prereqId];
                    if (prereqSa && prereqSa.executionStatus !== 'completed') {
                        isBlocked = true;
                        break;
                    }
                }
                sa.dependencyStatus = isBlocked ? 'Blocked' : 'Ready';
            }
        });

        let forecast = null;
        if (project.time_constraint_enabled === 1) {
            const NOW = new Date();
            const nowMs = NOW.getTime();

            const parseDbDate = (dateStr) => {
                if (!dateStr) return null;
                let d = new Date(dateStr);
                if (!isNaN(d.getTime())) return d;
                const formatted = dateStr.replace(' ', 'T') + 'Z';
                d = new Date(formatted);
                if (!isNaN(d.getTime())) return d;
                return null;
            };

            // 1. Build adjacency lists and compute in-degrees
            const adj = {};
            const inDegree = {};
            allSubAssemblies.forEach(sa => {
                adj[sa.id] = [];
                inDegree[sa.id] = 0;
            });

            edges.forEach(e => {
                if (adj[e.from] && inDegree[e.to] !== undefined) {
                    adj[e.from].push(e.to);
                    inDegree[e.to]++;
                }
            });

            // 2. Kahn's algorithm for topological sort
            const queue = [];
            allSubAssemblies.forEach(sa => {
                if (inDegree[sa.id] === 0) {
                    queue.push(sa.id);
                }
            });

            const order = [];
            while (queue.length > 0) {
                const u = queue.shift();
                order.push(u);
                (adj[u] || []).forEach(v => {
                    inDegree[v]--;
                    if (inDegree[v] === 0) {
                        queue.push(v);
                    }
                });
            }

            // Fallback for cycles to ensure all nodes are in order
            if (order.length < allSubAssemblies.length) {
                allSubAssemblies.forEach(sa => {
                    if (!order.includes(sa.id)) {
                        order.push(sa.id);
                    }
                });
            }

            // 3. Forward pass to calculate expected start and completion
            const workerEfficiencyCache = {};
            const getWorkerEfficiency = (workerId) => {
                if (!workerId) return 1.0;
                if (workerEfficiencyCache[workerId] !== undefined) {
                    return workerEfficiencyCache[workerId];
                }
                try {
                    const completedTasks = db.prepare(`
                        SELECT expected_minutes, started_at, completed_at 
                        FROM tasks 
                        WHERE assigned_worker_id = ? 
                          AND status = 'completed' 
                          AND started_at IS NOT NULL 
                          AND completed_at IS NOT NULL
                    `).all(workerId);

                    let efficiency = 1.0;
                    if (completedTasks.length > 0) {
                        let totalExpected = 0;
                        let totalActual = 0;
                        for (const t of completedTasks) {
                            const start = parseDbDate(t.started_at);
                            const comp = parseDbDate(t.completed_at);
                            if (start && comp) {
                                const actual = (comp - start) / 60000;
                                if (actual > 0) {
                                    totalExpected += t.expected_minutes;
                                    totalActual += actual;
                                }
                            }
                        }
                        if (totalActual > 0) {
                            efficiency = totalExpected / totalActual;
                        }
                    }
                    if (efficiency < 0.1) efficiency = 0.1;
                    if (efficiency > 5.0) efficiency = 5.0;
                    workerEfficiencyCache[workerId] = efficiency;
                    return efficiency;
                } catch (e) {
                    return 1.0;
                }
            };

            order.forEach(id => {
                const sa = saMap[id];
                if (!sa) return;

                if (sa.executionStatus === 'completed') {
                    const compDate = parseDbDate(sa.updated_at) || parseDbDate(project.created_at) || NOW;
                    sa.expectedStartDate = (parseDbDate(sa.created_at) || compDate).toISOString();
                    sa.expectedCompletionDate = compDate.toISOString();
                    sa.delayDays = 0;
                } else {
                    let startMs = nowMs;

                    if (sa.components && sa.components.length > 0) {
                        sa.components.forEach(comp => {
                            if (comp.status !== 'arrived' && comp.expected_arrival) {
                                const arrivalMs = new Date(comp.expected_arrival).getTime();
                                if (!isNaN(arrivalMs) && arrivalMs > startMs) {
                                    startMs = arrivalMs;
                                }
                            }
                        });
                    }

                    const saPrereqs = edges.filter(e => e.to === sa.id).map(e => e.from);
                    saPrereqs.forEach(prereqId => {
                        const prereqSa = saMap[prereqId];
                        if (prereqSa && prereqSa.expectedCompletionDate) {
                            const prereqCompMs = new Date(prereqSa.expectedCompletionDate).getTime();
                            if (!isNaN(prereqCompMs) && prereqCompMs > startMs) {
                                startMs = prereqCompMs;
                            }
                        }
                    });

                    const earliestStartDate = new Date(startMs);
                    sa.expectedStartDate = earliestStartDate.toISOString();

                    const efficiency = getWorkerEfficiency(sa.assigned_worker_id);
                    const progress = sa.progress || 0;
                    const remainingHours = (sa.planned_hours || 0) * (1 - progress / 100);
                    const adjustedDurationHours = remainingHours / efficiency;

                    const expectedCompletionDate = new Date(startMs + adjustedDurationHours * 60 * 60 * 1000);
                    sa.expectedCompletionDate = expectedCompletionDate.toISOString();

                    const baseDurationMs = (sa.planned_hours || 0) * (1 - progress / 100) * 60 * 60 * 1000;
                    const idealCompletionMs = nowMs + baseDurationMs;
                    const delayMs = Math.max(0, expectedCompletionDate.getTime() - idealCompletionMs);
                    sa.delayDays = Number((delayMs / (24 * 60 * 60 * 1000)).toFixed(1));
                }
            });

            // 4. Critical Path tracking
            const criticalPathNodes = new Set();
            let current = allSubAssemblies.reduce((maxNode, node) => {
                if (node.executionStatus === 'completed') return maxNode;
                if (!maxNode) return node;
                return new Date(node.expectedCompletionDate) > new Date(maxNode.expectedCompletionDate) ? node : maxNode;
            }, null);

            let criticalPathEnd = current;
            while (current) {
                criticalPathNodes.add(current.id);
                const prereqs = edges.filter(e => e.to === current.id).map(e => saMap[e.from]).filter(Boolean);
                if (prereqs.length === 0) break;
                let lastPrereq = prereqs.reduce((maxP, p) => {
                    if (!maxP) return p;
                    return new Date(p.expectedCompletionDate) > new Date(maxP.expectedCompletionDate) ? p : maxP;
                }, null);
                current = lastPrereq;
            }

            allSubAssemblies.forEach(sa => {
                sa.onCriticalPath = criticalPathNodes.has(sa.id);
            });

            // 5. Project-wide forecast
            let forecastCompletionDate = NOW.toISOString();
            if (criticalPathEnd && criticalPathEnd.expectedCompletionDate) {
                forecastCompletionDate = criticalPathEnd.expectedCompletionDate;
            }

            const deadlineDate = project.deadline ? new Date(project.deadline) : null;
            const isDelayed = deadlineDate ? new Date(forecastCompletionDate) > deadlineDate : false;
            
            const delayDaysTotal = deadlineDate 
                ? Math.max(0, (new Date(forecastCompletionDate) - deadlineDate) / (24 * 60 * 60 * 1000))
                : 0;

            let delayRisk = 'Low';
            if (isDelayed) {
                delayRisk = delayDaysTotal > 3 ? 'High' : 'Medium';
            }

            let materialDelayImpact = 'No material delays are impacting the critical path.';
            const criticalPathList = Array.from(criticalPathNodes).map(id => saMap[id]).filter(Boolean);
            const materialDelayedCP = [];
            criticalPathList.forEach(sa => {
                if (sa.components) {
                    sa.components.forEach(c => {
                        if (c.status !== 'arrived' && c.expected_arrival) {
                            const expected = new Date(c.expected_arrival);
                            if (expected > NOW) {
                                materialDelayedCP.push({ saName: sa.name, part: c.part_number || c.name, date: c.expected_arrival });
                            }
                        }
                    });
                }
            });
            if (materialDelayedCP.length > 0) {
                const first = materialDelayedCP[0];
                materialDelayImpact = `Material arrival for part ${first.part} (expected ${first.date}) is delaying sub-assembly "${first.saName}" on the critical path.`;
            }

            let workerCapacityImpact = 'Worker capacity is aligned with the critical path schedule.';
            const lowEfficiencyCP = [];
            criticalPathList.forEach(sa => {
                if (sa.assigned_worker_id) {
                    const efficiency = getWorkerEfficiency(sa.assigned_worker_id);
                    if (efficiency < 0.95) {
                        lowEfficiencyCP.push({ saName: sa.name, workerName: sa.workerName || 'worker', efficiency });
                    }
                }
            });
            if (lowEfficiencyCP.length > 0) {
                const first = lowEfficiencyCP[0];
                const pct = Math.round(first.efficiency * 100);
                workerCapacityImpact = `Worker capacity issue: ${first.workerName} (efficiency ${pct}%) is assigned to critical path sub-assembly "${first.saName}", extending its duration.`;
            }

            const bottleneckSummaries = criticalPathList
                .filter(sa => sa.delayDays > 0)
                .map(sa => ({
                    id: sa.id,
                    name: sa.name,
                    delayDays: sa.delayDays,
                    reason: sa.components && sa.components.some(c => c.status !== 'arrived' && new Date(c.expected_arrival) > NOW) 
                        ? 'Material Delay' 
                        : (sa.assigned_worker_id && getWorkerEfficiency(sa.assigned_worker_id) < 0.95 ? 'Worker Efficiency' : 'Prerequisite Dependency')
                }));

            forecast = {
                forecastCompletionDate,
                isDelayed,
                delayDaysTotal: Number(delayDaysTotal.toFixed(1)),
                delayRisk,
                materialDelayImpact,
                workerCapacityImpact,
                bottleneckSummaries
            };
        }

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
            efficiency: 0,
        };

        if (stats.taskCounts.completed > 0) {
            const completedWithTime = tasks.filter(t => t.status === 'completed' && t.started_at && t.completed_at);
            if (completedWithTime.length > 0) {
                let totalActualMins = 0;
                let totalExpectedMins = 0;
                completedWithTime.forEach(t => {
                    const start = parseDbDate(t.started_at);
                    const comp = parseDbDate(t.completed_at);
                    if (start && comp) {
                        const actual = Math.max(1, (comp - start) / 60000);
                        totalActualMins += actual;
                        totalExpectedMins += t.expected_minutes;
                    }
                });
                stats.efficiency = totalActualMins > 0 ? Math.min(100, Math.round((totalExpectedMins / totalActualMins) * 100)) : 100;
            } else {
                stats.efficiency = 100;
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
            stats,
            assemblies,
            forecast
        });

    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/projects/:id/settings
router.put('/:id/settings', auth, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
        return res.status(403).json({ error: 'Only admins and supervisors can modify project settings.' });
    }
    const projectId = req.params.id;
    const { timeConstraintEnabled } = req.body;

    try {
        db.prepare('UPDATE projects SET time_constraint_enabled = ? WHERE id = ?')
          .run(timeConstraintEnabled ? 1 : 0, projectId);
        res.json({ success: true, timeConstraintEnabled: !!timeConstraintEnabled });
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

        const unassignTx = db.transaction(() => {
            db.prepare('UPDATE users SET project_id = NULL WHERE id = ? AND project_id = ?').run(userId, projectId);
            recordUnassignment(userId, projectId);
            db.prepare(`
                UPDATE sub_assembly_execution
                SET assigned_worker_id = NULL
                WHERE assigned_worker_id = ? AND sub_assembly_id IN (
                    SELECT sa.id FROM sub_assemblies sa
                    JOIN assemblies a ON sa.assembly_id = a.id
                    WHERE a.project_id = ?
                )
            `).run(userId, projectId);
        });
        unassignTx();

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

// GET project dependency graph nodes and edges
router.get('/:id/dependencies', auth, (req, res) => {
    try {
        const projectId = req.params.id;

        // Fetch sub-assemblies as nodes
        const nodes = db.prepare(`
            SELECT sa.id, sa.name, sa.drawing_no, sa.planned_hours,
                   se.status as executionStatus, se.progress, 
                   se.assigned_worker_id, u.name as workerName
            FROM sub_assemblies sa
            JOIN assemblies a ON sa.assembly_id = a.id
            LEFT JOIN sub_assembly_execution se ON sa.id = se.sub_assembly_id
            LEFT JOIN users u ON se.assigned_worker_id = u.id
            WHERE a.project_id = ?
        `).all(projectId);

        // Fetch base Odoo dependencies
        const odooDeps = db.prepare(`
            SELECT d.from_sub_assembly_id AS "from", d.to_sub_assembly_id AS "to"
            FROM odoo_dependencies d
            JOIN sub_assemblies sa1 ON d.from_sub_assembly_id = sa1.id
            JOIN assemblies a1 ON sa1.assembly_id = a1.id
            WHERE a1.project_id = ?
        `).all(projectId);

        // Fetch custom overrides
        const overrides = db.prepare(`
            SELECT from_sub_assembly_id AS "from", to_sub_assembly_id AS "to", action
            FROM shopfloor_graph_overrides
            WHERE project_id = ?
        `).all(projectId);

        // Resolve dependencies
        const edges = [];
        for (const dep of odooDeps) {
            edges.push({ id: `e-${dep.from}-${dep.to}`, source: dep.from, target: dep.to, type: 'odoo' });
        }

        for (const ov of overrides) {
            if (ov.action === 'remove') {
                const idx = edges.findIndex(e => e.source === ov.from && e.target === ov.to);
                if (idx !== -1) edges.splice(idx, 1);
            } else if (ov.action === 'add') {
                if (!edges.some(e => e.source === ov.from && e.target === ov.to)) {
                    edges.push({ id: `e-${ov.from}-${ov.to}`, source: ov.from, target: ov.to, type: 'custom' });
                }
            }
        }

        res.json({ nodes, edges });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST add/remove a custom dependency override
router.post('/:id/dependencies', auth, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
        return res.status(403).json({ error: 'Only admins and supervisors can modify dependencies.' });
    }
    try {
        const projectId = req.params.id;
        const { action, fromSubAssemblyId, toSubAssemblyId } = req.body;

        if (!action || !fromSubAssemblyId || !toSubAssemblyId) {
            return res.status(400).json({ error: 'Missing required parameters: action, fromSubAssemblyId, toSubAssemblyId' });
        }

        if (action !== 'add' && action !== 'remove') {
            return res.status(400).json({ error: 'Invalid action. Must be "add" or "remove"' });
        }

        // Check if this dependency exists in base Odoo dependencies
        const odooExists = db.prepare(`
            SELECT 1 FROM odoo_dependencies 
            WHERE from_sub_assembly_id = ? AND to_sub_assembly_id = ?
        `).get(fromSubAssemblyId, toSubAssemblyId);

        if (odooExists) {
            if (action === 'remove') {
                // Remove base dependency: store 'remove' override
                db.prepare(`
                    INSERT OR REPLACE INTO shopfloor_graph_overrides (project_id, from_sub_assembly_id, to_sub_assembly_id, action)
                    VALUES (?, ?, ?, 'remove')
                `).run(projectId, fromSubAssemblyId, toSubAssemblyId);
            } else {
                // Re-add/restore base dependency: delete 'remove' override if it exists
                db.prepare(`
                    DELETE FROM shopfloor_graph_overrides
                    WHERE project_id = ? AND from_sub_assembly_id = ? AND to_sub_assembly_id = ? AND action = 'remove'
                `).run(projectId, fromSubAssemblyId, toSubAssemblyId);
            }
        } else {
            if (action === 'add') {
                // Add custom dependency: store 'add' override
                db.prepare(`
                    INSERT OR REPLACE INTO shopfloor_graph_overrides (project_id, from_sub_assembly_id, to_sub_assembly_id, action)
                    VALUES (?, ?, ?, 'add')
                `).run(projectId, fromSubAssemblyId, toSubAssemblyId);
            } else {
                // Remove custom dependency: delete 'add' override if it exists
                db.prepare(`
                    DELETE FROM shopfloor_graph_overrides
                    WHERE project_id = ? AND from_sub_assembly_id = ? AND to_sub_assembly_id = ? AND action = 'add'
                `).run(projectId, fromSubAssemblyId, toSubAssemblyId);
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT update execution layer details for a sub-assembly
router.put('/:id/subassemblies/:subAssemblyId', auth, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
        return res.status(403).json({ error: 'Only admins and supervisors can update execution status.' });
    }
    try {
        const { id: projectId, subAssemblyId } = req.params;
        const { assigned_worker_id, status, progress, delays, notes } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Execution status is required.' });
        }

        // Update the execution record
        db.prepare(`
            UPDATE sub_assembly_execution
            SET assigned_worker_id = ?, status = ?, progress = ?, delays = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE sub_assembly_id = ?
        `).run(assigned_worker_id || null, status, progress || 0, delays || '', notes || '', subAssemblyId);

        // Assign worker to project if they are assigned to this subassembly
        if (assigned_worker_id) {
            db.prepare('UPDATE users SET project_id = ? WHERE id = ?').run(projectId, assigned_worker_id);

            const inHistory = db.prepare(`
                SELECT 1 FROM user_project_history 
                WHERE user_id = ? AND project_id = ? AND unassigned_at IS NULL
            `).get(assigned_worker_id, projectId);

            if (!inHistory) {
                recordAssignment(assigned_worker_id, projectId);
            }

            const user = db.prepare('SELECT name FROM users WHERE id = ?').get(assigned_worker_id);
            const proj = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
            if (user && proj) {
                const msg = `You have been assigned to sub-assembly in project: ${proj.name}`;
                createNotification(assigned_worker_id, msg, 'success');
                emitNotification(req, assigned_worker_id, msg, 'success');
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
