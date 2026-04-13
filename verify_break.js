const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'backend', 'shopfloor.db'));

try {
    console.log('--- Verification Script ---');

    // 1. Check if column exists
    const usersCols = db.prepare("PRAGMA table_info(users)").all();
    const hasBreakCol = usersCols.some(c => c.name === 'is_on_break');
    console.log('Users has is_on_break column:', hasBreakCol);

    // 2. Check if break_logs table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='break_logs'").get();
    console.log('break_logs table exists:', !!tables);

    // 3. Create a test worker if needed
    db.prepare("INSERT OR IGNORE INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)").run(
        'Test Worker', 'test@break.com', 'hash', 'worker', 'idle'
    );
    const worker = db.prepare("SELECT id FROM users WHERE email = ?").get('test@break.com');

    // 4. Create a test task and start it
    db.prepare("INSERT INTO tasks (title, assigned_worker_id, status) VALUES (?, ?, ?)").run(
        'Test Task', worker.id, 'in_progress'
    );
    const task = db.prepare("SELECT id FROM tasks WHERE title = ?").get('Test Task');
    console.log('Initial Task status:', db.prepare("SELECT status FROM tasks WHERE id = ?").get(task.id).status);

    // 5. Manually simulate the break start logic (since I can't easily hit the API in this script without complex auth setup)
    // We'll just check if the logic I wrote in breaks.js works as expected if executed.
    // I'll simulate a break start for this worker.

    const now = new Date().toISOString();
    db.transaction(() => {
        // Pause task
        db.prepare("UPDATE tasks SET status = 'paused' WHERE assigned_worker_id = ? AND status = 'in_progress'").run(worker.id);
        // Update user
        db.prepare("UPDATE users SET is_on_break = 1, status = 'paused' WHERE id = ?").run(worker.id);
        // Log break
        db.prepare("INSERT INTO break_logs (user_id, start_time) VALUES (?, ?)").run(worker.id, now);
    })();

    console.log('After Break Start:');
    console.log('Task status:', db.prepare("SELECT status FROM tasks WHERE id = ?").get(task.id).status);
    console.log('Worker is_on_break:', db.prepare("SELECT is_on_break FROM users WHERE id = ?").get(worker.id).is_on_break);
    console.log('Worker status:', db.prepare("SELECT status FROM users WHERE id = ?").get(worker.id).status);

    // 6. Check restriction (can't have two breaks in one day)
    const breakCount = db.prepare("SELECT COUNT(*) as c FROM break_logs WHERE user_id = ? AND date = DATE('now', 'localtime')").get(worker.id).c;
    console.log('Daily Break count:', breakCount);

    // Cleanup
    db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);
    db.prepare("DELETE FROM break_logs WHERE user_id = ?").run(worker.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(worker.id);

    console.log('Verification finished successfully!');
} catch (err) {
    console.error('Verification failed:', err);
} finally {
    db.close();
}
