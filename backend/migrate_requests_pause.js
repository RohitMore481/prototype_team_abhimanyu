const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'shopfloor.db');
const db = new Database(DB_PATH);

console.log('Starting migration to strictly allow "pause" in requests table...');

db.transaction(() => {
    // 1. Rename existing table
    db.exec('ALTER TABLE requests RENAME TO requests_old;');

    // 2. Create new table with updated CHECK constraint
    db.exec(`
    CREATE TABLE requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK(type IN ('break', 'breakdown', 'pause')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

    // 3. Copy data
    db.exec(`
    INSERT INTO requests (id, user_id, type, status, data, created_at, updated_at)
    SELECT id, user_id, type, status, data, created_at, updated_at FROM requests_old;
  `);

    // 4. Drop old table
    db.exec('DROP TABLE requests_old;');
})();

console.log('Migration completed successfully!');
