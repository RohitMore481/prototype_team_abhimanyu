import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';
import {
  Plus, Search, Edit2, Trash2, User, Cpu,
  X, Loader2, AlertCircle, AlertTriangle, Clock, ClipboardList, Briefcase
} from 'lucide-react';

const STATUS_ORDER = ['not_started', 'in_progress', 'paused', 'completed', 'delayed'];

function StatusBadge({ status, unassigned, workerStatus, machineStatus, deadline, completedAt, lastLogoutReason, lastLogoutTime }) {
  const { t } = useLanguage();

  let delayInfo = null;
  if (deadline) {
    const d = new Date(deadline);
    const end = (status === 'completed' && completedAt) ? new Date(completedAt) : new Date();
    if (end > d) {
      const mins = Math.floor((end - d) / 60000);
      if (mins > 0) delayInfo = `${mins}m ${t('delayed')}`;
    }
  }

  if (unassigned && status === 'not_started') {
    return <span className="badge badge-unassigned flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> {t('unassigned')}</span>;
  }
  if (status === 'not_started') {
    if (machineStatus === 'running') {
      return <span className="badge badge-delayed flex items-center gap-1"><AlertCircle size={10} /> {t('machine')} Busy</span>;
    }
    if (workerStatus && workerStatus !== 'idle') {
      return <span className="badge badge-paused flex items-center gap-1"><Clock size={10} /> {t('pending')}</span>;
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className={`badge badge-${status}`}>{t(status)}</span>
        {status !== 'completed' && lastLogoutReason && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-500 text-[10px] font-bold group/logout relative cursor-help">
            <AlertTriangle size={10} />
            Worker Logged Out
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl opacity-0 group-hover/logout:opacity-100 transition-opacity pointer-events-none z-50">
              <p className="text-white text-[10px] font-bold mb-1">Incomplete - Worker Logged Out</p>
              <p className="text-zinc-400 text-[10px] leading-relaxed">
                <span className="text-zinc-500">Reason:</span> {lastLogoutReason}
              </p>
              <p className="text-zinc-500 text-[10px] mt-1 italic">
                {new Date(lastLogoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
            </div>
          </div>
        )}
      </div>
      {delayInfo && (
        <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-tighter animate-pulse flex items-center gap-1">
          <AlertCircle size={10} /> {delayInfo}
        </span>
      )}
    </div>
  );
}

function PriorityBadge({ priority }) {
  const { t } = useLanguage();
  return <span className={`badge badge-${priority} capitalize`}>{t(priority)}</span>;
}

function TaskFormModal({ onClose, onSave, editTask, workers, machines }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: editTask?.title || '',
    description: editTask?.description || '',
    machine_id: editTask?.machine_id || '',
    priority: editTask?.priority || 'medium',
    expected_minutes: editTask?.expected_minutes || 30,
    credit_value: editTask?.credit_value || 1,
    project_id: editTask?.project_id || (user?.role === 'supervisor' ? user.project_id : ''),
  });
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    api.get('/projects').then(res => setProjects(res.data)).catch(() => { });
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editTask) {
        await api.put(`/tasks/${editTask.id}`, form);
        toast.success('Task updated');
      } else {
        await api.post('/tasks', form);
        toast.success('Task created');
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl shadow-xl animate-slide-in flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/20">
          <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">{editTask ? t('edit_task') : t('new_task')}</h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">{t('task_title')} <span className="text-red-500">*</span></label>
            <input className="input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required placeholder="e.g. Mill Shaft Components" />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">{t('description')}</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional details..." />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">{t('assign_machine')}</label>
            <select className="select" value={form.machine_id} onChange={e => setForm(p => ({ ...p, machine_id: e.target.value }))}>
              <option value="">— {t('none')} —</option>
              {machines
                .filter(m => user?.role !== 'supervisor' || Number(m.project_id) === Number(user.project_id))
                .map(m => (
                  <option key={m.id} value={m.id} disabled={m.status === 'breakdown'}>
                    {m.name} ({m.status === 'breakdown' ? 'Broken' : m.status})
                  </option>
                ))}
            </select>
          </div>
          {user?.role === 'admin' && (
            <div>
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Project</label>
              <select
                className="select"
                value={form.project_id}
                onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))}
              >
                <option value="">— {t('none')} —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">{t('priority')}</label>
              <select className="select" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="low">{t('low')}</option>
                <option value="medium">{t('medium')}</option>
                <option value="high">{t('high')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Credit Value</label>
              <input
                type="number"
                className="input"
                min="0"
                value={form.credit_value}
                onChange={e => setForm(p => ({ ...p, credit_value: parseInt(e.target.value) || 0 }))}
                placeholder="Default: 1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">{t('expected')} (min)</label>
              <input type="number" className="input" value={form.expected_minutes} onChange={e => setForm(p => ({ ...p, expected_minutes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800 mt-4">
            <button type="submit" className="btn-primary flex-1 justify-center py-2.5" disabled={loading || !form.project_id || !form.machine_id} title={(!form.project_id || !form.machine_id) ? "Please assign a project and a machine to continue" : ""}>
              {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              {editTask ? t('done') : t('new_task')}
            </button>
            <button type="button" className="btn-secondary flex-1 py-2.5" onClick={onClose}>{t('cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OverrideModal({ task, onClose, onSave }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState(task.status);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.put(`/tasks/${task.id}`, { status_override: status });
      toast.success(t('override_status'));
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-w-sm rounded-2xl shadow-xl animate-slide-in flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/20">
          <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">{t('override_status')}</h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <p className="text-xs text-zinc-500 uppercase font-semibold tracking-wider">{t('task')}</p>
            <p className="text-zinc-900 dark:text-zinc-100 font-medium truncate mt-1">{task.title}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">{t('force_status')}</label>
            <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_ORDER.map(s => <option key={s} value={s}>{t(s)}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button className="btn-warning flex-1 justify-center py-2.5" onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              {t('override')}
            </button>
            <button className="btn-secondary flex-1 py-2.5" onClick={onClose}>{t('cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmationModal({ task, onClose, onConfirm }) {
  const { t } = useLanguage();
  const isAssigned = !!task.assigned_worker_id;
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm(task.id);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-w-sm rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
        <div className="p-6 text-center">
          <div className="mx-auto w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mb-4">
            <Trash2 size={32} className="text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">{t('delete_task')}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">{t('confirm_delete')} <span className="font-bold">"{task.title}"</span>?</p>

          {isAssigned && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-left">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-500">{t('task_is_claimed')}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-1">{t('will_vanish')}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleConfirm} disabled={loading} className="btn bg-red-500 hover:bg-red-600 text-white flex-1 justify-center py-3 font-bold">
              {loading ? <Loader2 size={18} className="animate-spin" /> : t('done')}
            </button>
            <button onClick={onClose} disabled={loading} className="btn-secondary flex-1 justify-center py-3">{t('cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { user, getImageUrl } = useAuth();
  const { socket } = useSocket();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [machines, setMachines] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [overrideTask, setOverrideTask] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('filter') || '');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterWorker, setFilterWorker] = useState(searchParams.get('workerId') || '');
  const [filterProject, setFilterProject] = useState(() => user?.role === 'admin' ? (localStorage.getItem('admin_working_project') || '') : '');

  const fetchAll = useCallback(async () => {
    try {
      const [tRes, wRes, mRes, pRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/users/workers'),
        api.get('/machines'),
        api.get('/projects')
      ]);
      setTasks(tRes.data);
      setWorkers(wRes.data);
      setMachines(mRes.data);
      setProjects(pRes.data);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    if (!socket) return;
    socket.on('task:updated', fetchAll);
    socket.on('task:deleted', fetchAll);
    return () => { socket.off('task:updated', fetchAll); socket.off('task:deleted', fetchAll); };
  }, [socket, fetchAll]);

  const handleDelete = async id => {
    try {
      await api.delete(`/tasks/${id}`);
      toast.success(t('done'));
      setConfirmDelete(null);
      fetchAll();
    } catch { toast.error('Failed to delete'); }
  };

  const filtered = tasks.filter(t => {
    const s = search.toLowerCase();
    const matchSearch = !search || t.title.toLowerCase().includes(s) || t.worker_name?.toLowerCase().includes(s) || t.machine_name?.toLowerCase().includes(s);
    const matchStatus = !filterStatus || t.status === filterStatus;
    const matchPriority = !filterPriority || t.priority === filterPriority;
    const matchWorker = !filterWorker || String(t.assigned_worker_id) === String(filterWorker);
    const matchProject = !filterProject || String(t.project_id) === String(filterProject);
    return matchSearch && matchStatus && matchPriority && matchWorker && matchProject;
  });

  const isWorker = user?.role === 'worker';

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <ClipboardList className="text-zinc-400 dark:text-zinc-500" size={28} />
            {isWorker ? t('work_order') : t('shopfloor_tasks')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">{isWorker ? `${tasks.length} ${t('my_tasks')}` : t('shopfloor_tasks')}</p>
        </div>
        {!isWorker && user?.role === 'supervisor' && <button onClick={() => { setEditTask(null); setShowForm(true); }} className="btn-primary"><Plus size={18} /> {t('new_task')}</button>}
      </div>

      <div className="card py-3 px-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input className="input pl-10" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <select className="select w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">{t('all_statuses')}</option>
            {STATUS_ORDER.map(s => <option key={s} value={s}>{t(s)}</option>)}
          </select>
          <select className="select w-auto" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">{t('all_priorities')}</option>
            <option value="high">{t('high')}</option>
            <option value="medium">{t('medium')}</option>
            <option value="low">{t('low')}</option>
          </select>
          <select className="select w-auto" value={filterProject} onChange={e => {
            const val = e.target.value;
            setFilterProject(val);
            if (user?.role === 'admin') localStorage.setItem('admin_working_project', val);
          }}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="text-zinc-400 animate-spin" /></div>
      ) : (
        <div className="card p-0 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50/80 dark:bg-zinc-800/20 border-b border-zinc-200 dark:border-zinc-800">
                <tr className="text-left text-zinc-500 dark:text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">
                  {[t('task'), t('worker'), 'Credits', t('machine'), t('priority'), t('status'), t('expected'), ''].map((h, i) => <th key={i} className="px-5 py-3">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {filtered.map(task => (
                  <tr key={task.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
                    <td className="px-5 py-4 font-semibold text-zinc-900 dark:text-zinc-100">{task.title}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-500 overflow-hidden shrink-0">
                          {task.worker_picture ? (
                            <img src={getImageUrl(task.worker_picture)} alt={task.worker_name} className="w-full h-full object-cover" />
                          ) : (
                            <User size={12} />
                          )}
                        </div>
                        <span className="truncate max-w-[100px]">{task.worker_name || t('unassigned')}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-bold text-blue-600 dark:text-blue-400">+{task.credit_value || 1}</td>
                    <td className="px-5 py-4">{task.machine_name || '—'}</td>
                    <td className="px-5 py-4"><PriorityBadge priority={task.priority} /></td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        status={task.status}
                        unassigned={!task.assigned_worker_id}
                        deadline={task.deadline_at}
                        completedAt={task.completed_at}
                        lastLogoutReason={task.last_logout_reason}
                        lastLogoutTime={task.last_logout_time}
                      />
                    </td>
                    <td className="px-5 py-4">{task.expected_minutes} min</td>
                    <td className="px-5 py-4 text-right">
                      {!isWorker && (
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditTask(task); setShowForm(true); }} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md"><Edit2 size={15} /></button>
                          <button onClick={() => setConfirmDelete(task)} className="p-2 hover:bg-red-50 dark:hover:bg-red-950 text-red-500 rounded-md"><Trash2 size={15} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && <TaskFormModal onClose={() => setShowForm(false)} onSave={() => { setShowForm(false); fetchAll(); }} editTask={editTask} workers={workers} machines={machines} />}
      {overrideTask && <OverrideModal task={overrideTask} onClose={() => setOverrideTask(null)} onSave={() => { setOverrideTask(null); fetchAll(); }} />}
      {confirmDelete && <DeleteConfirmationModal task={confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={handleDelete} />}
    </div>
  );
}
