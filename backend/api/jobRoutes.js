// routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const jobService = require('../services/jobService');

router.post('/', async (req, res) => {
  try {
    const job = await jobService.createJob(req.body);
    res.json(job);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const job = await jobService.getJob(req.params.id);
    res.json(job);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const job = await jobService.updateJob(req.params.id, req.body);
    res.json(job);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const jobs = await jobService.listJobs(req.query);
    res.json(jobs);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;