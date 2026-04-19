const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, 'shopfloor.db');
const db = new Database(DB_PATH);

try {
    db.exec("ALTER TABLE tasks ADD COLUMN total_elapsed_seconds INTEGER DEFAULT 0");
    console.log('Added total_elapsed_seconds to tasks');
} catch (e) {
    if (e.message.includes('duplicate column name')) {
        console.log('total_elapsed_seconds already exists');
    } else {
        console.error(e);
    }
}

try {
    db.exec("ALTER TABLE tasks ADD COLUMN last_action_at DATETIME");
    console.log('Added last_action_at to tasks');
} catch (e) {
    if (e.message.includes('duplicate column name')) {
        console.log('last_action_at already exists');
    } else {
        console.error(e);
    }
}
