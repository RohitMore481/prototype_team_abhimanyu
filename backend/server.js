// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// Import your existing routes
const jobRoutes = require('./api/jobRoutes');
const alertRoutes = require('./api/routes'); 

app.use(cors()); // Allow Frontend to connect
app.use(express.json());

// Redirect logic to your services
app.use('/jobs', jobRoutes);
app.use('/alerts', alertRoutes);

// Example: Direct mapping for the "Start/Complete" buttons in the UI
const performanceService = require('./services/performanceService');

app.post('/start', async (req, res) => {
    try {
        // Log start time in Supabase
        res.json({ message: "Job started" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/complete', async (req, res) => {
    try {
        await performanceService.trackJobCompletionTime(req.body.jobId);
        await performanceService.calculateEfficiency(req.body.jobId);
        res.json({ message: "Job completed and efficiency logged" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Smart Floor Backend running on port ${PORT}`));