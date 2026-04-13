const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'shopfloor.db'));

try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const hasColumn = tableInfo.some(c => c.name === 'is_on_break');

    if (!hasColumn) {
        console.log('Adding is_on_break column to users table...');
        db.exec("ALTER TABLE users ADD COLUMN is_on_break INTEGER DEFAULT 0");
        console.log('Column added successfully.');
    } else {
        console.log('is_on_break column already exists.');
    }
} catch (err) {
    console.error('Migration failed:', err);
} finally {
    db.close();
}
