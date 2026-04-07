const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

/**
 * Weekly Performance Report
 */
router.get('/weekly', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  // Metrics for last 7 days vs previous 7 days
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const getStats = (start, end) => {
    return db.prepare(`
      SELECT 
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed,
        AVG(CASE WHEN status = 'completed' THEN expected_minutes ELSE NULL END) as avg_expected,
        AVG(CASE WHEN status = 'completed' THEN (strftime('%s', completed_at) - strftime('%s', started_at))/60 ELSE NULL END) as avg_actual
      FROM tasks
      WHERE created_at BETWEEN ? AND ?
    `).get(start, end);
  };

  const currentStats = getStats(weekAgo, now.toISOString());
  const previousStats = getStats(twoWeeksAgo, weekAgo);

  // Daily trend
  const dailyTrend = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM tasks
    WHERE created_at >= ?
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all(weekAgo);

  res.json({
    current: currentStats,
    previous: previousStats,
    dailyTrend
  });
});

/**
 * Monthly Performance Report
 */
router.get('/monthly', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const now = new Date();
  const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()).toISOString();

  const getStats = (start, end) => {
    return db.prepare(`
      SELECT 
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed,
        AVG(CASE WHEN status = 'completed' THEN (strftime('%s', completed_at) - strftime('%s', started_at))/60 ELSE NULL END) as avg_completion_time
      FROM tasks
      WHERE created_at BETWEEN ? AND ?
    `).get(start, end);
  };

  const currentStats = getStats(monthAgo, now.toISOString());
  
  // Machine Utilization (Simplified: Tasks per machine)
  const machineUtilization = db.prepare(`
    SELECT m.name, COUNT(t.id) as task_count, SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM machines m
    LEFT JOIN tasks t ON t.machine_id = m.id AND t.created_at >= ?
    GROUP BY m.id
  `).all(monthAgo);

  res.json({
    current: currentStats,
    machineUtilization
  });
});

/**
 * Collective Worker Performance
 */
router.get('/workers', auth, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') return res.status(403).json({ error: 'Unauthorized' });

  const workers = db.prepare(`
    SELECT 
      u.id,
      u.name as worker_name,
      u.status,
      COUNT(t.id) as total_tasks,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN t.status = 'delayed' THEN 1 ELSE 0 END) as delayed,
      AVG(CASE WHEN t.status = 'completed' THEN (strftime('%s', t.completed_at) - strftime('%s', t.started_at))/60 ELSE NULL END) as avg_completion_time
    FROM users u
    LEFT JOIN tasks t ON t.assigned_worker_id = u.id
    WHERE u.role = 'worker'
    GROUP BY u.id
  `).all();

  res.json(workers);
});

/**
 * Individual Worker Performance (Daily/Weekly Trends) - ADMIN ONLY
 */
router.get('/worker/:id', auth, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') return res.status(403).json({ error: 'Unauthorized' });

  const targetId = parseInt(req.params.id);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();

  // 1. Daily Trend
  const dailyTrend = db.prepare(`
    SELECT DATE(completed_at) as date, COUNT(*) as count
    FROM tasks
    WHERE assigned_worker_id = ? AND status = 'completed' AND completed_at >= ?
    GROUP BY DATE(completed_at)
    ORDER BY date ASC
  `).all(targetId, weekAgo);

  // 2. Weekly Trend
  const weeklyTrend = db.prepare(`
    SELECT strftime('%W', completed_at) as week_num, COUNT(*) as count
    FROM tasks
    WHERE assigned_worker_id = ? AND status = 'completed' AND completed_at >= ?
    GROUP BY week_num
    ORDER BY week_num ASC
  `).all(targetId, monthAgo);

  // 3. Monthly Trend (Last 6 Months)
  const monthlyTrend = db.prepare(`
    SELECT strftime('%Y-%m', completed_at) as month, COUNT(*) as count
    FROM tasks
    WHERE assigned_worker_id = ? AND status = 'completed' AND completed_at >= ?
    GROUP BY month
    ORDER BY month ASC
  `).all(targetId, sixMonthsAgo);

  // 4. Activity Logs (Last 10)
  const activityLogs = db.prepare(`
    SELECT 
      l.action, 
      l.timestamp, 
      l.note,
      t.title as task_title
    FROM task_logs l
    JOIN tasks t ON l.task_id = t.id
    WHERE l.performed_by = ?
    ORDER BY l.timestamp DESC
    LIMIT 10
  `).all(targetId);

  // 5. Collective
  const collective = db.prepare(`
    SELECT 
      COUNT(*) as total_tasks,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed,
      AVG(CASE WHEN status = 'completed' THEN (strftime('%s', completed_at) - strftime('%s', started_at))/60 ELSE NULL END) as avg_time
    FROM tasks
    WHERE assigned_worker_id = ?
  `).get(targetId);

  res.json({ dailyTrend, weeklyTrend, monthlyTrend, activityLogs, collective });
});

module.exports = router;
