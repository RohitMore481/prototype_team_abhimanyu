const xlsx = require('xlsx');
const {
    detectBottlenecks,
    analyzeUtilization,
    generateInsights
} = require('./analyticsService');

/**
 * Parses Excel task data
 */
function parseExcel(buffer) {
    try {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const datasheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(datasheet);

        return data.map(item => ({
            taskId: String(item.taskId || ''),
            taskName: item.taskName || 'Unnamed Task',
            dependsOn: item.dependsOn ? String(item.dependsOn).split(',').map(s => s.trim()).filter(s => s) : [],
            duration: parseInt(item.duration) || 30
        }));
    } catch (error) {
        console.error('Error parsing Excel:', error);
        throw new Error('Failed to parse Excel file.');
    }
}

/**
 * Worker Availability Check
 */
function isWorkerAvailable(worker, currentTime) {
    if (!worker.shifts || !Array.isArray(worker.shifts)) return false;
    const day = currentTime.toLocaleDateString('en-US', { weekday: 'short' });
    const hh = String(currentTime.getHours()).padStart(2, '0');
    const mm = String(currentTime.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;
    for (const shift of worker.shifts) {
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

/**
 * BUILD STEP AFFINITY MAP
 */
function buildStepAffinity(baseTasks, workers) {
    const steps = baseTasks.map(bt => ({
        baseId: bt.taskId,
        taskName: bt.taskName,
        totalDuration: bt.duration
    }));

    const stepAffinityMap = {};
    const workerAffinityMap = {};
    const workerLoad = {};

    steps.forEach(s => { stepAffinityMap[s.baseId] = []; });
    workers.forEach(w => { workerAffinityMap[w.id] = []; workerLoad[w.id] = 0; });

    const numSteps = steps.length;
    const numWorkers = workers.length;

    if (numSteps === 0 || numWorkers === 0) return { stepAffinityMap, workerAffinityMap, workerStepLabel: {} };

    const sortedSteps = [...steps].sort((a, b) => b.totalDuration - a.totalDuration);

    if (numWorkers >= numSteps) {
        for (let i = 0; i < numSteps; i++) {
            const step = sortedSteps[i];
            const worker = workers[i];
            stepAffinityMap[step.baseId].push(worker.id);
            workerAffinityMap[worker.id].push(step.baseId);
            workerLoad[worker.id] += step.totalDuration;
        }
        let extraWorkers = workers.filter(w => workerAffinityMap[w.id].length === 0);
        while (extraWorkers.length > 0) {
            let heaviestStep = null;
            let maxLoad = -1;
            for (const step of sortedSteps) {
                const perWorkerLoad = step.totalDuration / stepAffinityMap[step.baseId].length;
                if (perWorkerLoad > maxLoad) { maxLoad = perWorkerLoad; heaviestStep = step; }
            }
            if (!heaviestStep) break;
            const extraWorker = extraWorkers.shift();
            stepAffinityMap[heaviestStep.baseId].push(extraWorker.id);
            workerAffinityMap[extraWorker.id].push(heaviestStep.baseId);
            workerLoad[extraWorker.id] += heaviestStep.totalDuration;
        }
    } else {
        for (let i = 0; i < numWorkers; i++) {
            const step = sortedSteps[i];
            const worker = workers[i];
            stepAffinityMap[step.baseId].push(worker.id);
            workerAffinityMap[worker.id].push(step.baseId);
            workerLoad[worker.id] += step.totalDuration;
        }
        for (let i = numWorkers; i < numSteps; i++) {
            const step = sortedSteps[i];
            let lightestWorker = workers[0];
            for (const w of workers) {
                if (workerLoad[w.id] < workerLoad[lightestWorker.id]) lightestWorker = w;
            }
            stepAffinityMap[step.baseId].push(lightestWorker.id);
            workerAffinityMap[lightestWorker.id].push(step.baseId);
            workerLoad[lightestWorker.id] += step.totalDuration;
        }
    }

    const workerStepLabel = {};
    workers.forEach(w => {
        const stepNames = workerAffinityMap[w.id]
            .map(bid => steps.find(s => s.baseId === bid)?.taskName || bid)
            .join(' + ');
        workerStepLabel[w.id] = stepNames || 'Unassigned';
    });

    return { stepAffinityMap, workerAffinityMap, workerStepLabel };
}

const IDLE_THRESHOLD_MINUTES = 15;

/**
 * MAIN SCHEDULER
 */
async function generateSchedule(fileBuffer, deadlineStr, productionQuantity = 1, manualSteps = null, workers = []) {
    if (!workers || workers.length === 0) {
        throw new Error('No available workers provided for scheduling.');
    }

    let baseTasks = [];
    if (manualSteps && Array.isArray(manualSteps)) {
        baseTasks = manualSteps.map(s => ({
            taskId: s.taskId || s.id,
            taskName: s.taskName || s.name,
            duration: parseInt(s.duration) || 30,
            dependsOn: s.dependsOn || []
        }));
    } else if (fileBuffer) {
        baseTasks = await parseExcel(fileBuffer);
    }

    if (baseTasks.length === 0) throw new Error('No tasks found in workflow.');

    const { stepAffinityMap, workerAffinityMap, workerStepLabel } = buildStepAffinity(baseTasks, workers);

    const startTime = new Date();
    const deadline = new Date(deadlineStr);
    let currentTime = new Date(startTime);

    // Expand tasks for quantity
    let totalTasksToSchedule = [];
    for (let i = 1; i <= productionQuantity; i++) {
        baseTasks.forEach(bt => {
            totalTasksToSchedule.push({
                id: `${bt.taskId}_${i}`,
                baseId: bt.taskId,
                name: `${bt.taskName} (Unit ${i})`,
                duration: bt.duration,
                unit: i,
                dependsOn: bt.dependsOn.map(d => `${d}_${i}`)
            });
        });
    }

    const tasksMap = {};
    const adj = {};
    totalTasksToSchedule.forEach(t => { tasksMap[t.id] = t; adj[t.id] = []; });
    totalTasksToSchedule.forEach(t => t.dependsOn.forEach(d => { if (adj[d]) adj[d].push(t.id); }));

    const scheduledTasks = [];
    const completedTasksAt = {};
    const activeTasksMap = {};
    const activeWorkersMap = {};
    const remainingDurations = {};
    const workerIdleStart = {};
    const workerTotalAssignedTime = {};
    const workerFlexCount = {};
    const workerFlexMinutes = {};

    let totalWorkTime = 0;
    let remainingTaskIds = new Set(Object.keys(tasksMap));
    remainingTaskIds.forEach(id => {
        remainingDurations[id] = tasksMap[id].duration;
        totalWorkTime += tasksMap[id].duration;
    });

    workers.forEach(w => {
        workerTotalAssignedTime[w.id] = 0;
        workerIdleStart[w.id] = startTime;
        workerFlexCount[w.id] = 0;
        workerFlexMinutes[w.id] = 0;
    });

    let availableTime = 0;
    const workersUsed = new Set();
    const stepStats = {};
    baseTasks.forEach(bt => {
        stepStats[bt.taskId] = { stepName: bt.taskName, totalScheduledMinutes: 0, tasksCompleted: 0, workers: new Set() };
    });

    let safetyCounter = 0;
    while (remainingTaskIds.size > 0 && safetyCounter < 1000000) {
        safetyCounter++;
        const availableWorkersList = workers.filter(w => isWorkerAvailable(w, currentTime));
        if (currentTime <= deadline) availableTime += availableWorkersList.length;

        for (const taskId of Object.keys(activeTasksMap)) {
            const data = activeTasksMap[taskId];
            const { workerId, isFlex } = data;
            if (availableWorkersList.some(w => w.id === workerId)) {
                remainingDurations[taskId]--;
                if (remainingDurations[taskId] <= 0) {
                    const workerObj = workers.find(w => w.id === workerId);
                    const segDur = Math.max(1, Math.round((currentTime - data.segmentStartTime) / 60000));
                    scheduledTasks.push({
                        id: taskId, name: tasksMap[taskId].name, stepType: tasksMap[taskId].baseId,
                        duration: segDur, workerId, workerName: workerObj.name, isFlex: !!isFlex,
                        startTime: data.segmentStartTime.toISOString(), endTime: currentTime.toISOString()
                    });
                    const sid = tasksMap[taskId].baseId;
                    if (stepStats[sid]) {
                        stepStats[sid].totalScheduledMinutes += segDur;
                        stepStats[sid].tasksCompleted++;
                        stepStats[sid].workers.add(workerObj.name);
                    }
                    if (isFlex) workerFlexMinutes[workerId] += segDur;
                    completedTasksAt[taskId] = currentTime;
                    workersUsed.add(workerId);
                    workerIdleStart[workerId] = currentTime;
                    delete activeTasksMap[taskId];
                    delete activeWorkersMap[workerId];
                    remainingTaskIds.delete(taskId);
                }
            } else {
                const workerObj = workers.find(w => w.id === workerId);
                const segDur = Math.round((currentTime - data.segmentStartTime) / 60000);
                if (segDur > 0) {
                    scheduledTasks.push({
                        id: taskId, name: `${tasksMap[taskId].name} (Partial)`, stepType: tasksMap[taskId].baseId,
                        duration: segDur, workerId, workerName: workerObj.name, isFlex: !!isFlex,
                        startTime: data.segmentStartTime.toISOString(), endTime: currentTime.toISOString()
                    });
                    if (isFlex) workerFlexMinutes[workerId] += segDur;
                    const sid = tasksMap[taskId].baseId;
                    if (stepStats[sid]) {
                        stepStats[sid].totalScheduledMinutes += segDur;
                        stepStats[sid].workers.add(workerObj.name);
                    }
                }
                delete activeTasksMap[taskId];
                delete activeWorkersMap[workerId];
            }
        }

        const readyTaskIds = Array.from(remainingTaskIds).filter(tid => {
            if (activeTasksMap[tid]) return false;
            return tasksMap[tid].dependsOn.every(depId => completedTasksAt[depId] && completedTasksAt[depId] <= currentTime);
        });

        const freeWorkers = availableWorkersList.filter(w => !activeWorkersMap[w.id]);
        const assignedThisTick = new Set();

        for (const taskId of readyTaskIds) {
            const sid = tasksMap[taskId].baseId;
            const affinityWorkerIds = stepAffinityMap[sid] || [];
            const eligibleWorkers = freeWorkers.filter(w => affinityWorkerIds.includes(w.id) && !activeWorkersMap[w.id] && !assignedThisTick.has(taskId));
            if (eligibleWorkers.length === 0) continue;
            eligibleWorkers.sort((a, b) => workerTotalAssignedTime[a.id] - workerTotalAssignedTime[b.id]);
            const worker = eligibleWorkers[0];
            activeTasksMap[taskId] = { workerId: worker.id, segmentStartTime: currentTime, isFlex: false };
            activeWorkersMap[worker.id] = taskId;
            workerTotalAssignedTime[worker.id] += remainingDurations[taskId];
            workerIdleStart[worker.id] = null;
            assignedThisTick.add(taskId);
        }

        const stillFreeWorkers = freeWorkers.filter(w => !activeWorkersMap[w.id]);
        const unassignedReadyTaskIds = readyTaskIds.filter(tid => !assignedThisTick.has(tid));
        if (stillFreeWorkers.length > 0 && unassignedReadyTaskIds.length > 0) {
            for (const worker of stillFreeWorkers) {
                const primarySteps = workerAffinityMap[worker.id] || [];
                if (unassignedReadyTaskIds.some(tid => primarySteps.includes(tasksMap[tid].baseId))) continue;
                const idleStart = workerIdleStart[worker.id];
                const idleMinutes = idleStart ? Math.floor((currentTime - idleStart) / 60000) : 0;
                if (idleMinutes < IDLE_THRESHOLD_MINUTES) continue;
                const candidate = unassignedReadyTaskIds.filter(tid => !assignedThisTick.has(tid))
                    .sort((a, b) => remainingDurations[b] - remainingDurations[a])[0];
                if (!candidate) continue;
                activeTasksMap[candidate] = { workerId: worker.id, segmentStartTime: currentTime, isFlex: true };
                activeWorkersMap[worker.id] = candidate;
                workerTotalAssignedTime[worker.id] += remainingDurations[candidate];
                workerIdleStart[worker.id] = null;
                workerFlexCount[worker.id]++;
                assignedThisTick.add(candidate);
            }
        }

        for (const worker of availableWorkersList) {
            if (!activeWorkersMap[worker.id] && workerIdleStart[worker.id] === null) workerIdleStart[worker.id] = currentTime;
        }

        currentTime = new Date(currentTime.getTime() + 60000);
        if (currentTime > new Date(startTime.getTime() + 1000 * 60 * 60 * 24 * 30)) throw new Error('Simulation exceeded 30 days.');
    }

    if (remainingTaskIds.size > 0) throw new Error('Simulation failed.');

    const lastEndTime = scheduledTasks.length > 0 ? new Date(Math.max(...scheduledTasks.map(t => new Date(t.endTime).getTime()))) : startTime;
    const wallClockMinutes = Math.max(1, Math.floor((lastEndTime - startTime) / 60000));
    const parallelEfficiency = Number((totalWorkTime / (wallClockMinutes * Math.max(1, workersUsed.size))).toFixed(2));
    const isFeasible = lastEndTime <= deadline;
    const slackTime = isFeasible ? Math.floor((deadline - lastEndTime) / 60000) : 0;
    const extraTimeRequired = isFeasible ? 0 : Math.floor((lastEndTime - deadline) / 60000);
    const timingInfo = {
        isFeasible, extraTimeRequired,
        extraTimeDisplay: `${Math.floor(extraTimeRequired / 60)}h ${extraTimeRequired % 60}m`,
        slackMinutes: slackTime,
        slackDisplay: `${Math.floor(slackTime / 60)}h ${slackTime % 60}m`
    };

    const bottleneck = detectBottlenecks(scheduledTasks);
    const utilization = analyzeUtilization(scheduledTasks, workers, lastEndTime, startTime);
    const insights = generateInsights(scheduledTasks, { bottleneck, timing: timingInfo }, utilization);
    const perStepStats = baseTasks.map(bt => {
        const s = stepStats[bt.taskId] || {};
        const avgPerUnit = s.totalScheduledMinutes > 0 ? Math.round(s.totalScheduledMinutes / Math.max(1, s.tasksCompleted)) : bt.duration;
        return {
            stepId: bt.taskId, stepName: bt.taskName, dependsOn: bt.dependsOn || [],
            totalMinutes: s.totalScheduledMinutes || 0, tasksCompleted: s.tasksCompleted || 0,
            avgMinutesPerUnit: avgPerUnit, estimatedForQuantity: avgPerUnit * productionQuantity,
            assignedWorkers: [...new Set(stepAffinityMap[bt.taskId] || [])].map(wid => ({
                id: wid,
                name: workers.find(w => w.id === wid)?.name || wid
            }))
        };
    });

    return {
        schedule: scheduledTasks,
        summary: {
            totalWorkTime, totalDurationMinutes: wallClockMinutes,
            totalDurationDisplay: `${Math.floor(wallClockMinutes / 60)}h ${wallClockMinutes % 60}m`,
            estimatedCompletionTime: lastEndTime.toISOString(), deadline: deadlineStr,
            isFeasible, status: isFeasible ? (slackTime < 60 ? 'borderline' : 'achievable') : 'impossible',
            feedback: isFeasible ? `✅ Deadline achievable. Slack: ${timingInfo.slackDisplay}.` : `⚠️ Deadline impossible. Extra: ${timingInfo.extraTimeDisplay}.`,
            slackTime, slackMinutes: slackTime, slackDisplay: timingInfo.slackDisplay,
            extraTimeRequired, extraTimeDisplay: timingInfo.extraTimeDisplay,
            workersUsed: Array.from(workersUsed), parallelEfficiency, bottleneck, utilization, insights, perStepStats,
            stepAffinity: Object.fromEntries(baseTasks.map(bt => [bt.taskId, {
                taskName: bt.taskName, workerIds: stepAffinityMap[bt.taskId] || [],
                workerNames: (stepAffinityMap[bt.taskId] || []).map(wid => workers.find(w => w.id === wid)?.name || wid)
            }]))
        }
    };
}

module.exports = { parseExcel, generateSchedule, isWorkerAvailable, buildStepAffinity };
