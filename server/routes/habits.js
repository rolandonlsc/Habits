const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');

// GET all habits
router.get('/', async (req, res) => {
  try {
    const db = await getDatabase();
    const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC').all(req.user.id);
    res.json(habits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single habit
router.get('/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
    res.json(habit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create habit
router.post('/', async (req, res) => {
  try {
    const db = await getDatabase();
    const { name, description, color, icon, duration_minutes, days_of_week, priority } = req.body;
    const result = db.prepare(`
      INSERT INTO habits (user_id, name, description, color, icon, duration_minutes, days_of_week, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      name,
      description || '',
      color || '#6C5CE7',
      icon || '⭐',
      duration_minutes || 30,
      days_of_week || '1,2,3,4,5,6,0',
      priority || 'medium'
    );
    const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(habit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update habit
router.put('/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const { name, description, color, icon, duration_minutes, days_of_week, priority } = req.body;
    db.prepare(`
      UPDATE habits SET name = ?, description = ?, color = ?, icon = ?, 
      duration_minutes = ?, days_of_week = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(name, description, color, icon, duration_minutes, days_of_week, priority, Number(req.params.id), req.user.id);
    const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(Number(req.params.id));
    res.json(habit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE habit (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    db.prepare('UPDATE habits SET is_active = 0 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    res.json({ message: 'Habit deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST complete a habit for a date
router.post('/:id/complete', async (req, res) => {
  try {
    const db = await getDatabase();
    const { date, duration_minutes, notes } = req.body;
    const completedDate = date || new Date().toISOString().split('T')[0];
    
    // Verify habit belongs to user
    const habit = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!habit) return res.status(404).json({ error: 'Habit not found' });

    const existing = db.prepare(
      'SELECT * FROM habit_completions WHERE habit_id = ? AND user_id = ? AND completed_date = ?'
    ).get(Number(req.params.id), req.user.id, completedDate);

    if (existing) {
      db.prepare('DELETE FROM habit_completions WHERE id = ? AND user_id = ?').run(existing.id, req.user.id);
      res.json({ completed: false, date: completedDate });
    } else {
      db.prepare(`
        INSERT INTO habit_completions (habit_id, user_id, completed_date, duration_minutes, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(Number(req.params.id), req.user.id, completedDate, duration_minutes || 0, notes || '');
      res.json({ completed: true, date: completedDate });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET completions for a habit
router.get('/:id/completions', async (req, res) => {
  try {
    const db = await getDatabase();
    const { from, to } = req.query;
    let query = 'SELECT * FROM habit_completions WHERE habit_id = ? AND user_id = ?';
    const params = [Number(req.params.id), req.user.id];

    if (from && to) {
      query += ' AND completed_date BETWEEN ? AND ?';
      params.push(from, to);
    }
    query += ' ORDER BY completed_date DESC';

    const completions = db.prepare(query).all(...params);
    res.json(completions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
