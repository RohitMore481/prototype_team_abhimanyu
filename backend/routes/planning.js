const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const auth = require('../middleware/auth');
const { parseExcel, generateSchedule, buildStepAffinity } = require('../services/schedulingService');

const upload = multer({ storage: multer.memoryStorage() });

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function createNotification(userId, message, type = 'info') {
    try {
        db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(userId, message, type);
    } catch (e) { }
}

/**
 * dispatchNextPlanTask
 * Strictly maintains a "Queue-of-2" (Active + Dispatched) for a worker.
 */
function dispatchNextPlanTask(planId, workerId, io) {
    try {
        const plan = db.prepare('SELECT * FROM production_plans WHERE id = ?').get(planId);
        if (!plan || plan.status !== 'active') return;

        // 1. Verify worker is LIVE
        const worker = db.prepare('SELECT is_live FROM users WHERE id = ?').get(workerId);
        if (!worker || !worker.is_live) return;

        // 2. Count current "Live" tasks (in progress or already dispatched to queue)
        const currentBuffer = db.prepare(`
            SELECT COUNT(*) as cnt FROM plan_tasks 
            WHERE plan_id = ? AND worker_id = ? AND status = 'active'
        `).get(planId, workerId).cnt;

        const slotsToFill = 2 - currentBuffer;
        if (slotsToFill <= 0) return;

        const steps = JSON.parse(plan.steps);
        const quantity = plan.quantity || 1;

        // 3. Find all PENDING tasks for this worker in this plan
        const pendingTasks = db.prepare(`
            SELECT * FROM plan_tasks 
            WHERE plan_id = ? AND worker_id = ? AND status = 'pending'
            ORDER BY unit_index ASC
        `).all(planId, workerId);

        let filled = 0;
        for (const pt of pendingTasks) {
            if (filled >= slotsToFill) break;

            const step = steps.find(s => String(s.taskId) === String(pt.step_id) || String(s.id) === String(pt.step_id));
            if (!step) continue;

            // 4. Dependency check: ALL prerequisite steps for THIS unit must be 'completed'
            const depsReady = (step.dependsOn || []).every(depId => {
                const depRow = db.prepare('SELECT status FROM plan_tasks WHERE plan_id = ? AND step_id = ? AND unit_index = ?').get(planId, depId, pt.unit_index);
                return depRow && depRow.status === 'completed';
            });

            if (!depsReady) continue;

            // 5. Dispatch!
            const taskTitle = `[Automation] ${step.taskName || step.name} (Unit ${pt.unit_index})`;
            const credits = Math.max(1, Math.round((step.duration || 30) / 10));

            const result = db.prepare(`
                INSERT INTO tasks (title, expected_minutes, assigned_worker_id, created_by, status, project_id, priority, parent_task_id, credit_value)
                VALUES (?, ?, ?, ?, 'not_started', ?, 'medium', ?, ?)
            `).run(taskTitle, step.duration, workerId, plan.created_by || workerId, plan.project_id, plan.master_task_id, credits);

            db.prepare("UPDATE plan_tasks SET task_id = ?, status = 'active' WHERE id = ?").run(result.lastInsertRowid, pt.id);

            createNotification(workerId, `📋 Next task assigned: ${taskTitle}`, 'info');
            if (io) {
                io.to(`user_${workerId}`).emit('notification:new', { message: `📋 Automation: ${taskTitle} assigned`, type: 'info' });
                const newTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
                io.emit('task:updated', newTask);
            }
            filled++;
        }

        // 6. Plan completion monitor
        const remaining = db.prepare("SELECT COUNT(*) as cnt FROM plan_tasks WHERE plan_id = ? AND status != 'completed'").get(planId);
        if (remaining.cnt === 0) {
            db.prepare("UPDATE production_plans SET status = 'completed' WHERE id = ?").run(planId);
            const supervisors = db.prepare("SELECT id FROM users WHERE project_id = ? AND role IN ('supervisor','admin')").all(plan.project_id);
            supervisors.forEach(s => {
                createNotification(s.id, `✅ Plan "${plan.name}" completed!`, 'success');
                if (io) io.to(`user_${s.id}`).emit('notification:new', { message: `✅ Plan "${plan.name}" completed!`, type: 'success' });
            });
        }
    } catch (err) {
        console.error('dispatchNextPlanTask error:', err.message);
    }
}

/**
 * checkGlobalUnblocks
 * Scans all workers in a plan to see if a just-completed task unblocked their next steps.
 */
function checkGlobalUnblocks(planId, io) {
    try {
        const workers = db.prepare('SELECT DISTINCT worker_id FROM plan_tasks WHERE plan_id = ?').all(planId);
        for (const w of workers) {
            dispatchNextPlanTask(planId, w.worker_id, io);
        }
    } catch (err) {
        console.error('checkGlobalUnblocks error:', err.message);
    }
}

/**
 * @route POST /api/planning/parse-excel
 * @desc Parse Excel file and return steps (for Design Phase)
 */
router.post('/parse-excel', auth, upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const steps = parseExcel(req.file.buffer);
        res.json(steps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route POST /api/planning/schedule
 * @desc Generate a production schedule from Excel upload OR direct JSON steps
 */
router.post('/schedule', auth, upload.single('file'), async (req, res) => {
    try {
        if (req.user.role === 'worker') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { quantity, deadline, project_id, steps: stepsRaw } = req.body;
        const steps = stepsRaw ? JSON.parse(stepsRaw) : null;

        if (!req.file && !steps) {
            return res.status(400).json({ error: 'Either an Excel file or manual steps are required.' });
        }
        if (!quantity || !deadline) {
            return res.status(400).json({ error: 'Quantity and deadline are required parameters.' });
        }

        let workers;
        const targetProjectId = project_id || req.user.project_id;
        if (targetProjectId) {
            workers = db.prepare(`
                SELECT u.id, u.name, u.shifts 
                FROM users u
                WHERE u.project_id = ? AND u.role = 'worker'
            `).all(targetProjectId);
        }

        if (!workers || workers.length === 0) {
            workers = db.prepare("SELECT id, name, shifts FROM users WHERE role = 'worker'").all();
        }

        if (workers.length === 0) {
            return res.status(400).json({ error: 'No available workers found in the system.' });
        }

        const workersWithShifts = workers.map(w => ({
            ...w,
            shifts: w.shifts ? JSON.parse(w.shifts) : []
        }));

        const result = await generateSchedule(
            req.file ? req.file.buffer : null,
            deadline,
            parseInt(quantity),
            steps,
            workersWithShifts
        );

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Planning Route Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────
// PLAN MANAGEMENT ROUTES
// ─────────────────────────────────────────────────────────

/**
 * @route POST /api/planning/plans
 * @desc Save a simulation result or a theoretical workflow
 */
router.post('/plans', auth, (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

    const { name, steps, affinity, summary, quantity, deadline, status } = req.body;
    if (!name || !steps) return res.status(400).json({ error: 'Name and steps are required' });

    const projectId = req.user.project_id || null;

    const result = db.prepare(`
        INSERT INTO production_plans (name, project_id, created_by, quantity, deadline, steps, affinity, summary, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        name,
        projectId,
        req.user.id,
        quantity || 1,
        deadline || null,
        JSON.stringify(steps),
        affinity ? JSON.stringify(affinity) : null,
        summary ? JSON.stringify(summary) : null,
        status || 'draft'
    );

    res.json({ success: true, id: result.lastInsertRowid, name });
});

/**
 * @route POST /api/planning/save
 * @desc Save a simulation result (legacy endpoint)
 */
router.post('/save', auth, (req, res) => {
    // Redirect to the new /plans endpoint logic or just keep as alias
    const { name, steps, affinity, summary, quantity, deadline } = req.body;
    const projectId = req.user.project_id || null;
    const result = db.prepare(`
        INSERT INTO production_plans (name, project_id, created_by, quantity, deadline, steps, affinity, summary, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(name, projectId, req.user.id, quantity || 1, deadline || null, JSON.stringify(steps), affinity ? JSON.stringify(affinity) : null, summary ? JSON.stringify(summary) : null);
    res.json({ success: true, id: result.lastInsertRowid, name });
});

/**
 * @route GET /api/planning/plans
 * @desc List saved plans for supervisor's project (or all for admin)
 */
router.get('/plans', auth, (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

    let plans;
    if (req.user.role === 'admin') {
        plans = db.prepare(`
            SELECT pp.*, u.name as creator_name FROM production_plans pp 
            LEFT JOIN users u ON pp.created_by = u.id
            ORDER BY pp.created_at DESC
        `).all();
    } else {
        if (!req.user.project_id) return res.json([]);
        plans = db.prepare(`
            SELECT pp.*, u.name as creator_name FROM production_plans pp 
            LEFT JOIN users u ON pp.created_by = u.id
            WHERE pp.project_id = ? OR pp.project_id IS NULL
            ORDER BY pp.created_at DESC
        `).all(req.user.project_id);
    }

    // Return compact list without full steps/summary JSON
    res.json(plans.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        quantity: p.quantity,
        deadline: p.deadline,
        project_id: p.project_id,
        creator_name: p.creator_name,
        created_at: p.created_at
    })));
});

/**
 * @route GET /api/planning/plans/:id
 * @desc Load full plan details (steps, affinity, summary)
 */
router.get('/plans/:id', auth, (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

    const plan = db.prepare('SELECT * FROM production_plans WHERE id = ?').get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    res.json({
        ...plan,
        steps: plan.steps ? JSON.parse(plan.steps) : [],
        affinity: plan.affinity ? JSON.parse(plan.affinity) : null,
        summary: plan.summary ? JSON.parse(plan.summary) : null
    });
});

/**
 * @route PUT /api/planning/plans/:id
 * @desc Update plan name, deadline, quantity, or steps (supervisor edits)
 */
router.put('/plans/:id', auth, (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

    const plan = db.prepare('SELECT * FROM production_plans WHERE id = ?').get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    if (plan.status === 'active') return res.status(400).json({ error: 'Cannot edit an active plan. Deactivate it first.' });

    const { name, deadline, quantity, steps, affinity } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (deadline !== undefined) updates.deadline = deadline;
    if (quantity !== undefined) updates.quantity = quantity;
    if (steps !== undefined) updates.steps = JSON.stringify(steps);
    if (affinity !== undefined) updates.affinity = JSON.stringify(affinity);

    if (Object.keys(updates).length === 0) return res.json({ success: true });

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE production_plans SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), plan.id);

    res.json({ success: true });
});

/**
 * @route POST /api/planning/plans/:id/activate
 * @desc Activate a plan: assign first ready task to each LIVE worker by affinity
 */
router.post('/plans/:id/activate', auth, (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

    const plan = db.prepare('SELECT * FROM production_plans WHERE id = ?').get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    if (plan.status === 'active') return res.status(400).json({ error: 'Plan is already active.' });

    const steps = JSON.parse(plan.steps);
    const quantity = plan.quantity || 1;
    const io = req.app.get('io');

    // Link plan to the supervisor's current project if not already set
    const projectId = plan.project_id || req.user.project_id;
    if (!projectId) return res.status(400).json({ error: 'Plan must be linked to a project.' });

    // Fetch LIVE workers for this project
    const liveWorkers = db.prepare(`
        SELECT id, name, shifts FROM users 
        WHERE project_id = ? AND role = 'worker' AND is_live = 1
    `).all(projectId).map(w => ({ ...w, shifts: w.shifts ? JSON.parse(w.shifts) : [] }));

    if (liveWorkers.length === 0) {
        return res.status(400).json({ error: 'No live workers available. Workers must be online (LIVE) before activating a plan.' });
    }

    // Build affinity or use saved one
    const affinityRaw = plan.affinity
        ? JSON.parse(plan.affinity)
        : buildStepAffinity(steps, liveWorkers);

    const activatePlan = db.transaction(() => {
        // 1. If there's an OLD master task, flush it and its subtasks first
        if (plan.master_task_id) {
            db.prepare('DELETE FROM tasks WHERE parent_task_id = ?').run(plan.master_task_id);
            db.prepare('DELETE FROM tasks WHERE id = ?').run(plan.master_task_id);
        }

        // 2. Create a NEW Master Task for this Automation
        const masterTaskTitle = `Automation: ${plan.name}`;
        const masterTaskResult = db.prepare(`
            INSERT INTO tasks (title, description, created_by, status, project_id, priority)
            VALUES (?, ?, ?, 'not_started', ?, 'high')
        `).run(masterTaskTitle, `Active Automation Plan #${plan.id}`, req.user.id, projectId);

        const masterTaskId = masterTaskResult.lastInsertRowid;

        // 3. Mark plan active and link to project & master task
        db.prepare("UPDATE production_plans SET status = 'active', project_id = ?, affinity = ?, master_task_id = ? WHERE id = ?")
            .run(projectId, JSON.stringify(affinityRaw), masterTaskId, plan.id);

        // 3. Clear any STALE plan_tasks rows for this plan (clean slate)
        db.prepare("DELETE FROM plan_tasks WHERE plan_id = ?").run(plan.id);

        // 4. Pre-populate plan_tasks rows for ALL steps × units (status = 'pending')
        for (const step of steps) {
            const stepId = step.taskId || step.id;
            const stepInfo = affinityRaw[stepId] || {};
            const workerIdsForStep = Array.isArray(stepInfo.workerIds)
                ? stepInfo.workerIds
                : (stepInfo.workerIds ? [stepInfo.workerIds] : []);

            for (const unitIdx of Array.from({ length: quantity }, (_, i) => i + 1)) {
                // Assign each unit to a worker in round-robin within the step workers
                const assignedWorkerId = workerIdsForStep.length > 0
                    ? workerIdsForStep[(unitIdx - 1) % workerIdsForStep.length]
                    : null;

                if (!assignedWorkerId) continue;

                db.prepare(`
                    INSERT OR IGNORE INTO plan_tasks (plan_id, step_id, unit_index, worker_id, status)
                    VALUES (?, ?, ?, ?, 'pending')
                `).run(plan.id, stepId, unitIdx, assignedWorkerId);
            }
        }
    });

    activatePlan();

    // Now dispatch first ready tasks to each live worker
    for (const worker of liveWorkers) {
        dispatchNextPlanTask(plan.id, worker.id, io);
    }

    res.json({ success: true, message: `Plan "${plan.name}" activated. Tasks dispatched to ${liveWorkers.length} live workers.` });
});

/**
 * @route POST /api/planning/plans/:id/discard
 * @desc Terminate an active plan, delete its tasks, and reset to draft
 */
router.post('/plans/:id/discard', auth, async (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

    const plan = db.prepare('SELECT * FROM production_plans WHERE id = ?').get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    try {
        const discardTransaction = db.transaction(() => {
            // 1. Get all task IDs associated with this plan
            const taskRows = db.prepare(`
                SELECT id FROM tasks WHERE id = ? OR parent_task_id = ?
                UNION
                SELECT task_id as id FROM plan_tasks WHERE plan_id = ? AND task_id IS NOT NULL
            `).all(plan.master_task_id, plan.master_task_id, plan.id);

            const taskIds = taskRows.map(r => r.id);

            if (taskIds.length > 0) {
                // 2. Delete logs for ALL these tasks
                const placeholders = taskIds.map(() => '?').join(',');
                db.prepare(`DELETE FROM task_logs WHERE task_id IN (${placeholders})`).run(...taskIds);
            }

            // 3. Clear dispatched queue first
            db.prepare('DELETE FROM plan_tasks WHERE plan_id = ?').run(plan.id);

            // 4. Delete the tasks themselves
            if (plan.master_task_id) {
                db.prepare('DELETE FROM tasks WHERE parent_task_id = ?').run(plan.master_task_id);
                db.prepare('DELETE FROM tasks WHERE id = ?').run(plan.master_task_id);
            }

            // 5. Reset plan status
            db.prepare("UPDATE production_plans SET status = 'draft', master_task_id = NULL WHERE id = ?").run(plan.id);
        });

        discardTransaction();
        res.json({ success: true, message: 'Automation discarded and plan reset to draft.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to discard plan: ' + err.message });
    }
});

/**
 * @route GET /api/planning/plans/:id/live-status
 * @desc Real-time plan progress: steps done, in-progress, projected completion
 */
router.get('/plans/:id/live-status', auth, (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

    const plan = db.prepare('SELECT * FROM production_plans WHERE id = ?').get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const planTaskRows = db.prepare(`
        SELECT pt.*, t.status as task_status, t.started_at, t.completed_at, t.expected_minutes,
               t.total_elapsed_seconds, t.last_action_at, u.name as worker_name
        FROM plan_tasks pt
        LEFT JOIN tasks t ON pt.task_id = t.id
        LEFT JOIN users u ON pt.worker_id = u.id
        WHERE pt.plan_id = ?
        ORDER BY pt.step_id, pt.unit_index
    `).all(plan.id);

    const steps = JSON.parse(plan.steps);

    // Per-step aggregates
    const stepStats = steps.map(step => {
        const rows = planTaskRows.filter(r => r.step_id === step.taskId);
        const completed = rows.filter(r => r.status === 'completed').length;
        const inProgress = rows.filter(r => r.status === 'active').length;
        const pending = rows.filter(r => r.status === 'pending').length;

        // Actual average minutes from completed tasks
        const completedTasks = rows.filter(r => r.task_status === 'completed' && r.started_at && r.completed_at);
        const avgActualMinutes = completedTasks.length > 0
            ? Math.round(completedTasks.reduce((sum, r) => {
                return sum + (new Date(r.completed_at) - new Date(r.started_at)) / 60000;
            }, 0) / completedTasks.length)
            : step.duration;

        return {
            stepId: step.taskId,
            stepName: step.taskName,
            expectedMinutes: step.duration,
            actualAvgMinutes: avgActualMinutes,
            completed,
            inProgress,
            pending,
            total: rows.length
        };
    });

    // Projected completion: sum remaining units × actual (or expected) duration per step
    let remainingMinutes = 0;
    for (const ss of stepStats) {
        remainingMinutes += (ss.inProgress + ss.pending) * ss.actualAvgMinutes;
    }

    const projectedCompletion = new Date(Date.now() + remainingMinutes * 60000).toISOString();
    const originalDeadline = plan.deadline;
    const isOnTrack = !originalDeadline || new Date(projectedCompletion) <= new Date(originalDeadline);

    res.json({
        planId: plan.id,
        name: plan.name,
        status: plan.status,
        deadline: plan.deadline,
        projectedCompletion,
        remainingMinutes,
        isOnTrack,
        slackMinutes: originalDeadline
            ? Math.round((new Date(originalDeadline) - new Date(projectedCompletion)) / 60000)
            : null,
        stepStats,
        workerTasks: planTaskRows.map(r => ({
            id: r.id,
            taskId: r.task_id,
            stepId: r.step_id,
            unitIndex: r.unit_index,
            workerName: r.worker_name,
            status: r.status,
            taskStatus: r.task_status
        }))
    });
});

/**
 * @route GET /api/planning/plans/:id/history
 * @desc Get consolidated history of all subtasks for a plan
 */
router.get('/plans/:id/history', auth, (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

    try {
        const logs = db.prepare(`
            SELECT tl.*, t.title as task_title, u.name as user_name
            FROM task_logs tl
            JOIN tasks t ON tl.task_id = t.id
            JOIN plan_tasks pt ON pt.task_id = t.id
            LEFT JOIN users u ON tl.performed_by = u.id
            WHERE pt.plan_id = ?
            ORDER BY tl.timestamp DESC
        `).all(req.params.id);

        res.json(logs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @route DELETE /api/planning/plans/:id
 * @desc Delete a draft plan
 */
router.delete('/plans/:id', auth, (req, res) => {
    if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });
    const plan = db.prepare('SELECT * FROM production_plans WHERE id = ?').get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    if (plan.status === 'active') return res.status(400).json({ error: 'Cannot delete an active plan.' });

    db.prepare('DELETE FROM production_plans WHERE id = ?').run(plan.id);
    res.json({ success: true });
});

module.exports = router;
router.dispatchNextPlanTask = dispatchNextPlanTask;
router.checkGlobalUnblocks = checkGlobalUnblocks;
