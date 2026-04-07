const alertService = require('./services/alertService');

// Create alert
router.post('/alerts', async (req, res) => {
  try {
    const alert = await alertService.createAlert(req.body);
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all alerts
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await alertService.getAlerts();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resolve alert
router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    const alert = await alertService.resolveAlert(req.params.id);
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});