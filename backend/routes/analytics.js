const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET dashboard summary
router.get('/summary', auth, (req, res) => {
  if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

  const taskCounts = db.prepare(`
    SELECT status, COUNT(*) as count FROM tasks GROUP BY status
  `).all();

  const machineCounts = db.prepare(`
    SELECT status, COUNT(*) as count FROM machines GROUP BY status
  `).all();

  const workerCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'worker'").get();
  const delayedTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'delayed'").get();
  const completedToday = db.prepare(`
    SELECT COUNT(*) as count FROM tasks 
    WHERE status = 'completed' AND date(completed_at) = date('now')
  `).get();

  // Pause reason distribution
  const pauseReasons = db.prepare(`
    SELECT pause_reason, COUNT(*) as count 
    FROM task_logs 
    WHERE action = 'paused' AND pause_reason IS NOT NULL
    GROUP BY pause_reason 
    ORDER BY count DESC
  `).all();

  // Worker performance
  const workerPerformance = db.prepare(`
    SELECT u.name, 
      COUNT(t.id) as total_tasks,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN t.status = 'delayed' THEN 1 ELSE 0 END) as delayed,
      SUM(CASE WHEN t.deadline_at IS NOT NULL AND t.status != 'not_started' AND (t.completed_at > t.deadline_at OR (t.completed_at IS NULL AND datetime('now') > t.deadline_at)) 
          THEN (strftime('%s', COALESCE(t.completed_at, datetime('now'))) - strftime('%s', t.deadline_at))/60 ELSE 0 END) as total_delay_mins,
      AVG(CASE WHEN t.started_at IS NOT NULL AND t.completed_at IS NOT NULL 
          THEN (julianday(t.completed_at) - julianday(t.started_at)) * 24 * 60 ELSE NULL END) as avg_completion_min
    FROM users u
    LEFT JOIN tasks t ON t.assigned_worker_id = u.id
    WHERE u.role = 'worker'
    GROUP BY u.id, u.name
  `).all();

  // Machine utilization
  const machineUtilization = db.prepare(`
    SELECT m.name, m.status, m.idle_since,
      COUNT(t.id) as total_tasks,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
      SUM(CASE WHEN t.status IN ('in_progress','delayed') THEN 1 ELSE 0 END) as active_tasks
    FROM machines m
    LEFT JOIN tasks t ON t.machine_id = m.id
    GROUP BY m.id, m.name
  `).all();

  // Daily task completion trend (last 7 days)
  const dailyTrend = db.prepare(`
    SELECT date(completed_at) as day, COUNT(*) as count
    FROM tasks
    WHERE status = 'completed' AND completed_at >= date('now', '-7 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  res.json({
    taskCounts,
    machineCounts,
    workerCount: workerCount.count,
    delayedTasks: delayedTasks.count,
    completedToday: completedToday.count,
    pauseReasons,
    workerPerformance,
    machineUtilization,
    dailyTrend
  });
});

// GET downtime report
router.get('/downtime', auth, (req, res) => {
  if (req.user.role === 'worker') return res.status(403).json({ error: 'Forbidden' });

  const downtimeByMachine = db.prepare(`
    SELECT m.name as machine_name,
      COUNT(tl.id) as pause_count,
      tl.pause_reason
    FROM task_logs tl
    JOIN tasks t ON tl.task_id = t.id
    JOIN machines m ON t.machine_id = m.id
    WHERE tl.action = 'paused'
    GROUP BY m.id, tl.pause_reason
    ORDER BY pause_count DESC
  `).all();

  const workerDowntime = db.prepare(`
    SELECT u.name, COUNT(tl.id) as pause_count, tl.pause_reason
    FROM task_logs tl
    JOIN tasks t ON tl.task_id = t.id
    JOIN users u ON t.assigned_worker_id = u.id
    WHERE tl.action = 'paused'
    GROUP BY u.id, tl.pause_reason
    ORDER BY pause_count DESC
  `).all();

  res.json({ downtimeByMachine, workerDowntime });
});

module.exports = router;
