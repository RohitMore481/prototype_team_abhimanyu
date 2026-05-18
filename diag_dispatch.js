
const db = require('./backend/db');
const planning = require('./backend/routes/planning');

const planId = 3;
const workerId = 16; // John

console.log(`\n--- Diagnostic Dispatch for Plan ${planId}, Worker ${workerId} ---`);

try {
    const plan = db.prepare('SELECT * FROM production_plans WHERE id = ?').get(planId);
    console.log('Plan status:', plan?.status);

    const worker = db.prepare('SELECT is_live FROM users WHERE id = ?').get(workerId);
    console.log('Worker is_live:', worker?.is_live);

    const pending = db.prepare(`
        SELECT * FROM plan_tasks 
        WHERE plan_id = ? AND worker_id = ? AND status = 'pending'
    `).all(planId, workerId);
    console.log(`Found ${pending.length} pending tasks:`, pending.map(p => p.id));

    if (pending.length > 0) {
        const pt = pending[0];
        console.log(`Attempting to dispatch Row ID ${pt.id}, Step ${pt.step_id}`);

        // Mocking the dispatchNextPlanTask logic partially to see updates
        const steps = JSON.parse(plan.steps);
        const step = steps.find(s => String(s.taskId) === String(pt.step_id) || String(s.id) === String(pt.step_id));

        if (step) {
            console.log(`Step ${step.taskId} found. Dependency check...`);
            const depsReady = (step.dependsOn || []).every(depId => {
                const depRow = db.prepare('SELECT status FROM plan_tasks WHERE plan_id = ? AND step_id = ? AND unit_index = ?').get(planId, depId, pt.unit_index);
                return depRow && depRow.status === 'completed';
            });
            console.log('Deps ready:', depsReady);

            if (depsReady) {
                const taskTitle = `[Diag] ${step.taskName} (Unit ${pt.unit_index})`;
                const result = db.prepare(`
                    INSERT INTO tasks (title, expected_minutes, assigned_worker_id, created_by, status, project_id, priority, parent_task_id)
                    VALUES (?, ?, ?, ?, 'not_started', ?, 'medium', ?)
                `).run(taskTitle, step.duration, workerId, plan.created_by, plan.project_id, plan.master_task_id);

                console.log(`New Task Created: ID ${result.lastInsertRowid}`);

                const updateRes = db.prepare("UPDATE plan_tasks SET task_id = ?, status = 'active' WHERE id = ?").run(result.lastInsertRowid, pt.id);
                console.log('Update result details:', updateRes);

                const verify = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(pt.id);
                console.log('Verification After Update:', verify);
            }
        }
    }
} catch (err) {
    console.error('DIAGNOSTIC ERROR:', err.message);
}
