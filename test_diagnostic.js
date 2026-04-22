const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'backend', 'shopfloor.db'));

try {
    // Try to find a project and a machine
    const project = db.prepare('SELECT id FROM projects LIMIT 1').get();
    const machine = db.prepare('SELECT id FROM machines LIMIT 1').get();

    if (!project || !machine) {
        console.log('No project or machine found to test with.');
        process.exit(0);
    }

    console.log(`Testing assignment for project ${project.id} and machine ${machine.id}`);

    // Simulate the update that might be failing
    const update = db.prepare('UPDATE machines SET project_id = ?, status = "occupied" WHERE id = ?');
    const result = update.run(project.id, machine.id);
    console.log('Update result:', result);

    // Simulate recordMachineAssignment
    const history = db.prepare('INSERT INTO machine_project_history (machine_id, project_id) VALUES (?, ?)');
    const histResult = history.run(machine.id, project.id);
    console.log('History result:', histResult);

    console.log('Mock test successful locally.');
} catch (err) {
    console.error('MOCK TEST ERROR:', err.message);
    if (err.stack) console.error(err.stack);
}
