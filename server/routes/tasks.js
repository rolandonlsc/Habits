const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');

// GET all tasks
router.get('/', async (req, res) => {
  try {
    const db = await getDatabase();
    const { date, status } = req.query;
    let query = 'SELECT * FROM tasks WHERE user_id = ?';
    const params = [req.user.id];

    if (date) {
      query += ' AND due_date = ?';
      params.push(date);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ` ORDER BY due_date ASC, CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, created_at DESC`;

    const tasks = db.prepare(query).all(...params);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single task
router.get('/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create task
router.post('/', async (req, res) => {
  try {
    const db = await getDatabase();
    const { title, description, priority, label_color, due_date, due_time, status } = req.body;
    const result = db.prepare(`
      INSERT INTO tasks (user_id, title, description, priority, label_color, due_date, due_time, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      title,
      description || '',
      priority || 'medium',
      label_color || '#00B894',
      due_date || new Date().toISOString().split('T')[0],
      due_time || '',
      status || 'ready'
    );
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update task (full update or status update via drag&drop)
router.put('/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    
    // Check if task belongs to user
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    // Allow partial updates for drag and drop
    const updates = { ...existing, ...req.body };
    const completedAt = updates.status === 'completed' || updates.status === 'closed' 
      ? new Date().toISOString() 
      : null;

    db.prepare(`
      UPDATE tasks SET 
        title = ?, description = ?, priority = ?, label_color = ?,
        due_date = ?, due_time = ?, status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      updates.title, 
      updates.description, 
      updates.priority, 
      updates.label_color, 
      updates.due_date, 
      updates.due_time,
      updates.status,
      completedAt,
      Number(req.params.id), 
      req.user.id
    );
    
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(req.params.id));
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE task
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
