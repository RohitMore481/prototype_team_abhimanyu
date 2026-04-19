const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'shopfloor.db'));
const tableInfo = db.prepare("PRAGMA table_info(users)").all();
console.log(JSON.stringify(tableInfo, null, 2));
db.close();
