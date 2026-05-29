const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'habitos.db');

class DatabaseWrapper {
  constructor(db, dbPath) {
    this._db = db;
    this._dbPath = dbPath;
  }

  _save() {
    const data = this._db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this._dbPath, buffer);
  }

  exec(sql) {
    this._db.run(sql);
    this._save();
  }

  prepare(sql) {
    const db = this._db;
    const wrapper = this;
    return {
      run(...params) {
        const stmt = db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        stmt.step();
        stmt.free();
        wrapper._save();
        const lastId = db.exec("SELECT last_insert_rowid() as id")[0];
        const changes = db.getRowsModified();
        return {
          lastInsertRowid: lastId ? lastId.values[0][0] : 0,
          changes
        };
      },
      get(...params) {
        const stmt = db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        let result = null;
        if (stmt.step()) result = stmt.getAsObject();
        stmt.free();
        return result;
      },
      all(...params) {
        const stmt = db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        const results = [];
        while (stmt.step()) results.push(stmt.getAsObject());
        stmt.free();
        return results;
      }
    };
  }
}

let _dbInstance = null;

// Basic password hashing for simplicity (SHA256)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function getDatabase() {
  if (_dbInstance) return _dbInstance;

  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  _dbInstance = new DatabaseWrapper(db, DB_PATH);

  // Users Table
  _dbInstance._db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Habits Table (added user_id)
  _dbInstance._db.run(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#6C5CE7',
      icon TEXT DEFAULT '⭐',
      duration_minutes INTEGER DEFAULT 30,
      days_of_week TEXT DEFAULT '1,2,3,4,5,6,0',
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Habit Completions (added user_id)
  _dbInstance._db.run(`
    CREATE TABLE IF NOT EXISTS habit_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      completed_date TEXT NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      duration_minutes INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(habit_id, completed_date)
    )
  `);

  // Tasks Table (Kanban status + due_time + user_id)
  _dbInstance._db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
      label_color TEXT DEFAULT '#00B894',
      due_date TEXT NOT NULL,
      due_time TEXT DEFAULT '',
      status TEXT DEFAULT 'ready' CHECK(status IN ('on_hold', 'ready', 'in_progress', 'completed', 'closed')),
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  try {
    _dbInstance._db.run(`CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id)`);
    _dbInstance._db.run(`CREATE INDEX IF NOT EXISTS idx_habit_comps_user ON habit_completions(user_id)`);
    _dbInstance._db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id)`);
    _dbInstance._db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
    _dbInstance._db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`);
  } catch (e) { /* indices may already exist */ }

  _dbInstance._save();

  return _dbInstance;
}

module.exports = { getDatabase, hashPassword };
