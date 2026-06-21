import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';
import { Play, Pause, CheckCircle, Clock, AlertTriangle, X, Loader2, History, ClipboardList, User, Coffee, Wrench } from 'lucide-react';
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

function TaskCard({ task, onAction, hideActions, isOnBreak }) {
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
    if (action === 'pause') action = 'pause_request';
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
            <span className={`badge badge-${task.status}`}>{t(task.status)}</span>
            {task.title.startsWith('[Automation]') && <span className="badge bg-purple-50 text-purple-700 border-purple-200 font-bold uppercase text-[9px]">Automation</span>}
            {overtime && task.status !== 'completed' && <span className="badge bg-red-50 text-red-700 border-red-200 font-bold uppercase text-[9px]">Overdue</span>}
          </div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-lg leading-snug tracking-tight">{task.title}</h3>
          {task.description && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{task.description}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-5">
        <span className="flex items-center gap-1.5"><Clock size={12} /> {task.expected_minutes}m Expected</span>
      </div>

      {(task.status === 'in_progress' || task.status === 'paused') && (
        <div className="mb-5 space-y-3">
          <div className={`flex justify-between items-center px-4 py-2 rounded-xl border ${timeState.isExceeded ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
            <span className="text-[10px] font-black uppercase text-blue-700">{timeState.displayLabel}</span>
            <span className="text-xl font-mono font-bold text-blue-600">{timeState.elapsed}</span>
          </div>
          <ProgressBar progress={timeState.progress} color={timeState.isExceeded ? 'bg-red-500' : 'bg-blue-500'} sublabel={`${Math.round(timeState.progress)}%`} />
        </div>
      )}

      {!hideActions && task.status !== 'completed' && (
        <div className="flex gap-2">
          {(task.status === 'not_started' || task.status === 'paused') && (
            <button className="btn-success flex-1 py-3" onClick={() => !isOnBreak && handleAction('start')} disabled={loading || isOnBreak}><Play size={16} className="mr-2" /> Start</button>
          )}
          {task.status === 'in_progress' && (
            <>
              <button className="btn-secondary flex-1 py-3" onClick={() => setShowPause(true)} disabled={loading}><Pause size={16} className="mr-2" /> Pause</button>
              <button className="btn-success flex-1 py-3" onClick={() => handleAction('complete')} disabled={loading}><CheckCircle size={16} className="mr-2" /> Complete</button>
            </>
          )}
        </div>
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
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [breakStatus, setBreakStatus] = useState({ is_on_break: false, already_taken_today: false });
  const [breakProgress, setBreakProgress] = useState(0);
  const [breakTimeLeft, setBreakTimeLeft] = useState('');
  const [pendingRequests, setPendingRequests] = useState([]);

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

  const handleRequestBreak = async () => {
    try {
      await api.post('/requests', { type: 'break' });
      toast.success('Break request submitted to supervisor');
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to request break');
    }
  };

  const handleEndBreak = async () => {
    try {
      await api.post('/breaks/stop');
      toast.success('Break ended. Resuming tasks!');
      fetchBreakStatus();
      fetchTasks();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to stop break');
    }
  };

  const handleReportBreakdown = async (machineId, machineName) => {
    if (!window.confirm(`Are you sure you want to report a breakdown for ${machineName}? This will pause all active tasks on this machine.`)) return;
    try {
      await api.post('/requests', { type: 'breakdown', data: { machine_id: machineId } });
      toast.success('Breakdown report submitted to supervisor');
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to report breakdown');
    }
  };

  const fetchBreakStatus = useCallback(async () => {
    try {
      const res = await api.get('/breaks/status');
      setBreakStatus(res.data);
    } catch { }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.get('/tasks');
      setTasks(res.data);
    } catch { }
    setLoading(false);
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/analytics/summary');
      setProjectName(res.data.projectName);
    } catch { }
  }, []);

  const handleGoLive = async () => {
    setShiftLoading(true);
    try {
      await api.post('/users/go-live', { userId: user.id, startTime: new Date().toISOString() });
      setIsLive(true);
      toast.success('Shift Started');
    } catch { } finally { setShiftLoading(false); }
  };

  const attemptGoOffline = async () => {
    setShiftLoading(true);
    try {
      const res = await api.get(`/tasks/pending/${user.id}`);
      if (res.data.pendingTasks === 0 && res.data.delayedTasks === 0) {
        await executeGoOffline(0, 0, 'Shift ended', '');
      } else {
        setOfflinePendingData(res.data);
        setValidatingOffline(true);
      }
    } catch { } finally { setShiftLoading(false); }
  };

  const executeGoOffline = async (pending, delayed, reason, note) => {
    setShiftLoading(true);
    try {
      await api.post('/users/go-offline', {
        userId: user.id, pendingTasks: pending, delayedTasks: delayed,
        reason, note, endTime: new Date().toISOString()
      });
      setIsLive(false);
      setValidatingOffline(false);
      toast.success('Shift Ended');
    } catch { } finally { setShiftLoading(false); }
  };

  useEffect(() => { fetchTasks(); fetchBreakStatus(); fetchRequests(); fetchSummary(); }, [fetchTasks, fetchBreakStatus, fetchRequests, fetchSummary]);

  useEffect(() => {
    if (!socket) return;
    const updateAll = () => { fetchTasks(); fetchRequests(); fetchBreakStatus(); };
    socket.on('task:updated', fetchTasks);
    socket.on('user:status', updateAll);
    socket.on('notification:new', n => toast(n.message));
    return () => {
      socket.off('task:updated');
      socket.off('user:status');
      socket.off('notification:new');
    };
  }, [socket, fetchTasks, fetchBreakStatus]);

  const active = tasks.filter(t => ['in_progress', 'delayed'].includes(t.status));
  const pending = tasks.filter(t => ['not_started', 'paused'].includes(t.status));
  const done = tasks.filter(t => t.status === 'completed');

  return (
    <div className="space-y-6 animate-slide-in max-w-[1400px] mx-auto pb-12 px-4 lg:px-8">
      {user?.role === 'worker' && <CreditWidget />}

      <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden relative">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center overflow-hidden shrink-0">
              {user?.profile_picture ? <img src={getImageUrl(user.profile_picture)} className="w-full h-full object-cover" /> : <User size={32} className="text-zinc-400" />}
            </div>
            <div>
              <p className="text-zinc-400 text-sm font-semibold uppercase">{t('welcome')}</p>
              <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white mt-1 tracking-tight">{user?.name}</h1>
              {projectName && <p className="text-sm font-bold text-blue-500 mt-2 uppercase tracking-wide">Project: {projectName}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              <button onClick={handleGoLive} disabled={isLive || shiftLoading} className={`px-6 py-2 rounded-lg font-black ${isLive ? 'bg-emerald-500 text-white' : 'text-zinc-500'}`}>LIVE</button>
              <button onClick={attemptGoOffline} disabled={!isLive || shiftLoading} className={`px-6 py-2 rounded-lg font-black ${!isLive ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>OFFLINE</button>
            </div>
            <button className="btn-secondary px-6 py-3 font-bold" onClick={() => setShowHistory(true)}>History</button>
          </div>
        </div>
      </div>

      {/* Shift & Break Control Center */}
      {isLive && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Shift Stats Card */}
          <div className="card flex items-center gap-4 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-md">
            <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <ClipboardList size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Shift Stats</p>
              <div className="flex gap-4 mt-1">
                <div>
                  <span className="text-zinc-500 text-xs">Done: </span>
                  <span className="font-extrabold text-sm text-emerald-600">{done.length}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs">Active: </span>
                  <span className="font-extrabold text-sm text-blue-600">{active.length}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs">Queue: </span>
                  <span className="font-extrabold text-sm text-zinc-600 dark:text-zinc-300">{pending.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Break Controls Card */}
          <div className="card flex items-center gap-4 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-md">
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Coffee size={24} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Break System</p>
              {breakStatus.is_on_break ? (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-500 animate-pulse">ON BREAK</span>
                  <button onClick={handleEndBreak} className="btn-secondary !py-1 !px-2.5 text-xs font-black uppercase">Resume Work</button>
                </div>
              ) : pendingRequests.some(r => r.type === 'break') ? (
                <p className="text-xs font-bold text-amber-500 mt-1.5 animate-pulse uppercase tracking-tight">Pending Approval...</p>
              ) : breakStatus.already_taken_today ? (
                <p className="text-xs font-bold text-zinc-400 mt-1.5 uppercase">Break Taken Today</p>
              ) : (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-bold text-zinc-500">30 min break</span>
                  <button onClick={handleRequestBreak} className="btn-primary !py-1.5 !px-3 text-xs font-black bg-amber-500 hover:bg-amber-600 border-amber-400">Request Break</button>
                </div>
              )}
            </div>
          </div>

          {/* Issue Reporter Card */}
          <div className="card flex items-center gap-4 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-md">
            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400">
              <Wrench size={24} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Report Issue</p>
              {pendingRequests.some(r => r.type === 'breakdown') ? (
                <p className="text-xs font-bold text-red-500 mt-1.5 animate-pulse uppercase tracking-tight">Issue reported — awaiting review...</p>
              ) : (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-bold text-zinc-500">Equipment problem?</span>
                  <button
                    onClick={() => handleReportBreakdown(null, 'workstation')}
                    className="btn-danger !py-1.5 !px-3 text-xs font-black uppercase bg-red-500 hover:bg-red-600 border-red-400"
                  >
                    Report Issue
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-20 animate-pulse">Loading...</div> : (
        <div className="space-y-8">
          {(active.length > 0 || pending.length > 0) ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...active, ...pending].map(t => <TaskCard key={t.id} task={t} onAction={fetchTasks} isOnBreak={breakStatus.is_on_break} />)}
            </div>
          ) : (
            <div className="text-center py-24 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-[32px] bg-zinc-50/50 dark:bg-zinc-900/20">
              <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-6" />
              <h3 className="text-2xl font-black mb-2">Standing By</h3>
              <p className="text-zinc-500 max-w-sm mx-auto">Waiting for the production engine to dispatch your next task.</p>
            </div>
          )}
        </div>
      )}

      {showHistory && <HistoryModal tasks={done} onClose={() => setShowHistory(false)} />}
      {validatingOffline && offlinePendingData && (
        <OfflineValidationModal pendingData={offlinePendingData} onClose={() => setValidatingOffline(false)} onConfirm={(r, n) => executeGoOffline(offlinePendingData.pendingTasks, offlinePendingData.delayedTasks, r, n)} />
      )}
      {!isLive && !loading && (
        <div className="absolute inset-0 z-50 bg-white/70 dark:bg-black/60 backdrop-blur-md flex items-center justify-center">
          <div className="bg-zinc-900 p-8 rounded-3xl text-center max-w-sm w-full mx-4 shadow-2xl">
            <h2 className="text-2xl font-black text-white mb-4">You are Offline</h2>
            <p className="text-zinc-400 mb-8">Go Live to start receiving tasks.</p>
            <button onClick={handleGoLive} className="btn-primary w-full py-4 text-lg font-black bg-emerald-500 border-emerald-400">Start Shift</button>
          </div>
        </div>
      )}
    </div>
  );
}
