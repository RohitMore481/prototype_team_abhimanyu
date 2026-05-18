const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'shopfloor.db'));

console.log('🚀 Starting Database Migration for Automation Overhaul...');

try {
    db.transaction(() => {
        // Add parent_task_id to tasks
        try {
            db.exec('ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL');
            console.log('✅ Added parent_task_id to tasks table');
        } catch (e) {
            if (e.message.includes('duplicate column name')) {
                console.log('ℹ️ parent_task_id already exists in tasks table');
            } else {
                throw e;
            }
        }

        // Add master_task_id to production_plans
        try {
            db.exec('ALTER TABLE production_plans ADD COLUMN master_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL');
            console.log('✅ Added master_task_id to production_plans table');
        } catch (e) {
            if (e.message.includes('duplicate column name')) {
                console.log('ℹ️ master_task_id already exists in production_plans table');
            } else {
                throw e;
            }
        }
    })();
    console.log('🎉 Migration Successful!');
} catch (err) {
    console.error('❌ Migration Failed:', err);
} finally {
    db.close();
}
