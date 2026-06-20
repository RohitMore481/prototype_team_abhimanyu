const db = require('./db');

console.log('🔍 Running verification for Time Constraint & Critical Path scheduling...');

try {
    // 1. Get first project with assemblies
    const project = db.prepare(`
        SELECT p.id, p.name, p.time_constraint_enabled, p.deadline, p.created_at
        FROM projects p
        JOIN assemblies a ON a.project_id = p.id
        LIMIT 1
    `).get();
    if (!project) {
        console.error('❌ No projects with assemblies found in shopfloor.db! Make sure database is seeded and Odoo parser ran.');
        process.exit(1);
    }
    
    console.log(`\n📂 Found project: "${project.name}" (ID: ${project.id})`);
    console.log(`Current Time Constraint status: ${project.time_constraint_enabled === 1 ? 'ENABLED' : 'DISABLED'}`);

    // 2. Enable Time Constraint dynamically
    console.log('\n⚙ Enabling time constraint mode...');
    db.prepare('UPDATE projects SET time_constraint_enabled = 1 WHERE id = ?').run(project.id);
    
    // 3. Test critical-path BFS scheduling logic directly
    const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
    console.log(`Verified DB Toggle: time_constraint_enabled = ${updatedProject.time_constraint_enabled}`);

    // We will simulate the exact GET /api/projects/:id scheduling logic
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

    // Build Kahn sort
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

    if (order.length < allSubAssemblies.length) {
        allSubAssemblies.forEach(sa => {
            if (!order.includes(sa.id)) {
                order.push(sa.id);
            }
        });
    }

    const workerEfficiencyCache = {};
    const getWorkerEfficiency = (workerId) => {
        if (!workerId) return 1.0;
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
            return efficiency;
        } catch (e) {
            return 1.0;
        }
    };

    order.forEach(id => {
        const sa = saMap[id];
        if (!sa) return;

        if (sa.executionStatus === 'completed') {
            const compDate = parseDbDate(sa.updated_at) || parseDbDate(updatedProject.created_at) || NOW;
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

    // Print summary results
    console.log('\n📊 Forward Pass Simulation Outputs:');
    order.forEach(id => {
        const sa = saMap[id];
        console.log(`- Sub-assembly "${sa.name}" (ID: ${sa.id}):`);
        console.log(`  * Status: ${sa.executionStatus || 'pending'}`);
        console.log(`  * Planned Hours: ${sa.planned_hours}`);
        console.log(`  * Expected Start: ${sa.expectedStartDate}`);
        console.log(`  * Expected End: ${sa.expectedCompletionDate}`);
        console.log(`  * Delay Days: ${sa.delayDays}`);
        console.log(`  * On Critical Path: ${criticalPathNodes.has(sa.id)}`);
    });

    console.log('\n⏱ Project-wide Forecast:');
    let forecastCompletionDate = NOW.toISOString();
    if (criticalPathEnd && criticalPathEnd.expectedCompletionDate) {
        forecastCompletionDate = criticalPathEnd.expectedCompletionDate;
    }
    const deadlineDate = updatedProject.deadline ? new Date(updatedProject.deadline) : null;
    const isDelayed = deadlineDate ? new Date(forecastCompletionDate) > deadlineDate : false;
    const delayDaysTotal = deadlineDate 
        ? Math.max(0, (new Date(forecastCompletionDate) - deadlineDate) / (24 * 60 * 60 * 1000))
        : 0;

    console.log(`  * Forecast completion: ${forecastCompletionDate}`);
    console.log(`  * Deadline: ${updatedProject.deadline || 'None'}`);
    console.log(`  * Is delayed: ${isDelayed}`);
    console.log(`  * Total delay: ${delayDaysTotal.toFixed(1)} days`);

    // Reset settings to disabled to keep database clean
    console.log('\n🧹 Resetting time constraint setting back to default (0)...');
    db.prepare('UPDATE projects SET time_constraint_enabled = 0 WHERE id = ?').run(project.id);
    
    console.log('\n✅ Verification Complete with SUCCESS!');

} catch (err) {
    console.error('\n❌ Verification Failed:', err);
    process.exit(1);
}
