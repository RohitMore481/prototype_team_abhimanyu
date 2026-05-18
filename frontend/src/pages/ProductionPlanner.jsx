import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, Calendar, Clock, CheckCircle2, AlertCircle,
    Workflow, FileText, ChevronRight, Users, ArrowRight,
    TrendingUp, Download, Sparkles, Activity, BarChart3,
    Lightbulb, Zap, Pause, Play, RefreshCcw, Save, FolderOpen,
    Rocket, X, Trash2, GitBranch, RefreshCw, AlertTriangle
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import api from '../utils/api';
import toast from 'react-hot-toast';
import WorkflowEditor from '../components/WorkflowEditor';
import { useAuth } from '../context/AuthContext';

/**
 * PRODUCTION PLANNER V3 - Live Edition
 */

const isWorkerAvailableAt = (shifts, time) => {
    const day = time.toLocaleDateString('en-US', { weekday: 'short' });
    const timeStr = time.getHours().toString().padStart(2, '0') + ':' + time.getMinutes().toString().padStart(2, '0');

    if (!shifts || !Array.isArray(shifts)) return false;
    for (const shift of shifts) {
        if (!shift.days.includes(day)) continue;
        const { startTime, endTime } = shift;
        if (startTime <= endTime) {
            if (timeStr >= startTime && timeStr <= endTime) return true;
        } else {
            if (timeStr >= startTime || timeStr <= endTime) return true;
        }
    }
    return false;
};

export default function ProductionPlanner() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const isSupervisor = user?.role === 'supervisor';

    const [file, setFile] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [deadline, setDeadline] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [viewMode, setViewMode] = useState('summary'); // summary, gantt, workers, workflow

    // Save Plan modal
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [saving, setSaving] = useState(false);
    const [isActivatingAfterSave, setIsActivatingAfterSave] = useState(false);

    // Saved Plans panel
    const [savedPlans, setSavedPlans] = useState([]);
    const [loadedPlan, setLoadedPlan] = useState(null);
    const [showPlansPanel, setShowPlansPanel] = useState(false);
    const [activating, setActivating] = useState(null);

    // Workflow editor steps (editable)
    const [editableSteps, setEditableSteps] = useState([]);
    const [phase, setPhase] = useState('design'); // design, analysis

    // Track original state to avoid redundant saves
    const [originalState, setOriginalState] = useState(null);

    const isDirty = useMemo(() => {
        if (!loadedPlan) return true;
        const currentSteps = JSON.stringify(editableSteps);
        const originalSteps = Array.isArray(originalState?.steps) ? JSON.stringify(originalState.steps) : originalState?.steps;

        return (
            quantity !== originalState?.quantity ||
            deadline !== originalState?.deadline ||
            currentSteps !== originalSteps
        );
    }, [loadedPlan, quantity, deadline, editableSteps, originalState]);

    // Live status
    const [liveStatus, setLiveStatus] = useState(null);

    const theoreticalDuration = useMemo(() => {
        return editableSteps.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0);
    }, [editableSteps]);

    const fetchSavedPlans = useCallback(async () => {
        try {
            const res = await api.get('/planning/plans');
            setSavedPlans(res.data);
        } catch { }
    }, []);

    useEffect(() => { fetchSavedPlans(); }, [fetchSavedPlans]);

    // Poll live status if a plan is active
    useEffect(() => {
        if (!loadedPlan || loadedPlan.status !== 'active') return;
        const poll = async () => {
            try {
                const res = await api.get(`/planning/plans/${loadedPlan.id}/live-status`);
                setLiveStatus(res.data);
            } catch { }
        };
        poll();
        const t = setInterval(poll, 15000);
        return () => clearInterval(t);
    }, [loadedPlan]);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFile(file);

        // Auto-extract steps into design mode
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await api.post('/planning/parse-excel', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setEditableSteps(res.data.map(s => ({
                id: s.taskId,
                name: s.taskName,
                duration: s.duration,
                dependsOn: s.dependsOn || []
            })));
            toast.success('Workflow extracted from Excel!');
            setViewMode('workflow');
        } catch {
            toast.error('Failed to parse Excel');
        }
    };

    const handleRunSimulation = async (e) => {
        if (e) e.preventDefault();
        if (!quantity || !deadline) {
            toast.error('Please set quantity and deadline.');
            return;
        }

        setLoading(true);
        const formData = new FormData();
        if (file) formData.append('file', file);
        formData.append('quantity', quantity);
        formData.append('deadline', deadline);
        formData.append('steps', JSON.stringify(editableSteps));

        try {
            const res = await api.post('/planning/schedule', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setResult(res.data);
            toast.success('Optimization Complete!');
            setViewMode('summary');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to run simulation');
        } finally {
            setLoading(false);
        }
    };

    const handleSavePlan = async (autoActivate = false) => {
        if (!result) return;
        setSaving(true);
        try {
            const res = await api.post('/planning/plans', {
                name: saveName || `Plan ${new Date().toLocaleDateString()}`,
                steps: editableSteps,
                affinity: result.summary.stepAffinity,
                summary: result.summary,
                quantity,
                deadline
            });
            const newPlan = res.data;
            setLoadedPlan(newPlan);
            toast.success('Plan Saved!');
            setShowSaveModal(false);
            fetchSavedPlans();

            if (autoActivate) {
                handleActivatePlan(newPlan.id);
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveProcess = async () => {
        if (!editableSteps || editableSteps.length === 0) {
            toast.error('Workflow is empty');
            return;
        }

        const name = prompt('Enter a name for this process design:', saveName || `Process ${new Date().toLocaleDateString()}`);
        if (!name) return;

        try {
            await api.post('/planning/plans', {
                name: name,
                steps: editableSteps,
                status: 'draft'
            });
            toast.success('Workflow design saved successfully');
            fetchSavedPlans();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save process');
        }
    };

    const handleLoadPlan = async (id) => {
        try {
            const res = await api.get(`/planning/plans/${id}`);
            const p = res.data;
            setLoadedPlan(p);
            setSaveName(p.name);
            setQuantity(p.quantity);
            setDeadline(p.deadline || '');
            setEditableSteps(p.steps || []);
            setOriginalState({
                quantity: p.quantity,
                deadline: p.deadline || '',
                steps: p.steps || []
            });

            if (p.summary) {
                setResult({ summary: p.summary, schedule: [] }); // Schedule is often too big to keep in DB
                setPhase('analysis');
                setViewMode('summary');
            } else {
                setPhase('design');
                setViewMode('workflow');
            }
            toast.success('Plan Loaded');
            setShowPlansPanel(false);
        } catch {
            toast.error('Failed to load plan');
        }
    };

    const handleActivatePlan = async (planId) => {
        if (isAdmin) {
            toast.error('Only Supervisors can activate production automation.');
            return;
        }
        setActivating(planId);
        try {
            const res = await api.post(`/planning/plans/${planId}/activate`);
            toast.success(res.data.message);
            fetchSavedPlans();
            if (loadedPlan?.id === planId) {
                const refreshed = await api.get(`/planning/plans/${planId}`);
                setLoadedPlan(refreshed.data);
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Activation failed');
        } finally {
            setActivating(null);
        }
    };

    const handleDeletePlan = async (planId) => {
        if (!window.confirm('Delete this plan?')) return;
        try {
            await api.delete(`/planning/plans/${planId}`);
            toast.success('Plan deleted');
            fetchSavedPlans();
            if (loadedPlan?.id === planId) setLoadedPlan(null);
        } catch {
            toast.error('Delete failed');
        }
    };

    const handleDiscardPlan = async (id) => {
        if (!window.confirm('Are you sure you want to DISCARD this active automation? This will stop all dispatched tasks and reset the plan to design mode.')) return;
        setLoading(true);
        try {
            await api.post(`/planning/plans/${id}/discard`);
            toast.success('Automation discarded');
            const res = await api.get(`/planning/plans/${id}`);
            setLoadedPlan(res.data);
            setPhase('design');
            setResult(null);
            fetchSavedPlans();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to discard');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveEdits = async () => {
        if (!loadedPlan) return;
        try {
            await api.put(`/planning/plans/${loadedPlan.id}`, { steps: editableSteps });
            toast.success('Workflow saved');
        } catch {
            toast.error('Failed to save edits');
        }
    };

    const ganttData = useMemo(() => {
        if (!result) return null;
        const perWorker = {};
        result.schedule.forEach(task => {
            const workerKey = `${task.workerName}_${task.workerId}`;
            if (!perWorker[workerKey]) perWorker[workerKey] = [];
            perWorker[workerKey].push(task);
        });
        return perWorker;
    }, [result]);

    const totalMinutes = useMemo(() => {
        if (!result) return 0;
        return result.summary.totalDurationMinutes;
    }, [result]);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 pb-20 max-w-[1600px] mx-auto min-h-screen">
            <div className="flex flex-wrap items-center justify-between gap-6 mb-10">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
                        <Workflow className="text-white" size={32} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">
                            {isAdmin ? 'Process Designer' : 'Automation Control'}
                        </h1>
                        <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mt-1 flex items-center gap-2">
                            <Sparkles size={12} className="text-amber-500" />
                            {isAdmin ? 'Design & Theoretical Process Mapping' : 'Advanced Simulation & Live Dispatch'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowPlansPanel(true)} className="btn-secondary px-4 py-2 text-sm font-bold flex items-center gap-2">
                        <FolderOpen size={16} /> Saved Plans
                    </button>
                    {result && (
                        <button onClick={() => setShowSaveModal(true)} className="btn-primary px-4 py-2 text-sm font-bold flex items-center gap-2">
                            <Save size={16} /> Save Plan
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 mb-8 bg-white dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-fit shadow-sm">
                {[
                    { id: 'summary', icon: BarChart3, label: 'Summary' },
                    { id: 'workflow', icon: Workflow, label: 'Workflow' },
                    { id: 'gantt', icon: Calendar, label: 'Timeline', premium: true },
                    { id: 'workers', icon: Users, label: 'Resources', premium: true }
                ].map(tab => {
                    const isTabDisabled = (tab.id !== 'workflow' && !result && !liveStatus);
                    if (isAdmin && (tab.id === 'gantt' || tab.id === 'workers')) return null;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setViewMode(tab.id)}
                            disabled={isTabDisabled}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${viewMode === tab.id
                                ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)] scale-105'
                                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30'
                                }`}
                        >
                            <tab.icon size={16} /> {tab.label}
                            {tab.premium && !liveStatus && !loadedPlan && <Sparkles size={12} className="text-amber-500" />}
                        </button>
                    );
                })}
            </div>

            {liveStatus && (
                <div className="mb-8 p-6 rounded-3xl bg-indigo-600 text-white shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform"><Rocket size={120} /></div>
                    <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md animate-pulse"><Activity size={28} /></div>
                            <div>
                                <span className="text-xs font-black uppercase tracking-[0.2em] opacity-80">Active Plan</span>
                                <h2 className="text-3xl font-black tracking-tight">{liveStatus.name}</h2>
                            </div>
                        </div>
                        <div className="flex gap-8">
                            <div className="text-center">
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Projected End</p>
                                <p className="text-xl font-black">{new Date(liveStatus.projectedCompletion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Track</p>
                                <p className={`text-xl font-black ${liveStatus.isOnTrack ? 'text-emerald-300' : 'text-amber-300'}`}>{liveStatus.isOnTrack ? 'On Track' : 'Delayed'}</p>
                            </div>
                        </div>
                        <button onClick={() => handleActivatePlan(loadedPlan?.id)} className="px-6 py-3 bg-white text-indigo-600 font-black rounded-xl hover:bg-indigo-50"><RefreshCw size={18} className="inline mr-2" /> Recalculate</button>
                    </div>
                </div>
            )}

            <div className="grid lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-6">
                    <AnimatePresence mode="wait">
                        {phase === 'design' ? (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                key="design-phase"
                                className="card p-8 bg-zinc-900 text-white overflow-hidden relative shadow-2xl"
                            >
                                <div className="absolute -right-4 -bottom-4 opacity-10"><Workflow size={160} /></div>
                                <h3 className="text-2xl font-black mb-2 flex items-center gap-2">Design Phase</h3>
                                <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-6">Step 1: Define Process & Timing</p>

                                <div className="space-y-6 relative z-10">
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Theoretical Duration</p>
                                        <p className="text-3xl font-black text-blue-400">
                                            {Math.floor(theoreticalDuration / 60)}h {theoreticalDuration % 60}m
                                        </p>
                                        <p className="text-[10px] font-bold text-zinc-400 mt-1">Based on raw step durations (no constraints)</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 text-white">Import from Excel</label>
                                        <input type="file" onChange={handleFileChange} className="hidden" id="file-upload" />
                                        <label htmlFor="file-upload" className="flex items-center gap-3 p-4 bg-white/10 hover:bg-white/20 border-2 border-dashed border-white/20 rounded-2xl cursor-pointer transition-all">
                                            <div className="p-2 bg-white/20 rounded-lg"><Upload size={20} /></div>
                                            <span className="text-sm font-bold truncate">{file ? file.name : 'Choose Template...'}</span>
                                        </label>
                                    </div>

                                    {editableSteps.length > 0 && (
                                        <div className="space-y-4">
                                            {!isAdmin && (
                                                <button
                                                    onClick={() => { setPhase('analysis'); setViewMode('summary'); }}
                                                    className="w-full h-16 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 border-b-4 border-blue-800"
                                                >
                                                    Next: Resource Analysis <ArrowRight size={20} />
                                                </button>
                                            )}
                                            {isAdmin && (
                                                <button
                                                    onClick={handleSaveProcess}
                                                    className="w-full h-16 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                                                >
                                                    Save Process Design <Save size={20} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ) : !isAdmin ? (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                key="analysis-phase"
                                className="card p-8 bg-blue-600 text-white overflow-hidden relative shadow-[0_20px_50px_rgba(37,99,235,0.3)]"
                            >
                                <div className="absolute -right-4 -bottom-4 opacity-10"><Zap size={160} /></div>
                                <h3 className="text-2xl font-black mb-2 flex items-center gap-2">Analysis Phase</h3>
                                <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-6">Step 2: Resource Feasibility</p>

                                <div className="space-y-6 relative z-10">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Batch Quantity</label>
                                            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full bg-white/10 border-2 border-white/10 p-4 rounded-2xl font-black text-white focus:border-white/40 outline-none transition-all" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Deadline</label>
                                            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full bg-white/10 border-2 border-white/10 p-4 rounded-2xl font-bold text-sm text-white focus:border-white/40 outline-none transition-all" />
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleRunSimulation}
                                        disabled={loading}
                                        className="w-full h-16 bg-white text-blue-600 rounded-2xl font-black text-lg shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                                    >
                                        {loading ? <div className="w-6 h-6 border-4 border-white/30 border-t-blue-600 rounded-full animate-spin" /> : <>Run Optimization <Zap size={20} fill="currentColor" /></>}
                                    </button>

                                    <button
                                        onClick={() => setPhase('design')}
                                        className="w-full py-3 text-white/60 text-[10px] font-black uppercase tracking-[0.2em] hover:text-white transition-colors"
                                    >
                                        ← Back to Design Mode
                                    </button>
                                </div>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>

                    {result && phase === 'analysis' && (
                        <div className={`p-6 rounded-2xl border-l-[6px] shadow-lg flex items-start gap-4 animate-slide-in ${result.summary.status === 'achievable' ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500' : 'bg-red-50 dark:bg-red-950/20 border-red-500'}`}>
                            <div className={`p-2 rounded-xl ${result.summary.status === 'achievable' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}><CheckCircle2 size={24} /></div>
                            <div><h4 className="font-black theme-text uppercase tracking-tight text-xs">AI Optimization Result</h4><p className="text-[13px] font-bold mt-1 leading-snug">{result.summary.feedback}</p></div>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-8">
                    <AnimatePresence mode="wait">
                        {viewMode === 'workflow' && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} key="workflow-view" className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div><h2 className="text-2xl font-black tracking-tight">Workflow Structure</h2><p className="text-zinc-500 font-medium">Define step sequence visually</p></div>
                                    {loadedPlan && <button onClick={handleSaveEdits} className="btn-primary"><Save size={18} className="mr-2" /> Save Workflow</button>}
                                </div>
                                <WorkflowEditor steps={editableSteps} onChange={setEditableSteps} readonly={loadedPlan?.status === 'active'} />
                            </motion.div>
                        )}

                        {viewMode === 'summary' && result && (
                            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {[
                                        { label: 'Total Duration', value: result.summary.totalDurationDisplay, icon: <Clock size={16} className="text-blue-400" />, color: 'blue' },
                                        { label: result.summary.isFeasible ? 'Slack Time' : 'Extra Needed', value: result.summary.isFeasible ? result.summary.slackDisplay : result.summary.extraTimeDisplay, icon: result.summary.isFeasible ? <CheckCircle2 size={16} className="text-emerald-400" /> : <AlertCircle size={16} className="text-red-400" />, color: result.summary.isFeasible ? 'emerald' : 'red' },
                                        { label: 'Total Work', value: `${Math.floor(result.summary.totalWorkTime / 60)}h ${result.summary.totalWorkTime % 60}m`, icon: <Activity size={16} className="text-purple-400" />, color: 'purple' },
                                        { label: 'Efficiency', value: `${Math.round(result.summary.parallelEfficiency * 100)}%`, icon: <Zap size={16} className="text-amber-400" />, color: 'amber' }
                                    ].map((s, i) => (
                                        <div key={i} className="card p-4 flex flex-col gap-2">
                                            <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{s.label}</span>{s.icon}</div>
                                            <p className={`text-2xl font-black ${s.color === 'red' ? 'text-red-500' : s.color === 'emerald' ? 'text-emerald-500' : 'text-blue-500'}`}>{s.value}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="card p-6">
                                        <div className="flex items-center gap-2 mb-5"><Workflow className="text-blue-500" size={18} /><h3 className="font-black text-sm uppercase tracking-widest">Step Breakdown</h3></div>
                                        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-zinc-200 dark:border-zinc-800">{['Step', 'Assigned Workers', 'Avg / Unit', 'Total Time'].map(h => <th key={h} className="pb-3 text-left font-black uppercase tracking-widest text-zinc-400">{h}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">{result.summary.perStepStats.map(step => (
                                            <tr key={step.stepId}><td className="py-3 font-black">{step.stepName}</td><td className="py-3"><div className="flex flex-wrap gap-1">{step.assignedWorkers.map(w => <span key={w.id} className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md font-bold text-[9px]">{w.name}</span>)}</div></td><td className="py-3 font-bold text-zinc-500">{step.avgMinutesPerUnit}m</td><td className="py-3 font-black text-blue-500">{Math.floor(step.totalMinutes / 60)}h {step.totalMinutes % 60}m</td></tr>
                                        ))}</tbody></table></div>
                                    </div>

                                    <div className="card p-6 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-5"><Lightbulb className="text-amber-500" size={18} /><h3 className="font-black text-sm uppercase tracking-widest">Production AI Insights</h3></div>
                                            <div className="space-y-4">
                                                {result.summary.insights.map((insight, idx) => (
                                                    <div key={idx} className={`p-4 rounded-xl border-l-[4px] relative overflow-hidden transition-all duration-300 ${insight.type === 'critical' ? 'bg-red-50 border-red-500 dark:bg-red-950/20' :
                                                        insight.type === 'warning' ? 'bg-amber-50 border-amber-500 dark:bg-amber-950/20' :
                                                            insight.type === 'info' ? 'bg-blue-50 border-blue-500 dark:bg-blue-950/20' :
                                                                'bg-emerald-50 border-emerald-500 dark:bg-emerald-950/20'
                                                        }`}>
                                                        <div className="flex items-start gap-3">
                                                            <div className={`p-2 rounded-lg ${insight.type === 'critical' ? 'bg-red-100 text-red-600' :
                                                                insight.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                                                                    insight.type === 'info' ? 'bg-blue-100 text-blue-600' :
                                                                        'bg-emerald-100 text-emerald-600'
                                                                }`}>
                                                                {insight.type === 'critical' ? <AlertTriangle size={18} /> :
                                                                    insight.type === 'warning' ? <AlertCircle size={18} /> :
                                                                        insight.type === 'info' ? <Zap size={18} /> :
                                                                            <CheckCircle2 size={18} />
                                                                }
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-black uppercase tracking-widest mb-1 opacity-70">{insight.type}</p>
                                                                <p className="text-sm font-bold theme-text leading-tight mb-2">{insight.message}</p>
                                                                <p className="text-[11px] font-medium text-zinc-500 bg-white/50 dark:bg-black/20 p-2 rounded-lg border border-white/20">
                                                                    <span className="font-black text-blue-600 dark:text-blue-400 mr-1 uppercase text-[9px]">Fix:</span>
                                                                    {insight.action}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {!isAdmin && (
                                            <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                                                <button
                                                    onClick={() => {
                                                        if (loadedPlan && !isDirty) {
                                                            handleActivatePlan(loadedPlan.id);
                                                        } else {
                                                            setIsActivatingAfterSave(true);
                                                            setShowSaveModal(true);
                                                        }
                                                    }}
                                                    disabled={activating}
                                                    className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-500/20 transition-all flex items-center justify-center gap-3 group"
                                                >
                                                    {activating ? <RefreshCw className="animate-spin" /> : <Rocket size={24} className="group-hover:scale-110 transition-transform" />}
                                                    {loadedPlan && !isDirty ? 'Start This Automation' : (loadedPlan ? 'Save Changes & Start' : 'Save & Start Automation')}
                                                </button>
                                                <p className="text-[10px] text-center mt-3 font-bold text-zinc-400 uppercase tracking-widest">
                                                    This will create a Master Task and begin auto-dispatching to workers
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {viewMode === 'gantt' && result && (
                            <div className="card p-6 overflow-x-auto">
                                <div className="min-w-[800px] space-y-12">
                                    {Object.entries(ganttData).map(([workerKey, tasks]) => {
                                        const displayName = workerKey.split('_')[0];
                                        return (
                                            <div key={workerKey}>
                                                <div className="flex items-center gap-4 mb-4"><div className="bg-zinc-900 text-white text-[10px] h-6 px-3 rounded-full flex items-center font-black uppercase tracking-widest">{displayName}</div><div className="h-[1px] flex-1 bg-zinc-100 dark:bg-zinc-800" /></div>
                                                <div className="relative h-12 bg-zinc-50 dark:bg-zinc-900 rounded-xl overflow-hidden">
                                                    {tasks.map(task => {
                                                        const startPercent = ((new Date(task.startTime) - new Date(result.schedule[0].startTime)) / (totalMinutes * 60000)) * 100;
                                                        const widthPercent = (task.duration / totalMinutes) * 100;
                                                        return <div key={task.id} style={{ left: `${startPercent}%`, width: `${widthPercent}%` }} className="absolute inset-y-2 bg-blue-500 rounded-lg flex items-center px-2 shadow-lg"><span className="text-[9px] font-black text-white truncate">{task.name}</span></div>;
                                                    })}
                                                </div>

                                                <div className="mt-6 flex gap-4">
                                                    <button
                                                        onClick={() => setPhase('design')}
                                                        className="flex-1 h-12 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl font-bold flex items-center justify-center gap-2"
                                                    >
                                                        <GitBranch size={18} /> Modify Design
                                                    </button>
                                                    <button
                                                        onClick={() => handleDiscardPlan(loadedPlan.id)}
                                                        className="flex-1 h-12 bg-red-50 text-red-600 border border-red-100 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
                                                    >
                                                        <Trash2 size={18} /> Discard Automation
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {viewMode === 'workers' && result && (
                            <div className="card p-6">
                                <h3 className="font-black text-sm uppercase tracking-widest mb-8">Worker Efficiency</h3>
                                <div className="space-y-4">
                                    {result.summary.utilization.map(w => (
                                        <div key={w.id} className="space-y-1">
                                            <div className="flex justify-between text-xs font-bold uppercase"><span>{w.name} ({w.assignedStep})</span><span>{w.utilizationRate}%</span></div>
                                            <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${w.utilizationRate}%` }} /></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Save Modal */}
            <AnimatePresence>{showSaveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-zinc-950 p-8 rounded-3xl w-full max-w-md shadow-2xl">
                        <h3 className="text-2xl font-black mb-6">Save Plan</h3>
                        <input className="input w-full h-14 mb-6" placeholder="Plan Name" value={saveName} onChange={e => setSaveName(e.target.value)} />
                        <div className="flex gap-3">
                            <button
                                className="btn-primary flex-1 h-12"
                                onClick={() => handleSavePlan(isActivatingAfterSave)}
                                disabled={saving}
                            >
                                {isActivatingAfterSave ? 'Save & Start Automation' : 'Save'}
                            </button>
                            <button className="btn-secondary px-6" onClick={() => { setShowSaveModal(false); setIsActivatingAfterSave(false); }}>Cancel</button>
                        </div>
                    </motion.div>
                </div>
            )}</AnimatePresence>

            {/* Plans Sidebar */}
            <AnimatePresence>{showPlansPanel && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
                    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="w-full max-w-sm bg-white dark:bg-zinc-950 h-full shadow-2xl p-6 overflow-y-auto">
                        <div className="flex items-center justify-between mb-8"><h3 className="text-xl font-black">Saved Plans</h3><button onClick={() => setShowPlansPanel(false)}><X /></button></div>
                        <div className="space-y-4">{savedPlans.map(p => (
                            <div key={p.id} className={`p-4 rounded-2xl border ${loadedPlan?.id === p.id ? 'border-blue-500 bg-blue-50' : 'border-zinc-200'}`}>
                                <h4 className="font-black mb-2">{p.name}</h4>
                                <div className="flex gap-2">
                                    <button onClick={() => handleLoadPlan(p.id)} className="btn-secondary text-[10px] py-1 flex-1">Load</button>
                                    {!isAdmin && p.status === 'draft' && <button onClick={() => handleActivatePlan(p.id)} disabled={activating === p.id} className="btn-primary text-[10px] py-1 flex-1">Activate</button>}
                                    {!isAdmin && p.status === 'active' && <button onClick={() => handleDiscardPlan(p.id)} disabled={activating === p.id} className="btn-danger text-[10px] py-1 flex-1">Discard</button>}
                                    <button onClick={() => handleDeletePlan(p.id)} className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ))}</div>
                    </motion.div>
                </div>
            )}</AnimatePresence>
        </motion.div >
    );
}
