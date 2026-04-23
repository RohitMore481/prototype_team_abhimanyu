import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';
import { Play, Pause, CheckCircle, Clock, AlertTriangle, Cpu, X, Loader2, History, ClipboardList, User } from 'lucide-react';
import CreditWidget from '../components/CreditWidget';

const PAUSE_REASONS = [
  'Material not available',
  'Machine issue',
  'Waiting for instructions',
  'Break',
  'Other',
];

function ProgressBar({ progress, color = 'bg-blue-500', label, sublabel }) {
  return (
    <div className="space-y-1.5 w-full">
      {(label || sublabel) && (
        <div className="flex justify-between items-end px-0.5">
          {label && <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</span>}
          {sublabel && <span className="text-[10px] font-mono font-bold text-zinc-400">{sublabel}</span>}
        </div>
      )}
      <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden border border-zinc-200/50 dark:border-zinc-700/50 shadow-inner">
        <div
          className={`h-full ${color} transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(59,130,246,0.3)]`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}

function PauseModal({ onConfirm, onClose }) {
  const { t } = useLanguage();
  const [reason, setReason] = useState(PAUSE_REASONS[0]);
  const [otherText, setOtherText] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-w-sm rounded-2xl shadow-xl animate-slide-in flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/20">
          <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">{t('pause_task')}?</h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            {PAUSE_REASONS.map(r => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200
                  ${reason === r ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-500 shadow-sm' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-500'}`}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === 'Other' && (
            <textarea
              className="input resize-none w-full"
              rows={2}
              placeholder="Describe the issue..."
              value={otherText}
              onChange={e => setOtherText(e.target.value)}
            />
          )}
          <div className="flex gap-3 pt-2">
            <button
              className="btn-warning flex-1 justify-center py-3 text-base"
              onClick={() => onConfirm(reason, reason === 'Other' ? otherText : undefined)}
            >
              <Pause size={18} /> {t('pause_task')}
            </button>
            <button className="btn-secondary py-3 px-6" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ tasks, onClose }) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/50 dark:bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-2xl animate-scale-in flex flex-col overflow-hidden">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-xl">
              <History size={20} />
            </div>
            <div>
              <h3 className="font-bold text-xl text-zinc-900 dark:text-zinc-50">{t('completion_logs')}</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{tasks.length} {t('done')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tasks.length === 0 ? (
            <div className="text-center py-20 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
              <ClipboardList size={40} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
              <p className="text-zinc-500 font-medium">No completed tasks yet</p>
            </div>
          ) : (
            tasks.map(t => <TaskCard key={t.id} task={t} hideActions={true} />)
          )}
        </div>
      </div>
    </div>
  );
}

function OfflineValidationModal({ pendingData, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const reasons = [
    'Shift ended',
    'Machine breakdown',
    'Material not available',
    'Supervisor instruction',
    'Personal reason'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-w-sm rounded-2xl shadow-xl animate-slide-in flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-red-100 dark:border-red-900/30 flex items-center justify-between bg-red-50/50 dark:bg-red-950/20">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle size={20} />
            <h3 className="font-bold text-lg">Incomplete Work</h3>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex flex-col gap-2 p-3 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <div className="flex justify-between items-center text-sm">
              <span className="text-zinc-500 font-medium tracking-wide flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500" /> Pending Tasks</span>
              <span className="font-bold">{pendingData.pendingTasks}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-zinc-500 font-medium tracking-wide flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500" /> Delayed Tasks</span>
              <span className="font-bold">{pendingData.delayedTasks}</span>
            </div>
            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-2 flex justify-between items-center text-sm">
              <span className="text-zinc-500 font-medium tracking-wide flex items-center gap-2"><Clock size={12} /> Est. Remaining Time</span>
              <span className="font-bold">{pendingData.estimatedTime}m</span>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Reason for leaving</label>
              <select
                className="input w-full"
                value={reason}
                onChange={e => setReason(e.target.value)}
              >
                <option value="" disabled>Select a reason...</option>
                {reasons.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Note (Optional)</label>
              <textarea
                className="input resize-none w-full"
                rows={2}
                placeholder="Additional details..."
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              className="btn flex-1 py-3 justify-center border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/20 font-bold"
              onClick={() => onConfirm(reason, note)}
              disabled={!reason}
            >
              Go Offline Anyway
            </button>
            <button className="btn-secondary py-3 px-6" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task, onAction, isPool, onClaim, hideActions, isOnBreak }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [timeState, setTimeState] = useState({
    elapsed: '00:00:00',
    progress: 0,
    isExceeded: false,
    displayLabel: 'Time Left'
  });

  useEffect(() => {
    if (task.status === 'completed' || task.status === 'not_started') return;

    const update = () => {
      let totalSeconds = task.total_elapsed_seconds || 0;
      if (task.status === 'in_progress' && task.last_action_at) {
        totalSeconds += Math.floor((Date.now() - new Date(task.last_action_at).getTime()) / 1000);
      }

      const expectedSeconds = task.expected_minutes * 60;
      const diffSeconds = expectedSeconds - totalSeconds;

      const isExceeded = diffSeconds < 0;
      const absSeconds = Math.abs(diffSeconds);

      const h = Math.floor(absSeconds / 3600);
      const m = Math.floor((absSeconds % 3600) / 60);
      const s = Math.floor(absSeconds % 60);
      const formatted = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

      const p = (totalSeconds / expectedSeconds) * 100;

      setTimeState({
        elapsed: formatted,
        progress: p,
        isExceeded,
        displayLabel: isExceeded ? 'Exceeded' : 'Time Left'
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [task.status, task.total_elapsed_seconds, task.last_action_at, task.expected_minutes]);

  const overtime = task.deadline_at && new Date() > new Date(task.deadline_at);

  const handleAction = async (action, pauseReason, note) => {
    if (action === 'pause') {
      action = 'pause_request';
    }

    setLoading(true);
    try {
      await api.put(`/tasks/${task.id}`, { action, pause_reason: pauseReason, note });
      toast.success(action === 'start' ? t('active') : action === 'pause_request' ? 'Pause request submitted' : t('done'));
      onAction();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const statusBorderGlow = {
    in_progress: 'border-l-blue-500 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm',
    delayed: 'border-l-red-500 border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20',
    paused: 'border-l-amber-500 border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20',
    completed: 'border-l-emerald-500 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 opacity-70',
    not_started: 'border-l-zinc-400 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900',
  }[task.status] || '';

  return (
    <div className={`rounded-xl border border-l-4 transition-all duration-300 p-5 ${statusBorderGlow}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={`badge badge-${task.priority} capitalize`}>{t(task.priority)}</span>
            {!isPool && <span className={`badge badge-${task.status}`}>{t(task.status)}</span>}
            {isPool && <span className="badge bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20">{t('task_pool')}</span>}
            {overtime && task.status !== 'completed' && (
              <span className="badge bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                <AlertTriangle size={10} /> OVERDUE
              </span>
            )}
            {task.status === 'completed' && task.credits_earned > 0 && (
              <span className="badge bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 font-black">
                +{task.credits_earned} Credits Earned
              </span>
            )}
            {task.status !== 'completed' && task.credit_value > 0 && (
              <span className="badge bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20 font-black">
                Worth {task.credit_value} Credits
              </span>
            )}
          </div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-lg leading-snug tracking-tight">{task.title}</h3>
          {task.description && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{task.description}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-5">
        {task.machine_name && (
          <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${task.machine_status === 'breakdown' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
            <Cpu size={12} className={task.machine_status === 'breakdown' ? 'text-red-500' : 'text-zinc-400'} /> {task.machine_name}
            {task.machine_status === 'breakdown' && <span className="ml-1 flex items-center gap-1 font-bold text-[10px] uppercase text-red-600"><AlertTriangle size={10} /> Machine Broken</span>}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
          <Clock size={12} className="text-zinc-400" /> {task.expected_minutes}m {t('expected')}
        </span>
        {task.status === 'delayed' && (
          <span className="flex items-center gap-1.5 text-red-600 font-bold animate-pulse">
            <AlertTriangle size={12} /> {t('delayed')}
          </span>
        )}
      </div>

      {(task.status === 'in_progress' || task.status === 'paused') && (
        <div className="mb-5 space-y-3">
          <div className={`flex justify-between items-center px-4 py-2 rounded-xl border transition-colors ${timeState.isExceeded ? 'bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20' : 'bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20'}`}>
            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${timeState.isExceeded ? 'text-red-600 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>{timeState.displayLabel}</span>
            <span className={`text-xl font-mono font-bold tracking-tighter ${timeState.isExceeded ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>{timeState.elapsed}</span>
          </div>
          <ProgressBar
            progress={timeState.progress}
            label={t('status')}
            sublabel={timeState.isExceeded ? 'Deadline Exceeded' : `${Math.round(timeState.progress)}%`}
            color={timeState.isExceeded ? 'bg-red-500' : 'bg-blue-500'}
          />
        </div>
      )}

      {!hideActions && (
        <>
          {isPool ? (
            <button
              className={`btn-primary w-full py-3 ${isOnBreak || task.machine_status === 'breakdown' ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !isOnBreak && task.machine_status !== 'breakdown' && onClaim()}
              disabled={loading || isOnBreak || task.machine_status === 'breakdown'}
              title={isOnBreak ? 'Finish your current active task before accepting a new one' : task.machine_status === 'breakdown' ? 'Cannot claim: Machine is broken' : ''}
            >
              {loading ? <Loader2 size={16} className="animate-spin mr-1" /> : <Play size={16} className="mr-1" />}
              {t('accept_task')}
            </button>
          ) : task.status === 'completed' ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                <CheckCircle size={18} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold tracking-wide">{t('done')}</span>
              </div>
              {task.credits_earned > 0 && (
                <div className="text-center animate-bounce-in">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">Reward Secured</span>
                  <p className="text-sm font-black text-amber-500">+{task.credits_earned} Performance Points</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              {(task.status === 'not_started' || task.status === 'paused') && (
                <button
                  className={`btn-success flex-1 justify-center py-3 ${isOnBreak || task.machine_status === 'breakdown' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => !isOnBreak && task.machine_status !== 'breakdown' && handleAction('start')}
                  disabled={loading || isOnBreak || task.machine_status === 'breakdown'}
                  title={isOnBreak ? 'Finish your current active task first' : task.machine_status === 'breakdown' ? 'Machine is broken' : ''}
                >
                  {loading ? <Loader2 size={16} className="animate-spin mr-1" /> : <Play size={16} className="mr-1" />}
                  {task.status === 'paused' ? t('resume_task') : t('start_task')}
                </button>
              )}
              {task.status === 'in_progress' && <>
                <button className="btn-secondary text-amber-600 border-amber-200 flex-1 justify-center py-3" onClick={() => setShowPause(true)} disabled={loading}>
                  {loading ? <Loader2 size={16} className="animate-spin mr-1" /> : <Pause size={16} className="mr-1" />}
                  {t('pause_task')}
                </button>
                <button className={`btn-success flex-1 justify-center py-3 ${task.machine_status === 'breakdown' ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={() => task.machine_status !== 'breakdown' && handleAction('complete')} disabled={loading || task.machine_status === 'breakdown'}>
                  {loading ? <Loader2 size={16} className="animate-spin mr-1" /> : <CheckCircle size={16} className="mr-1" />}
                  {t('done')}
                </button>
              </>}
            </div>
          )}
        </>
      )}

      {showPause && <PauseModal onClose={() => setShowPause(false)} onConfirm={(reason, note) => { setShowPause(false); handleAction('pause', reason, note); }} />}
    </div>
  );
}

export default function WorkerDashboard() {
  const { user, getImageUrl } = useAuth();
  const { socket } = useSocket();
  const { t } = useLanguage();
  const [tasks, setTasks] = useState([]);
  const [poolTasks, setPoolTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [breakStatus, setBreakStatus] = useState({ is_on_break: false, already_taken_today: false });
  const [breakProgress, setBreakProgress] = useState(0);
  const [breakTimeLeft, setBreakTimeLeft] = useState('');
  const [pendingRequests, setPendingRequests] = useState([]);

  // Shift Control State
  const [isLive, setIsLive] = useState(Boolean(user?.is_live));
  const [validatingOffline, setValidatingOffline] = useState(false);
  const [offlinePendingData, setOfflinePendingData] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await api.get('/requests');
      setPendingRequests(res.data.filter(r => r.status === 'pending'));
    } catch { }
  }, []);

  useEffect(() => {
    if (!breakStatus.is_on_break || !breakStatus.current_break) return;
    const update = () => {
      const start = new Date(breakStatus.current_break.start_time).getTime();
      const durationMs = (breakStatus.duration_mins || 30) * 60 * 1000;
      const elapsed = Date.now() - start;
      const p = (elapsed / durationMs) * 100;
      setBreakProgress(p);

      const leftMs = Math.max(0, durationMs - elapsed);
      const mins = Math.floor(leftMs / 60000);
      const secs = Math.floor((leftMs % 60000) / 1000);
      setBreakTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [breakStatus.is_on_break, breakStatus.current_break, breakStatus.duration_mins]);

  const fetchBreakStatus = useCallback(async () => {
    try {
      const res = await api.get('/breaks/status');
      setBreakStatus(res.data);
    } catch { }
  }, []);

  const handleBreak = async (action) => {
    if (action === 'start') {
      try {
        await api.post('/requests', { type: 'break' });
        toast.success('Break request sent to supervisor');
        fetchRequests();
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to send break request');
      }
      return;
    }

    try {
      await api.post(`/breaks/${action}`);
      toast.success(t('active'));
      fetchBreakStatus();
      fetchTasks();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Break action failed');
    }
  };

  const fetchTasks = useCallback(async () => {
    try {
      const [resMyTasks, resPoolTasks] = await Promise.all([api.get('/tasks'), api.get('/tasks/pool')]);
      setTasks(resMyTasks.data);
      setPoolTasks(resPoolTasks.data);
    } catch { }
    setLoading(false);
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/analytics/summary');
      setProjectName(res.data.projectName);
    } catch { }
  }, []);

  const handleClaim = async (taskId) => {
    try {
      await api.put(`/tasks/${taskId}/claim`);
      toast.success(t('active'));
      fetchTasks();
    } catch (err) { toast.error('Claim failed'); }
  };

  const handleGoLive = async () => {
    setShiftLoading(true);
    try {
      await api.post('/users/go-live', { userId: user.id, startTime: new Date().toISOString() });
      setIsLive(true);
      toast.success('🟢 Shift Started - You are now Live');
    } catch (err) {
      toast.error('Failed to go live');
    } finally {
      setShiftLoading(false);
    }
  };

  const attemptGoOffline = async () => {
    setShiftLoading(true);
    try {
      const res = await api.get(`/tasks/pending/${user.id}`);
      const { pendingTasks, delayedTasks } = res.data;
      if (pendingTasks === 0 && delayedTasks === 0) {
        await executeGoOffline(0, 0, 'Shift ended (All clear)', '');
      } else {
        setOfflinePendingData(res.data);
        setValidatingOffline(true);
      }
    } catch (err) {
      toast.error('Failed to validate shift status');
    } finally {
      setShiftLoading(false);
    }
  };

  const executeGoOffline = async (pending, delayed, reason, note) => {
    setShiftLoading(true);
    try {
      await api.post('/users/go-offline', {
        userId: user.id,
        pendingTasks: pending,
        delayedTasks: delayed,
        reason,
        note,
        endTime: new Date().toISOString()
      });
      setIsLive(false);
      setValidatingOffline(false);
      setOfflinePendingData(null);
      toast.success('🔴 Shift Ended - You are now Offline', { icon: '👋' });
    } catch (err) {
      toast.error('Failed to go offline');
    } finally {
      setShiftLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); fetchBreakStatus(); fetchRequests(); fetchSummary(); }, [fetchTasks, fetchBreakStatus, fetchRequests, fetchSummary]);
  useEffect(() => {
    if (!socket) return;
    socket.on('task:updated', () => { fetchTasks(); fetchRequests(); });
    socket.on('task:deleted', fetchTasks);
    socket.on('request:new', fetchRequests);
    socket.on('request:updated', () => {
      fetchRequests();
      fetchTasks();
      fetchBreakStatus();
    });
    socket.on('user:status', (data) => {
      if (data.userId === user?.id) {
        fetchBreakStatus();
        fetchRequests();
      }
      fetchTasks();
    });
    socket.on('notification:new', n => toast(n.message, { icon: 'ℹ️' }));
    return () => {
      socket.off('task:updated');
      socket.off('task:deleted');
      socket.off('request:new');
      socket.off('request:updated');
      socket.off('user:status');
      socket.off('notification:new');
    };
  }, [socket, fetchTasks, fetchBreakStatus, user?.id]);

  const active = tasks.filter(t => ['in_progress', 'delayed'].includes(t.status));
  const pending = tasks.filter(t => ['not_started', 'paused'].includes(t.status));
  const done = tasks.filter(t => t.status === 'completed');

  return (
    <div className="space-y-6 animate-slide-in max-w-[1400px] mx-auto pb-12 px-4 lg:px-8">
      {/* Credit System Widget */}
      {user?.role === 'worker' && <CreditWidget />}

      <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden relative">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border-2 border-white dark:border-zinc-800 shadow-lg flex items-center justify-center overflow-hidden shrink-0">
              {user?.profile_picture ? (
                <img src={getImageUrl(user.profile_picture)} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <User size={32} className="text-zinc-400" />
              )}
            </div>
            <div>
              <p className="text-zinc-400 text-sm font-semibold uppercase tracking-widest">{t('welcome')}</p>
              <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white mt-1 tracking-tight">{user?.name}</h1>
              {projectName && (
                <div className="mt-4 flex items-center gap-2 group">
                  <div className="w-1 h-6 bg-blue-500 rounded-full group-hover:scale-y-125 transition-transform" />
                  <div>
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] leading-none mb-1">Active Project</p>
                    <p className="text-xl font-black text-zinc-800 dark:text-zinc-100 tracking-tight leading-none">{projectName}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Shift Control Toggle */}
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700/50 shadow-inner mr-4">
              <button
                onClick={handleGoLive}
                disabled={isLive || shiftLoading}
                className={`relative px-6 py-2.5 rounded-lg flex items-center gap-2 font-black transition-all duration-300 disabled:cursor-not-allowed ${isLive ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${isLive ? 'bg-white animate-pulse' : 'bg-emerald-500'}`} />
                LIVE
              </button>
              <button
                onClick={attemptGoOffline}
                disabled={!isLive || shiftLoading}
                className={`relative px-6 py-2.5 rounded-lg flex items-center gap-2 font-black transition-all duration-300 disabled:cursor-not-allowed ${!isLive ? 'bg-zinc-800 dark:bg-zinc-700 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50'}`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${!isLive ? 'bg-red-500' : 'bg-zinc-400 dark:bg-zinc-600'}`} />
                OFFLINE
              </button>
            </div>

            {breakStatus.is_on_break ? (
              <div className="flex flex-col items-end gap-2 min-w-[200px]">
                <button className="btn-success px-6 py-2 font-bold group w-full" onClick={() => handleBreak('stop')}>
                  <Play size={18} className="mr-2" /> {t('end_break')}
                </button>
                <ProgressBar progress={breakProgress} color="bg-emerald-500" sublabel={breakTimeLeft} />
              </div>
            ) : pendingRequests.some(r => r.type === 'break') ? (
              <div className="flex flex-col items-end gap-2 min-w-[200px]">
                <button
                  className="px-6 py-3 font-bold rounded-xl border bg-amber-50 dark:bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-500/20 cursor-wait w-full flex items-center justify-center animate-pulse"
                  disabled
                >
                  <Clock size={18} className="mr-2" /> Pending Approval
                </button>
              </div>
            ) : (
              <button
                className={`px-6 py-3 font-bold group rounded-xl border flex items-center transition-all duration-200 ${breakStatus.already_taken_today || !isLive ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700 cursor-not-allowed opacity-60' : 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:scale-105 active:scale-95 shadow-lg'}`}
                onClick={() => !breakStatus.already_taken_today && isLive && handleBreak('start')}
                disabled={breakStatus.already_taken_today || !isLive}
                title={!isLive ? 'Go Live to take a break' : ''}
              >
                <Pause size={18} className="mr-2" /> {breakStatus.already_taken_today ? t('break_taken') : t('take_break')}
              </button>
            )}
            <button className="btn-secondary px-6 py-3 font-bold group" onClick={() => setShowHistory(true)}>
              <History size={18} className="mr-2 group-hover:rotate-[-15deg] transition-transform" /> {t('view_history')}
            </button>
            <div className="flex gap-4 text-sm bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700/50">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> <span className="text-zinc-500 dark:text-zinc-300 font-medium">{active.length} {t('active')}</span></div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> <span className="text-zinc-500 dark:text-zinc-300 font-medium">{pending.length} {t('pending')}</span></div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> <span className="text-zinc-500 dark:text-zinc-300 font-medium">{done.length} {t('done')}</span></div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="text-zinc-400 animate-spin" /></div>
      ) : (
        <div className="space-y-8">
          {poolTasks.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2 flex items-center justify-between">
                <span>{t('task_pool')}</span>
                <span className="bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 px-2 py-0.5 rounded-lg">{poolTasks.length} {t('pending')}</span>
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {poolTasks.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    isPool={true}
                    onClaim={() => handleClaim(t.id)}
                    isOnBreak={breakStatus.is_on_break || active.length > 0}
                  />
                ))}
              </div>
            </div>
          )}

          {active.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">{t('active_tasks')}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {active.map(t => <TaskCard key={t.id} task={t} onAction={fetchTasks} isOnBreak={breakStatus.is_on_break} />)}
              </div>
            </div>
          )}

          {pending.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">{t('pending_paused')}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {pending.map(t => <TaskCard key={t.id} task={t} onAction={fetchTasks} isOnBreak={breakStatus.is_on_break || active.length > 0} />)}
              </div>
            </div>
          )}

          {active.length === 0 && pending.length === 0 && poolTasks.length === 0 && (
            <div className="text-center py-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center">
              <p className="text-5xl mb-4 opacity-50">🎉</p>
              <p className="text-zinc-900 dark:text-zinc-100 font-bold text-lg tracking-tight">No tasks assigned yet</p>
            </div>
          )}
        </div>
      )}

      {showHistory && <HistoryModal tasks={done} onClose={() => setShowHistory(false)} />}

      {validatingOffline && offlinePendingData && (
        <OfflineValidationModal
          pendingData={offlinePendingData}
          onClose={() => setValidatingOffline(false)}
          onConfirm={(reason, note) => executeGoOffline(offlinePendingData.pendingTasks, offlinePendingData.delayedTasks, reason, note)}
        />
      )}

      {!isLive && !loading && (
        <div className="absolute inset-0 z-[45] bg-white/70 dark:bg-black/60 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl flex flex-col items-center p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-6 border border-zinc-700">
              <User size={32} className="text-zinc-500" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight mb-2">You are Offline</h2>
            <p className="text-zinc-400 font-medium">Please Go Live to view your task pool and begin your shift.</p>
            <button
              onClick={handleGoLive}
              disabled={shiftLoading}
              className="mt-8 btn-primary w-full py-4 text-lg font-black animate-pulse shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] bg-emerald-500 hover:bg-emerald-600 border-emerald-400"
            >
              Start Shift (Go Live)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

