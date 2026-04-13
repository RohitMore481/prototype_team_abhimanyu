import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';
import { Play, Pause, CheckCircle, Clock, AlertTriangle, Cpu, X, Loader2, History, ClipboardList } from 'lucide-react';

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

function LogsModal({ tasks, onClose }) {
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

function TaskCard({ task, onAction, isPool, onClaim, hideActions, isOnBreak }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (task.status !== 'in_progress' || !task.started_at) {
      setProgress(0);
      return;
    }
    const update = () => {
      const elapsed = (Date.now() - new Date(task.started_at).getTime()) / 60000;
      const p = (elapsed / task.expected_minutes) * 100;
      setProgress(p);
    };
    update();
    const timer = setInterval(update, 10000);
    return () => clearInterval(timer);
  }, [task.status, task.started_at, task.expected_minutes]);

  const elapsed = task.started_at
    ? Math.round((Date.now() - new Date(task.started_at).getTime()) / 60000)
    : null;
  const overtime = task.deadline_at && new Date() > new Date(task.deadline_at);

  const handleAction = async (action, pauseReason, note) => {
    setLoading(true);
    try {
      await api.put(`/tasks/${task.id}`, { action, pause_reason: pauseReason, note });
      toast.success(action === 'start' ? t('active') : action === 'pause' ? t('pending') : t('done'));
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
          </div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-lg leading-snug tracking-tight">{task.title}</h3>
          {task.description && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{task.description}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-5">
        {task.machine_name && (
          <span className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md text-zinc-700 dark:text-zinc-300">
            <Cpu size={12} className="text-zinc-400" /> {task.machine_name}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
          <Clock size={12} className="text-zinc-400" /> {task.expected_minutes}m {t('expected')}
        </span>
      </div>

      {task.status === 'in_progress' && (
        <div className="mb-5">
          <ProgressBar
            progress={progress}
            label={t('status')}
            sublabel={progress >= 100 ? 'Delayed' : `${Math.round(progress)}%`}
            color={progress >= 100 ? 'bg-red-500' : 'bg-blue-500'}
          />
        </div>
      )}

      {!hideActions && (
        <>
          {isPool ? (
            <button
              className={`btn-primary w-full py-3 ${isOnBreak ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !isOnBreak && onClaim()}
              disabled={loading || isOnBreak}
              title={isOnBreak ? 'Cannot accept new tasks while on break or working' : ''}
            >
              {loading ? <Loader2 size={16} className="animate-spin mr-1" /> : <Play size={16} className="mr-1" />}
              {t('accept_task')}
            </button>
          ) : task.status === 'completed' ? (
            <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
              <CheckCircle size={18} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold tracking-wide">{t('done')}</span>
            </div>
          ) : (
            <div className="flex gap-2">
              {(task.status === 'not_started' || task.status === 'paused') && (
                <button
                  className={`btn-success flex-1 justify-center py-3 ${isOnBreak ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => !isOnBreak && handleAction('start')}
                  disabled={loading || isOnBreak}
                  title={isOnBreak ? 'Cannot resume while on break' : ''}
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
                <button className="btn-success flex-1 justify-center py-3" onClick={() => handleAction('complete')} disabled={loading}>
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
  const { user } = useAuth();
  const { socket } = useSocket();
  const { t } = useLanguage();
  const [tasks, setTasks] = useState([]);
  const [poolTasks, setPoolTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [breakStatus, setBreakStatus] = useState({ is_on_break: false, already_taken_today: false });
  const [breakProgress, setBreakProgress] = useState(0);
  const [breakTimeLeft, setBreakTimeLeft] = useState('');

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
    try {
      await api.post(`/breaks/${action}`);
      toast.success(action === 'start' ? t('on_break') : t('active'));
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

  const handleClaim = async (taskId) => {
    try {
      await api.put(`/tasks/${taskId}/claim`);
      toast.success(t('active'));
      fetchTasks();
    } catch (err) { toast.error('Claim failed'); }
  };

  useEffect(() => { fetchTasks(); fetchBreakStatus(); }, [fetchTasks, fetchBreakStatus]);
  useEffect(() => {
    if (!socket) return;
    socket.on('task:updated', fetchTasks);
    socket.on('task:deleted', fetchTasks);
    socket.on('user:status', (data) => {
      if (data.userId === user?.id) {
        fetchBreakStatus();
      }
      fetchTasks();
    });
    socket.on('notification:new', n => toast(n.message, { icon: 'ℹ️' }));
    return () => {
      socket.off('task:updated', fetchTasks);
      socket.off('task:deleted', fetchTasks);
      socket.off('user:status');
      socket.off('notification:new');
    };
  }, [socket, fetchTasks, fetchBreakStatus, user?.id]);

  const active = tasks.filter(t => ['in_progress', 'delayed'].includes(t.status));
  const pending = tasks.filter(t => ['not_started', 'paused'].includes(t.status));
  const done = tasks.filter(t => t.status === 'completed');

  return (
    <div className="space-y-6 animate-slide-in max-w-[1400px] mx-auto pb-12 px-4 lg:px-8">
      <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden relative">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-zinc-400 text-sm font-semibold uppercase tracking-widest">{t('welcome')}</p>
            <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white mt-1 tracking-tight">{user?.name}</h1>
          </div>
          <div className="flex items-center gap-4">
            {breakStatus.is_on_break ? (
              <div className="flex flex-col items-end gap-2 min-w-[200px]">
                <button className="btn-success px-6 py-2 font-bold group w-full" onClick={() => handleBreak('stop')}>
                  <Play size={18} className="mr-2" /> {t('end_break')}
                </button>
                <ProgressBar progress={breakProgress} color="bg-emerald-500" sublabel={breakTimeLeft} />
              </div>
            ) : (
              <button
                className={`px-6 py-3 font-bold group rounded-xl border flex items-center transition-all duration-200 ${breakStatus.already_taken_today ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700 cursor-not-allowed opacity-60' : 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:scale-105 active:scale-95 shadow-lg'}`}
                onClick={() => !breakStatus.already_taken_today && handleBreak('start')}
                disabled={breakStatus.already_taken_today}
              >
                <Pause size={18} className="mr-2" /> {breakStatus.already_taken_today ? t('break_taken') : t('take_break')}
              </button>
            )}
            <button className="btn-secondary px-6 py-3 font-bold group" onClick={() => setShowLogs(true)}>
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
                {pending.map(t => <TaskCard key={t.id} task={t} onAction={fetchTasks} isOnBreak={breakStatus.is_on_break} />)}
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

      {showLogs && <LogsModal tasks={done} onClose={() => setShowLogs(false)} />}
    </div>
  );
}

