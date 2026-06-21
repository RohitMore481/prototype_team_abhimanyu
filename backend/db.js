const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'shopfloor.db');
const db = new Database(DB_PATH);

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    odoo_id TEXT UNIQUE,
    customer TEXT,
    deadline TEXT,
    odoo_status TEXT,
    status TEXT DEFAULT 'in_progress',
    time_constraint_enabled INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','supervisor','worker','monitor')),
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','busy','paused')),
    is_on_break INTEGER DEFAULT 0,
    is_live INTEGER DEFAULT 0,
    shifts TEXT, -- JSON string of shift schedules
    shift_start_time DATETIME,
    last_idle_at DATETIME,
    profile_picture TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','occupied','running','breakdown')),
    last_active_at DATETIME,
    idle_since DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL,
    assigned_worker_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
    expected_minutes INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','paused','completed','delayed')),
    started_at DATETIME,
    completed_at DATETIME,
    deadline_at DATETIME,
    last_logout_reason TEXT,
    last_logout_time DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS break_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    date DATE DEFAULT (DATE('now', 'localtime')),
    paused_tasks TEXT
  );

  CREATE TABLE IF NOT EXISTS task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    action TEXT NOT NULL CHECK(action IN ('assigned','started','paused','resumed','completed','delayed','overridden')),
    pause_reason TEXT,
    note TEXT,
    performed_by INTEGER REFERENCES users(id),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info' CHECK(type IN ('info','warning','error','success')),
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK(type IN ('break', 'breakdown', 'pause')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    data TEXT, -- JSON string for additional context (e.g., machine_id, task_id)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_project_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    unassigned_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS machine_project_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id INTEGER NOT NULL REFERENCES machines(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    unassigned_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS logout_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    pending_tasks INTEGER,
    delayed_tasks INTEGER,
    reason TEXT NOT NULL,
    note TEXT,
    role TEXT NOT NULL DEFAULT 'worker',
    logout_time DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS shift_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    start_time DATETIME,
    end_time DATETIME,
    pending_tasks INTEGER,
    delayed_tasks INTEGER,
    reason TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL REFERENCES users(id),
    worker_name TEXT NOT NULL,
    pending_tasks INTEGER,
    delayed_tasks INTEGER,
    reason TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'reviewed')),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS production_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    quantity INTEGER DEFAULT 1,
    deadline TEXT,
    steps TEXT NOT NULL,       -- JSON: [{taskId, taskName, duration, dependsOn[]}]
    affinity TEXT,             -- JSON: stepAffinity from last simulation
    summary TEXT,              -- JSON: last simulation stats snapshot
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','completed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Track which plan step a plan-managed task belongs to
  -- (allows lazy dispatch of the next step when current completes)
  CREATE TABLE IF NOT EXISTS plan_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    step_id TEXT NOT NULL,     -- matches steps[].taskId from the plan
    unit_index INTEGER NOT NULL DEFAULT 1,
    worker_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','completed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assemblies (
    id TEXT PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    drawing_no TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sub_assemblies (
    id TEXT PRIMARY KEY,
    assembly_id TEXT NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    drawing_no TEXT,
    planned_hours REAL,
    material_status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS components (
    id TEXT PRIMARY KEY,
    sub_assembly_id TEXT NOT NULL REFERENCES sub_assemblies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity INTEGER,
    expected_arrival TEXT,
    status TEXT CHECK(status IN ('pending', 'arrived', 'delayed')),
    part_number TEXT,
    supplier TEXT,
    required_quantity INTEGER,
    available_quantity INTEGER,
    actual_arrival TEXT,
    inventory_status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS odoo_dependencies (
    from_sub_assembly_id TEXT NOT NULL REFERENCES sub_assemblies(id) ON DELETE CASCADE,
    to_sub_assembly_id TEXT NOT NULL REFERENCES sub_assemblies(id) ON DELETE CASCADE,
    PRIMARY KEY (from_sub_assembly_id, to_sub_assembly_id)
  );

  CREATE TABLE IF NOT EXISTS shopfloor_graph_overrides (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    from_sub_assembly_id TEXT NOT NULL REFERENCES sub_assemblies(id) ON DELETE CASCADE,
    to_sub_assembly_id TEXT NOT NULL REFERENCES sub_assemblies(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK(action IN ('add', 'remove')),
    PRIMARY KEY (project_id, from_sub_assembly_id, to_sub_assembly_id)
  );

  CREATE TABLE IF NOT EXISTS sub_assembly_execution (
    sub_assembly_id TEXT PRIMARY KEY REFERENCES sub_assemblies(id) ON DELETE CASCADE,
    assigned_worker_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'delayed')),
    progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
    delays TEXT,
    notes TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Run database migrations/schema updates for users (credits, project)
try { db.exec("ALTER TABLE users ADD COLUMN total_credits INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN today_credits INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN streak_count INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN last_active_at DATETIME"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL"); } catch (e) {}

// Create credit_logs table
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      task_id INTEGER REFERENCES tasks(id),
      action TEXT NOT NULL,
      credits INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
} catch (e) {}

// Create settings table (used by credit_settings route)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // Insert default credit settings if not already present
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('credits_per_task', '10');
  insertSetting.run('bonus_streak_threshold', '5');
  insertSetting.run('bonus_credits', '5');
  insertSetting.run('max_daily_credits', '100');
} catch (e) {}

// Run database migrations/schema updates for projects
try { db.exec("ALTER TABLE projects ADD COLUMN odoo_id TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE projects ADD COLUMN customer TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE projects ADD COLUMN deadline TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE projects ADD COLUMN odoo_status TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE projects ADD COLUMN time_constraint_enabled INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'in_progress'"); } catch (e) {}

// Run database migrations/schema updates for tasks (columns referenced by analytics queries)
try { db.exec("ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL"); } catch (e) {}
try { db.exec("ALTER TABLE tasks ADD COLUMN credit_value INTEGER DEFAULT 1"); } catch (e) {}
try { db.exec("ALTER TABLE tasks ADD COLUMN total_elapsed_seconds INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE tasks ADD COLUMN last_action_at DATETIME"); } catch (e) {}

// Run database migrations/schema updates for machines
try { db.exec("ALTER TABLE machines ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL"); } catch (e) {}

// Run database migrations/schema updates for components
try { db.exec("ALTER TABLE components ADD COLUMN part_number TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE components ADD COLUMN supplier TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE components ADD COLUMN required_quantity INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE components ADD COLUMN available_quantity INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE components ADD COLUMN actual_arrival TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE components ADD COLUMN inventory_status TEXT"); } catch (e) {}

const bcrypt = require('bcryptjs');
const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('Admin@123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Default Admin', 'admin@shopfloor.com', hash, 'admin');
}

module.exports = db;
