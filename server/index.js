const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Simple Auth Middleware
const requireAuth = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: Missing X-User-Id header' });
  }
  req.user = { id: Number(userId) };
  next();
};

// Routes
const authRouter = require('./routes/auth');
const habitsRouter = require('./routes/habits');
const tasksRouter = require('./routes/tasks');

app.use('/api/auth', authRouter);

// Protected routes below
// The completions/range route must be registered before the :id routes
app.get('/api/habits/completions/range', requireAuth, async (req, res) => {
  try {
    const db = await getDatabase();
    const { from, to } = req.query;
    const completions = db.prepare(`
      SELECT hc.*, h.name, h.color, h.icon 
      FROM habit_completions hc
      JOIN habits h ON h.id = hc.habit_id
      WHERE hc.user_id = ? AND hc.completed_date BETWEEN ? AND ?
      ORDER BY hc.completed_date ASC
    `).all(req.user.id, from, to);
    res.json(completions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/habits', requireAuth, habitsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);

// Stats endpoint
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const db = await getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const userId = req.user.id;

    const totalHabits = db.prepare('SELECT COUNT(*) as count FROM habits WHERE user_id = ? AND is_active = 1').get(userId);
    const todayCompletions = db.prepare('SELECT COUNT(*) as count FROM habit_completions WHERE user_id = ? AND completed_date = ?').get(userId, today);
    
    // For tasks, we consider 'closed' and 'completed'
    const pendingTasks = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND due_date = ? AND status NOT IN ('completed', 'closed')`).get(userId, today);
    const completedTasks = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND due_date = ? AND status IN ('completed', 'closed')`).get(userId, today);
    
    // Current streak calculation
    let streak = 0;
    const activeHabits = (totalHabits && totalHabits.count) || 0;
    if (activeHabits > 0) {
      let checkDate = new Date();
      while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        const dayResult = db.prepare('SELECT COUNT(*) as count FROM habit_completions WHERE user_id = ? AND completed_date = ?').get(userId, dateStr);
        const dayCompletions = (dayResult && dayResult.count) || 0;
        if (dayCompletions > 0) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    res.json({
      totalHabits: (totalHabits && totalHabits.count) || 0,
      todayCompletions: (todayCompletions && todayCompletions.count) || 0,
      pendingTasks: (pendingTasks && pendingTasks.count) || 0,
      completedTasks: (completedTasks && completedTasks.count) || 0,
      currentStreak: streak
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize DB then start server
async function start() {
  await getDatabase();
  app.listen(PORT, () => {
    console.log(`\n🚀 Habitos Tracker running at http://localhost:${PORT}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
