const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

/**
 * Weekly Performance Report
 */
router.get('/weekly', auth, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && req.user.role !== 'worker') return res.status(403).json({ error: 'Unauthorized' });

  let projectId = req.user.project_id;
  let isScoped = false;
  if (req.user.role === 'supervisor' || req.user.role === 'worker') {
    const user = db.prepare('SELECT project_id FROM users WHERE id = ?').get(req.user.id);
    projectId = user ? user.project_id : null;
    isScoped = true;
  } else if (req.user.role === 'admin' && req.query.projectId) {
    projectId = req.query.projectId;
    isScoped = true;
  }

  if (isScoped && !projectId) {
    return res.json({ current: {}, previous: {}, dailyTrend: [] });
  }

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
        SUM(CASE WHEN deadline_at IS NOT NULL AND status != 'not_started' AND (completed_at > deadline_at OR (completed_at IS NULL AND datetime('now') > deadline_at)) 
            THEN (strftime('%s', COALESCE(completed_at, datetime('now'))) - strftime('%s', deadline_at))/60 ELSE 0 END) as total_delay_mins,
        AVG(CASE WHEN status = 'completed' THEN expected_minutes ELSE NULL END) as avg_expected,
        AVG(CASE WHEN status = 'completed' THEN (strftime('%s', completed_at) - strftime('%s', started_at))/60 ELSE NULL END) as avg_actual
      FROM tasks
      WHERE (created_at BETWEEN ? AND ?)
      ${isScoped ? 'AND project_id = ?' : "AND project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    `).get(start, end, ...(isScoped ? [projectId] : []));
  };

  const currentStats = getStats(weekAgo, now.toISOString());
  const previousStats = getStats(twoWeeksAgo, weekAgo);

  // Daily trend
  const dailyTrend = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM tasks
    WHERE created_at >= ?
    ${isScoped ? 'AND project_id = ?' : "AND project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all(weekAgo, ...(isScoped ? [projectId] : []));

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
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && req.user.role !== 'worker') return res.status(403).json({ error: 'Unauthorized' });

  let projectId = req.user.project_id;
  let isScoped = false;
  if (req.user.role === 'supervisor' || req.user.role === 'worker') {
    const user = db.prepare('SELECT project_id FROM users WHERE id = ?').get(req.user.id);
    projectId = user ? user.project_id : null;
    isScoped = true;
  } else if (req.user.role === 'admin' && req.query.projectId) {
    projectId = req.query.projectId;
    isScoped = true;
  }

  if (isScoped && !projectId) {
    return res.json({ current: {}, machineUtilization: [] });
  }

  const now = new Date();
  const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();

  const getStats = (start, end) => {
    return db.prepare(`
      SELECT 
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed,
        SUM(CASE WHEN deadline_at IS NOT NULL AND status != 'not_started' AND (completed_at > deadline_at OR (completed_at IS NULL AND datetime('now') > deadline_at)) 
            THEN (strftime('%s', COALESCE(completed_at, datetime('now'))) - strftime('%s', deadline_at))/60 ELSE 0 END) as total_delay_mins,
        AVG(CASE WHEN status = 'completed' THEN (strftime('%s', completed_at) - strftime('%s', started_at))/60 ELSE NULL END) as avg_completion_time
      FROM tasks
      WHERE (created_at BETWEEN ? AND ?)
      ${isScoped ? 'AND project_id = ?' : "AND project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    `).get(start, end, ...(isScoped ? [projectId] : []));
  };

  const currentStats = getStats(monthAgo, now.toISOString());

  // Machine Utilization
  const machineUtilization = db.prepare(`
    SELECT m.name, COUNT(t.id) as task_count, SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM machines m
    LEFT JOIN tasks t ON t.machine_id = m.id AND t.created_at >= ? ${isScoped ? 'AND t.project_id = ?' : "AND t.project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    ${isScoped ? 'WHERE m.project_id = ?' : "WHERE m.project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    GROUP BY m.id
  `).all(monthAgo, ...(isScoped ? [projectId, projectId] : []));

  res.json({
    current: currentStats,
    machineUtilization
  });
});

/**
 * Collective Worker Performance
 */
router.get('/workers', auth, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && req.user.role !== 'worker') return res.status(403).json({ error: 'Unauthorized' });

  let projectId = req.user.project_id;
  let isScoped = false;
  if (req.user.role === 'supervisor' || req.user.role === 'worker') {
    const user = db.prepare('SELECT project_id FROM users WHERE id = ?').get(req.user.id);
    projectId = user ? user.project_id : null;
    isScoped = true;
  } else if (req.user.role === 'admin' && req.query.projectId) {
    projectId = req.query.projectId;
    isScoped = true;
  }

  if (isScoped && !projectId) {
    return res.json([]);
  }

  const workers = db.prepare(`
    SELECT 
      u.id,
      u.name as worker_name,
      u.status,
      u.is_on_break,
      u.profile_picture,
      SUM(CASE WHEN t.status = 'completed' THEN COALESCE(t.credit_value, 1) ELSE 0 END) as total_credits,
      COUNT(t.id) as total_tasks,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN t.status = 'delayed' THEN 1 ELSE 0 END) as delayed,
      SUM(CASE WHEN t.deadline_at IS NOT NULL AND t.status != 'not_started' AND (t.completed_at > t.deadline_at OR (t.completed_at IS NULL AND datetime('now') > t.deadline_at)) 
          THEN (strftime('%s', COALESCE(t.completed_at, datetime('now'))) - strftime('%s', t.deadline_at))/60 ELSE 0 END) as total_delay_mins,
      AVG(CASE WHEN t.status = 'completed' THEN (strftime('%s', t.completed_at) - strftime('%s', t.started_at))/60 ELSE NULL END) as avg_completion_time
    FROM users u
    LEFT JOIN tasks t ON t.assigned_worker_id = u.id ${isScoped ? 'AND t.project_id = ?' : "AND t.project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    WHERE u.role = 'worker'
    ${isScoped ? 'AND u.project_id = ?' : "AND u.project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    GROUP BY u.id
  `).all(...(isScoped ? [projectId, projectId] : []));

  res.json(workers);
});

/**
 * Individual Worker Performance
 */
router.get('/worker/:id', auth, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && req.user.role !== 'worker') return res.status(403).json({ error: 'Unauthorized' });

  const targetId = parseInt(req.params.id);

  if (req.user.role === 'supervisor' || req.user.role === 'worker') {
    const requester = db.prepare('SELECT project_id FROM users WHERE id = ?').get(req.user.id);
    const worker = db.prepare('SELECT project_id FROM users WHERE id = ?').get(targetId);

    // Workers can only view THEIR OWN report OR reports of someone in THEIR project if we allow it?
    // Requirement says "only workers which are part of project should be able to see it".
    // This probably means they see the project's data, not individual workers?
    // But usually workers only see their own profile.
    if (req.user.role === 'worker') {
      if (req.user.id !== targetId) {
        return res.status(403).json({ error: 'You can only view your own performance report.' });
      }
    } else {
      // Supervisor
      if (!requester || !worker || requester.project_id === null || requester.project_id !== worker.project_id) {
        return res.status(403).json({ error: 'You can only view reports for workers in your project.' });
      }
    }
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();

  // Daily Trend
  const dailyTrend = db.prepare(`
    SELECT DATE(completed_at) as date, COUNT(*) as count
    FROM tasks
    WHERE assigned_worker_id = ? AND status = 'completed' AND completed_at >= ?
    GROUP BY DATE(completed_at)
    ORDER BY date ASC
  `).all(targetId, weekAgo);

  // Weekly Trend
  const weeklyTrend = db.prepare(`
    SELECT strftime('%W', completed_at) as week_num, COUNT(*) as count
    FROM tasks
    WHERE assigned_worker_id = ? AND status = 'completed' AND completed_at >= ?
    GROUP BY week_num
    ORDER BY week_num ASC
  `).all(targetId, monthAgo);

  // Monthly Trend
  const monthlyTrend = db.prepare(`
    SELECT strftime('%Y-%m', completed_at) as month, COUNT(*) as count
    FROM tasks
    WHERE assigned_worker_id = ? AND status = 'completed' AND completed_at >= ?
    GROUP BY month
    ORDER BY month ASC
  `).all(targetId, sixMonthsAgo);

  // Activity Logs
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

  // Collective stats
  const collective = db.prepare(`
    SELECT 
      COUNT(*) as total_tasks,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed,
      SUM(CASE WHEN deadline_at IS NOT NULL AND status != 'not_started' AND (completed_at > deadline_at OR (completed_at IS NULL AND datetime('now') > deadline_at)) 
          THEN (strftime('%s', COALESCE(completed_at, datetime('now'))) - strftime('%s', deadline_at))/60 ELSE 0 END) as total_delay_mins,
      AVG(CASE WHEN status = 'completed' THEN (strftime('%s', completed_at) - strftime('%s', started_at))/60 ELSE NULL END) as avg_time
    FROM tasks
    WHERE assigned_worker_id = ?
  `).get(targetId);

  // Break Logs
  const breakLogs = db.prepare(`
    SELECT start_time, end_time, date
    FROM break_logs
    WHERE user_id = ?
    ORDER BY start_time DESC
    LIMIT 10
  `).all(targetId);

  res.json({ dailyTrend, weeklyTrend, monthlyTrend, activityHistory: activityLogs, breakHistory: breakLogs, collective });
});

module.exports = router;
