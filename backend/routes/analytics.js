const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET dashboard summary
router.get('/summary', auth, (req, res) => {
  let projectId = req.user.project_id;
  let isScoped = false;

  // Always fetch fresh project_id from DB for supervisors and workers to ensure immediate scoping
  if (req.user.role === 'supervisor' || req.user.role === 'worker') {
    const user = db.prepare('SELECT project_id FROM users WHERE id = ?').get(req.user.id);
    projectId = user ? user.project_id : null;
    isScoped = true;
  } else if (req.user.role === 'admin' && req.query.projectId) {
    projectId = req.query.projectId;
    isScoped = true;
  }

  if (isScoped && !projectId) {
    return res.json({
      projectName: 'No Active Project',
      taskCounts: [],
      machineCounts: [],
      workerCount: 0,
      delayedTasks: 0,
      completedToday: 0,
      pauseReasons: [],
      workerPerformance: [],
      machineUtilization: [],
      dailyTrend: []
    });
  }

  const taskCounts = db.prepare(`
    SELECT status, COUNT(*) as count 
    FROM tasks 
    ${isScoped ? 'WHERE project_id = ?' : "WHERE project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    GROUP BY status
  `).all(...(isScoped ? [projectId] : []));

  const machineCounts = db.prepare(`
    SELECT status, COUNT(*) as count 
    FROM machines 
    ${isScoped ? 'WHERE project_id = ?' : "WHERE project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    GROUP BY status
  `).all(...(isScoped ? [projectId] : []));

  const workerCount = db.prepare(`
    SELECT COUNT(*) as count FROM users 
    WHERE role = 'worker' ${isScoped ? 'AND project_id = ?' : "AND project_id IN (SELECT id FROM projects WHERE status = 'active')"}
  `).get(...(isScoped ? [projectId] : []));

  const delayedTasks = db.prepare(`
    SELECT COUNT(*) as count FROM tasks 
    WHERE status = 'delayed' ${isScoped ? 'AND project_id = ?' : "AND project_id IN (SELECT id FROM projects WHERE status = 'active')"}
  `).get(...(isScoped ? [projectId] : []));

  const completedToday = db.prepare(`
    SELECT COUNT(*) as count FROM tasks 
    WHERE status = 'completed' AND date(completed_at) = date('now')
    ${isScoped ? 'AND project_id = ?' : "AND project_id IN (SELECT id FROM projects WHERE status = 'active')"}
  `).get(...(isScoped ? [projectId] : []));

  // Pause reason distribution
  const pauseReasons = db.prepare(`
    SELECT tl.pause_reason, COUNT(*) as count 
    FROM task_logs tl
    JOIN tasks t ON tl.task_id = t.id
    WHERE tl.action = 'paused' AND tl.pause_reason IS NOT NULL
    ${isScoped ? 'AND t.project_id = ?' : "AND t.project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    GROUP BY tl.pause_reason 
    ORDER BY count DESC
  `).all(...(isScoped ? [projectId] : []));

  // Worker performance
  const workerPerformance = db.prepare(`
    SELECT u.name, SUM(CASE WHEN t.status = 'completed' THEN COALESCE(t.credit_value, 1) ELSE 0 END) as total_credits,
      COUNT(t.id) as total_tasks,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN t.status = 'delayed' THEN 1 ELSE 0 END) as delayed,
      SUM(CASE WHEN t.deadline_at IS NOT NULL AND t.status != 'not_started' AND (t.completed_at > t.deadline_at OR (t.completed_at IS NULL AND datetime('now') > t.deadline_at)) 
          THEN (strftime('%s', COALESCE(t.completed_at, datetime('now'))) - strftime('%s', t.deadline_at))/60 ELSE 0 END) as total_delay_mins,
      AVG(CASE WHEN t.started_at IS NOT NULL AND t.completed_at IS NOT NULL 
          THEN (julianday(t.completed_at) - julianday(t.started_at)) * 24 * 60 ELSE NULL END) as avg_completion_min
    FROM users u
    LEFT JOIN tasks t ON t.assigned_worker_id = u.id ${isScoped ? 'AND t.project_id = ?' : "AND t.project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    WHERE u.role = 'worker' ${isScoped ? 'AND u.project_id = ?' : "AND u.project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    GROUP BY u.id, u.name
  `).all(...(isScoped ? [projectId, projectId] : []));

  // Machine utilization
  const machineUtilization = db.prepare(`
    SELECT m.name, m.status, m.idle_since,
      COUNT(t.id) as total_tasks,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
      SUM(CASE WHEN t.status IN ('in_progress','delayed') THEN 1 ELSE 0 END) as active_tasks
    FROM machines m
    LEFT JOIN tasks t ON t.machine_id = m.id ${isScoped ? 'AND t.project_id = ?' : "AND t.project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    ${isScoped ? 'WHERE m.project_id = ?' : "WHERE m.project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    GROUP BY m.id, m.name
  `).all(...(isScoped ? [projectId, projectId] : []));

  // Daily task completion trend (last 7 days)
  const dailyTrend = db.prepare(`
    SELECT date(completed_at) as day, COUNT(*) as count
    FROM tasks
    WHERE status = 'completed' AND completed_at >= date('now', '-7 days')
    ${isScoped ? 'AND project_id = ?' : "AND project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    GROUP BY day
    ORDER BY day ASC
  `).all(...(isScoped ? [projectId] : []));

  let projectName = null;
  if (isScoped) {
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
    projectName = project ? project.name : 'Unknown Project';
  }

  res.json({
    projectName,
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
    return res.json({ downtimeByMachine: [], workerDowntime: [] });
  }

  const downtimeByMachine = db.prepare(`
    SELECT m.name as machine_name,
      COUNT(tl.id) as pause_count,
      tl.pause_reason
    FROM task_logs tl
    JOIN tasks t ON tl.task_id = t.id
    JOIN machines m ON t.machine_id = m.id
    WHERE tl.action = 'paused'
    ${isScoped ? 'AND t.project_id = ?' : "AND t.project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    GROUP BY m.id, tl.pause_reason
    ORDER BY pause_count DESC
  `).all(...(isScoped ? [projectId] : []));

  const workerDowntime = db.prepare(`
    SELECT u.name, COUNT(tl.id) as pause_count, tl.pause_reason
    FROM task_logs tl
    JOIN tasks t ON tl.task_id = t.id
    JOIN users u ON t.assigned_worker_id = u.id
    WHERE tl.action = 'paused'
    ${isScoped ? 'AND t.project_id = ?' : "AND t.project_id IN (SELECT id FROM projects WHERE status = 'active')"}
    GROUP BY u.id, tl.pause_reason
    ORDER BY pause_count DESC
  `).all(...(isScoped ? [projectId] : []));

  res.json({ downtimeByMachine, workerDowntime });
});

module.exports = router;
