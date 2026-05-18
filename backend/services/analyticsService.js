/**
 * Analytics Service for Production Intelligence
 * Handles bottlenecks, utilization, and smart insights
 */

function isWorkerAvailableAt(shifts, timeDate) {
    if (!shifts || !Array.isArray(shifts)) return false;
    const day = timeDate.toLocaleDateString('en-US', { weekday: 'short' });
    const hh = String(timeDate.getHours()).padStart(2, '0');
    const mm = String(timeDate.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;
    for (const shift of shifts) {
        if (!shift.days.includes(day)) continue;
        const { startTime, endTime } = shift;
        if (startTime < endTime) {
            if (timeStr >= startTime && timeStr < endTime) return true;
        } else {
            if (timeStr >= startTime || timeStr < endTime) return true;
        }
    }
    return false;
}

function calculateTotalWork(tasks) {
    return tasks.reduce((sum, t) => sum + t.duration, 0);
}

function detectBottlenecks(scheduledTasks) {
    if (!scheduledTasks || scheduledTasks.length === 0) return null;

    const taskStats = {};
    scheduledTasks.forEach(t => {
        const baseId = t.id.split('_')[0];
        if (!taskStats[baseId]) {
            taskStats[baseId] = { name: t.name.split(' (')[0], totalDuration: 0, count: 0 };
        }
        taskStats[baseId].totalDuration += t.duration;
        taskStats[baseId].count++;
    });

    const totalTime = Object.values(taskStats).reduce((sum, s) => sum + s.totalDuration, 0);
    const sortedTasks = Object.values(taskStats).sort((a, b) => b.totalDuration - a.totalDuration);
    const topBottleneck = sortedTasks[0];

    return {
        taskName: topBottleneck.name,
        percentageContribution: Math.round((topBottleneck.totalDuration / totalTime) * 100),
        reason: `Contributes ${Math.round((topBottleneck.totalDuration / totalTime) * 100)}% of total production time.`,
        suggestion: topBottleneck.totalDuration / totalTime > 0.3
            ? 'Consider adding dedicated workers or machines to this stage.'
            : 'Stage is stable but remains the primary time consumer.'
    };
}

/**
 * FIXED: Shift-Aware Utilization
 *
 * Previous bug: the denominator was `wallClockMinutes` (total elapsed time from sim start
 * to end). If a worker only works 8h/day and the sim spans 2 days, the wall clock is ~2880
 * minutes but the worker's available window is only ~960 minutes — causing idle% to be
 * massively inflated.
 *
 * Fix: for each worker, count only the minutes within [startTime, lastEndTime] when they
 * ARE on shift. If shifts data is unavailable, fall back to wall-clock time (legacy).
 */
function analyzeUtilization(scheduledTasks, workers, lastEndTime, startTime) {
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(lastEndTime).getTime();
    const wallClockMinutes = Math.max(1, Math.floor((endMs - startMs) / 60000));

    if (wallClockMinutes <= 0) return [];

    // Calculate shift-available minutes per worker using 15-min slot sampling
    // (a fine-grained minute-by-minute walk would be too slow for long simulations)
    const SAMPLE_SLOT = 15; // granularity in minutes

    function shiftAvailableMinutes(worker) {
        if (!worker.shifts || !Array.isArray(worker.shifts) || worker.shifts.length === 0) {
            return wallClockMinutes; // fallback
        }
        let available = 0;
        for (let ms = startMs; ms < endMs; ms += SAMPLE_SLOT * 60000) {
            if (isWorkerAvailableAt(worker.shifts, new Date(ms))) {
                available += SAMPLE_SLOT;
            }
        }
        return Math.max(1, available);
    }

    const workerStats = workers.map(w => ({
        id: w.id,
        name: w.name,
        shifts: w.shifts || [],
        busyMinutes: 0,
        availableMinutes: shiftAvailableMinutes(w)
    }));

    scheduledTasks.forEach(t => {
        const worker = workerStats.find(ws => ws.id === t.workerId);
        if (worker) worker.busyMinutes += t.duration;
    });

    return workerStats.map(w => ({
        ...w,
        utilizationRate: Math.min(100, Math.round((w.busyMinutes / w.availableMinutes) * 100)),
        idleMinutes: Math.max(0, Math.round(w.availableMinutes - w.busyMinutes))
    }));
}

function generateInsights(scheduledTasks, summary, utilization) {
    const insights = [];

    // 1. Bottleneck Analysis
    if (summary.bottleneck && summary.bottleneck.percentageContribution > 40) {
        insights.push({
            type: 'warning',
            message: `${summary.bottleneck.taskName} is a severe bottleneck.`,
            action: `Adding 1 additional worker to this stage could reduce total time by approx ${Math.round(summary.bottleneck.percentageContribution / 2)}%.`
        });
    }

    // 2. Feasibility / Resource Requirement Insights
    if (summary.timing && !summary.timing.isFeasible) {
        const extraMinutes = summary.timing.extraTimeRequired;
        const avgAvailableMinutes = utilization.reduce((sum, u) => sum + u.availableMinutes, 0) / Math.max(1, utilization.length);
        const workersNeeded = Math.ceil(extraMinutes / avgAvailableMinutes);

        insights.push({
            type: 'critical',
            message: `Deadline missed by ${summary.timing.extraTimeDisplay}.`,
            action: `Add approximately ${workersNeeded} more worker(s) to the shift (Day or Night) to meet the current deadline.`
        });
    } else if (summary.timing && summary.timing.slackMinutes < 60 && summary.timing.slackMinutes > 0) {
        insights.push({
            type: 'warning',
            message: `Tight deadline. Only ${summary.timing.slackDisplay} slack time remains.`,
            action: 'Consider adding one flexible worker to handle overflow if any delays occur.'
        });
    }

    // 3. Utilization Analysis
    const lowUtilized = utilization.find(u => u.utilizationRate < 50);
    if (lowUtilized) {
        insights.push({
            type: 'info',
            message: `${lowUtilized.name} has significant idle time (${lowUtilized.utilizationRate}% utilized).`,
            action: 'Consider reassigning them to help with bottleneck stages.'
        });
    }

    if (insights.length === 0) {
        insights.push({
            type: 'success',
            message: 'Production plan is well-balanced.',
            action: 'Ensure workers are cross-trained to maintain this efficiency.'
        });
    }

    return insights;
}

module.exports = {
    calculateTotalWork,
    detectBottlenecks,
    analyzeUtilization,
    generateInsights
};
