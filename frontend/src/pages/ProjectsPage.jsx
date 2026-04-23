import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';
import {
    Plus, Search, Edit2, Trash2, User, Cpu, Activity,
    X, Loader2, AlertCircle, Clock, Briefcase, Users, Layout, History, CheckCircle, ChevronRight, Star
} from 'lucide-react';

function TeamAvatar({ user, getImageUrl }) {
    return (
        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border-2 border-white dark:border-zinc-800 shadow-sm flex items-center justify-center text-[10px] font-bold text-zinc-500 overflow-hidden shrink-0" title={`${user.name} (${user.role})`}>
            {user.profile_picture ? (
                <img src={getImageUrl(user.profile_picture)} alt={user.name} className="w-full h-full object-cover" />
            ) : (
                <User size={14} />
            )}
        </div>
    );
}

function ProjectFormModal({ onClose, onSave, editProject, workers, supervisors, machines }) {
    const { t } = useLanguage();
    const [form, setForm] = useState({
        name: editProject?.name || '',
        description: editProject?.description || '',
        workerIds: editProject?.workers?.map(w => w.id) || [],
        supervisorIds: editProject?.supervisors?.map(s => s.id) || [],
        machineIds: editProject?.machines?.map(m => m.id) || [],
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async e => {
        e.preventDefault();
        setLoading(true);
        try {
            if (editProject) {
                await api.put(`/projects/${editProject.id}`, form);
                toast.success('Project updated');
            } else {
                await api.post('/projects', form);
                toast.success('Project created');
            }
            onSave();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save project');
        } finally {
            setLoading(false);
        }
    };

    const toggleId = (list, id) => {
        const set = new Set(list);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        return Array.from(set);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl rounded-2xl shadow-xl animate-slide-in flex flex-col max-h-[90vh] overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/20">
                    <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">{editProject ? 'Edit Project' : 'New Project'}</h3>
                    <button onClick={onClose} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Project Name <span className="text-red-500">*</span></label>
                            <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required placeholder="e.g. Assembly Line A" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Description</label>
                            <textarea className="input resize-none" rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional details..." />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-2 uppercase tracking-wide">Assign Supervisors</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {supervisors.filter(s => s.project_id === null || s.project_id === editProject?.id).map(s => (
                                    <label key={s.id} className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${form.supervisorIds.includes(s.id) ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-400' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'}`}>
                                        <input type="checkbox" className="hidden" checked={form.supervisorIds.includes(s.id)} onChange={() => setForm(p => ({ ...p, supervisorIds: toggleId(p.supervisorIds, s.id) }))} />
                                        <div className={`w-3 h-3 rounded-full border ${form.supervisorIds.includes(s.id) ? 'bg-blue-500 border-blue-500' : 'border-zinc-300'}`} />
                                        <span className="text-xs font-medium truncate">{s.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-2 uppercase tracking-wide">Assign Workers</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {workers.filter(w => w.project_id === null || w.project_id === editProject?.id).map(w => (
                                    <label key={w.id} className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${form.workerIds.includes(w.id) ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/50 text-emerald-700 dark:text-emerald-400' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'}`}>
                                        <input type="checkbox" className="hidden" checked={form.workerIds.includes(w.id)} onChange={() => setForm(p => ({ ...p, workerIds: toggleId(p.workerIds, w.id) }))} />
                                        <div className={`w-3 h-3 rounded-full border ${form.workerIds.includes(w.id) ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300'}`} />
                                        <span className="text-xs font-medium truncate">{w.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-2 uppercase tracking-wide">Assign Machines</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {machines.filter(m => m.project_id === null || m.project_id === editProject?.id).map(m => (
                                    <label key={m.id} className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${form.machineIds.includes(m.id) ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-400 text-zinc-900 dark:text-zinc-100' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'}`}>
                                        <input type="checkbox" className="hidden" checked={form.machineIds.includes(m.id)} onChange={() => setForm(p => ({ ...p, machineIds: toggleId(p.machineIds, m.id) }))} />
                                        <div className={`w-3 h-3 rounded-full border ${form.machineIds.includes(m.id) ? 'bg-zinc-800 border-zinc-800 dark:bg-zinc-200 dark:border-zinc-200' : 'border-zinc-300'}`} />
                                        <span className="text-xs font-medium truncate">{m.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800 mt-4">
                        <button type="submit" className="btn-primary flex-1 justify-center py-2.5" disabled={loading}>
                            {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                            {editProject ? 'Update Project' : 'Create Project'}
                        </button>
                        <button type="button" className="btn-secondary flex-1 py-2.5" onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ProjectDetailsView({ project, onClose, onSave, getImageUrl, allWorkers, allSupervisors, allMachines }) {
    const { user } = useAuth();
    const [addingType, setAddingType] = useState(null); // 'worker', 'supervisor', 'machine'
    const [selectedResourceId, setSelectedResourceId] = useState(null); // For history drill-down
    const [showActivity, setShowActivity] = useState(false);
    const isAdmin = user?.role === 'admin';
    const isSupervisor = user?.role === 'supervisor';

    // Helper: Group history by resource ID
    const groupHistory = (history = [], type = 'user') => {
        const groups = {};
        history.forEach(item => {
            const resourceId = type === 'user' ? item.user_id : item.machine_id;
            if (!groups[resourceId]) {
                groups[resourceId] = { ...item, periods: [] };
            }
            groups[resourceId].periods.push({
                assigned_at: item.assigned_at,
                unassigned_at: item.unassigned_at
            });
        });
        return Object.values(groups);
    };

    const groupedSupervisors = groupHistory(project.userHistory?.filter(u => u.role === 'supervisor'), 'user');
    const groupedWorkers = groupHistory(project.userHistory?.filter(u => u.role === 'worker'), 'user');
    const groupedMachines = groupHistory(project.machineHistory, 'machine');

    // Helper: Timeline events
    const timelineEvents = [
        ...(project.userHistory || []).map(u => ([
            { type: 'joined', time: u.assigned_at, resource: u.name, role: u.role, isUser: true },
            ...(u.unassigned_at ? [{ type: 'left', time: u.unassigned_at, resource: u.name, role: u.role, isUser: true }] : [])
        ])).flat(),
        ...(project.machineHistory || []).map(m => ([
            { type: 'joined', time: m.assigned_at, resource: m.name, role: 'machine', isUser: false },
            ...(m.unassigned_at ? [{ type: 'left', time: m.unassigned_at, resource: m.name, role: 'machine', isUser: false }] : [])
        ])).flat()
    ].sort((a, b) => new Date(b.time) - new Date(a.time));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-w-3xl rounded-2xl shadow-xl animate-slide-in flex flex-col max-h-[90vh] overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/20">
                    <div>
                        <h3 className="font-bold text-xl text-zinc-900 dark:text-zinc-50">{project.name}</h3>
                        <p className="text-sm text-zinc-500 truncate max-w-sm">{project.description}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"><X size={20} /></button>
                </div>
                <div className="p-6 overflow-y-auto space-y-8">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="card-stat p-4">
                            <Users size={16} className="text-blue-500 mb-2" />
                            <p className="stat-value">{project.stats?.teamSize || project.supervisors?.length + project.workers?.length || 0}</p>
                            <p className="stat-label">Total Personnel</p>
                        </div>
                        <div className="card-stat p-4">
                            <Briefcase size={16} className="text-emerald-500 mb-2" />
                            <p className="stat-value">{project.stats?.taskCounts?.completed || project.tasks?.filter(t => t.status === 'completed').length || 0}</p>
                            <p className="stat-label">Tasks Done</p>
                        </div>
                        <div className="card-stat p-4">
                            <Cpu size={16} className="text-zinc-500 mb-2" />
                            <p className="stat-value">{project.stats?.machineUsage || project.machines?.length || 0}</p>
                            <p className="stat-label">Machines Used</p>
                        </div>
                        <div className="card-stat p-4">
                            <Activity size={16} className="text-purple-500 mb-2" />
                            <p className="stat-value">{project.stats?.efficiency || 0}%</p>
                            <p className="stat-label">Efficiency</p>
                        </div>
                    </div>

                    {project.status === 'completed' && project.stats && (
                        <div className="p-5 rounded-2xl bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                                    <Activity size={18} /> Performance Analysis
                                </h4>
                                <span className="text-[10px] font-black uppercase text-blue-500 tracking-widest bg-blue-100 dark:bg-blue-500/20 px-2 py-0.5 rounded">Efficiency Score: {project.stats.efficiency}%</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Total Tasks</p>
                                    <p className="text-lg font-black text-blue-900 dark:text-blue-50">{project.stats.taskCounts.total}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">On Time</p>
                                    <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{project.stats.taskCounts.completed - project.stats.taskCounts.delayed}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-red-300 uppercase tracking-tighter">Delayed</p>
                                    <p className="text-lg font-black text-red-500">{project.stats.taskCounts.delayed}</p>
                                </div>
                            </div>
                            <div className="mt-4 h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500" style={{ width: `${Math.round(((project.stats.taskCounts.completed - project.stats.taskCounts.delayed) / project.stats.taskCounts.total) * 100)}%` }} />
                                <div className="h-full bg-red-500" style={{ width: `${Math.round((project.stats.taskCounts.delayed / project.stats.taskCounts.total) * 100)}%` }} />
                                <div className="h-full bg-zinc-300 dark:bg-zinc-700" style={{ width: `${Math.round(((project.stats.taskCounts.total - project.stats.taskCounts.completed) / project.stats.taskCounts.total) * 100)}%` }} />
                            </div>
                        </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b pb-2">Management History</h4>
                            <div className="space-y-3">
                                {project.status === 'active' && project.supervisors?.length > 0 ? (
                                    project.supervisors.map(s => (
                                        <div key={s.id} className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
                                            <div className="flex items-center gap-3">
                                                <TeamAvatar user={s} getImageUrl={getImageUrl} />
                                                <div>
                                                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{s.name}</p>
                                                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">{s.email}</p>
                                                </div>
                                            </div>
                                            {(isAdmin || isSupervisor) && (
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!confirm(`Remove ${s.name} from project?`)) return;
                                                        try {
                                                            await api.post(`/projects/${project.id}/unassign-user`, { userId: s.id });
                                                            toast.success(`${s.name} removed`);
                                                            onSave();
                                                        } catch { toast.error('Failed to remove'); }
                                                    }}
                                                    className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                                                    title="Remove Supervisor"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))
                                ) : project.status === 'completed' ? (
                                    groupedSupervisors.map(s => (
                                        <div key={s.id} className="space-y-2">
                                            <button
                                                onClick={() => setSelectedResourceId(selectedResourceId === s.id ? null : s.id)}
                                                className="w-full flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all text-left"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <TeamAvatar user={s} getImageUrl={getImageUrl} />
                                                    <div>
                                                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{s.name}</p>
                                                        <p className="text-[9px] text-zinc-500 uppercase tracking-widest">{s.periods.length} Assignment Period{s.periods.length > 1 ? 's' : ''}</p>
                                                    </div>
                                                </div>
                                                <ChevronRight size={14} className={`text-zinc-400 transition-transform ${selectedResourceId === s.id ? 'rotate-90' : ''}`} />
                                            </button>

                                            {selectedResourceId === s.id && (
                                                <div className="ml-10 space-y-2 animate-in slide-in-from-left-2 fade-in duration-200">
                                                    {s.periods.map((p, idx) => (
                                                        <div key={idx} className="p-2 rounded-lg bg-white dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700 text-[10px]">
                                                            <div className="flex justify-between text-zinc-400 uppercase font-bold mb-1">
                                                                <span>Period {idx + 1}</span>
                                                                <span>{p.unassigned_at ? 'Completed' : 'Active'}</span>
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                                    <span className="text-zinc-600 dark:text-zinc-400">Joined:</span>
                                                                    <span className="text-zinc-900 dark:text-zinc-100 font-bold">{new Date(p.assigned_at).toLocaleString()}</span>
                                                                </div>
                                                                {p.unassigned_at && (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                                        <span className="text-zinc-600 dark:text-zinc-400">Left:</span>
                                                                        <span className="text-zinc-900 dark:text-zinc-100 font-bold">{new Date(p.unassigned_at).toLocaleString()}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-zinc-500 italic text-center py-4 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl">No supervisors assigned</p>
                                )}

                                {project.status === 'active' && (isAdmin || isSupervisor) && (
                                    <div className="pt-2">
                                        {addingType === 'supervisor' ? (
                                            <div className="space-y-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-in fade-in slide-in-from-top-2">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Available Supervisors</span>
                                                    <button onClick={() => setAddingType(null)} className="text-zinc-400 hover:text-zinc-600"><X size={12} /></button>
                                                </div>
                                                <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                                                    {allSupervisors.filter(s => s.project_id === null).map(s => (
                                                        <button
                                                            key={s.id}
                                                            onClick={async () => {
                                                                try {
                                                                    await api.post(`/projects/${project.id}/assign-user`, { userId: s.id });
                                                                    toast.success(`${s.name} added`);
                                                                    setAddingType(null);
                                                                    onSave();
                                                                } catch { toast.error('Failed to add'); }
                                                            }}
                                                            className="w-full text-left p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold transition-colors flex items-center justify-between border border-transparent hover:border-zinc-100 dark:hover:border-zinc-700"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <TeamAvatar user={s} getImageUrl={getImageUrl} />
                                                                <span>{s.name}</span>
                                                            </div>
                                                            <Plus size={12} className="text-zinc-400" />
                                                        </button>
                                                    ))}
                                                    {allSupervisors.filter(s => s.project_id === null).length === 0 && <p className="text-[10px] text-zinc-400 italic text-center py-2">No available supervisors</p>}
                                                </div>
                                            </div>
                                        ) : (
                                            <button onClick={() => setAddingType('supervisor')} className="w-full py-2 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl text-zinc-400 hover:text-blue-500 hover:border-blue-200 dark:hover:border-blue-900/30 transition-all text-xs font-bold flex items-center justify-center gap-2">
                                                <Plus size={14} /> Add Supervisor
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b pb-2">Floor Workforce</h4>
                            <div className="space-y-3">
                                {project.status === 'active' && project.workers?.length > 0 ? (
                                    project.workers.map(w => (
                                        <div key={w.id} className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
                                            <div className="flex items-center gap-3">
                                                <TeamAvatar user={w} getImageUrl={getImageUrl} />
                                                <div>
                                                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{w.name}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${w.status === 'busy' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                                                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">{w.status}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-right mr-3">
                                                    <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-tight">Project Credits</p>
                                                    <p className="text-sm font-black text-blue-500">{project.tasks?.filter(t => t.status === 'completed' && t.assigned_worker_id === w.id).reduce((s, t) => s + (t.credit_value || 1), 0)} pts</p>
                                                </div>
                                                {(isAdmin || isSupervisor) && (
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (!confirm(`Remove ${w.name} from project?`)) return;
                                                            try {
                                                                await api.post(`/projects/${project.id}/unassign-user`, { userId: w.id });
                                                                toast.success(`${w.name} removed`);
                                                                onSave(); // Refresh
                                                            } catch { toast.error('Failed to remove'); }
                                                        }}
                                                        className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                                                        title="Remove Worker"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : project.status === 'completed' ? (
                                    groupedWorkers.map(w => (
                                        <div key={w.id} className="space-y-2">
                                            <button
                                                onClick={() => setSelectedResourceId(selectedResourceId === w.id ? null : w.id)}
                                                className="w-full flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all text-left"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <TeamAvatar user={w} getImageUrl={getImageUrl} />
                                                    <div>
                                                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{w.name}</p>
                                                        <p className="text-[9px] text-zinc-500 uppercase tracking-widest">{w.periods.length} Assignment Period{w.periods.length > 1 ? 's' : ''}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-tight">Earned</p>
                                                        <p className="text-xs font-black text-blue-500">{project.tasks?.filter(t => t.status === 'completed' && t.assigned_worker_id === w.id).reduce((s, t) => s + (t.credit_value || 1), 0)} pts</p>
                                                    </div>
                                                    <ChevronRight size={14} className={`text-zinc-400 transition-transform ${selectedResourceId === w.id ? 'rotate-90' : ''}`} />
                                                </div>
                                            </button>

                                            {selectedResourceId === w.id && (
                                                <div className="ml-10 space-y-2 animate-in slide-in-from-left-2 fade-in duration-200">
                                                    {w.periods.map((p, idx) => (
                                                        <div key={idx} className="p-2 rounded-lg bg-white dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700 text-[10px]">
                                                            <div className="flex justify-between text-zinc-400 uppercase font-bold mb-1">
                                                                <span>Period {idx + 1}</span>
                                                                <span>{p.unassigned_at ? 'Completed' : 'Active'}</span>
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                                    <span className="text-zinc-600 dark:text-zinc-400">Joined:</span>
                                                                    <span className="text-zinc-900 dark:text-zinc-100 font-bold">{new Date(p.assigned_at).toLocaleString()}</span>
                                                                </div>
                                                                {p.unassigned_at && (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                                        <span className="text-zinc-600 dark:text-zinc-400">Left:</span>
                                                                        <span className="text-zinc-900 dark:text-zinc-100 font-bold">{new Date(p.unassigned_at).toLocaleString()}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-zinc-500 italic text-center py-4 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl">No workers assigned</p>
                                )}

                                {project.status === 'active' && (isAdmin || isSupervisor) && (
                                    <div className="pt-2">
                                        {addingType === 'worker' ? (
                                            <div className="space-y-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-in fade-in slide-in-from-top-2">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Available Workers</span>
                                                    <button onClick={() => setAddingType(null)} className="text-zinc-400 hover:text-zinc-600"><X size={12} /></button>
                                                </div>
                                                <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                                                    {allWorkers.filter(w => w.project_id === null).map(w => (
                                                        <button
                                                            key={w.id}
                                                            onClick={async () => {
                                                                try {
                                                                    await api.post(`/projects/${project.id}/assign-user`, { userId: w.id });
                                                                    toast.success(`${w.name} added`);
                                                                    setAddingType(null);
                                                                    onSave();
                                                                } catch { toast.error('Failed to add'); }
                                                            }}
                                                            className="w-full text-left p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold transition-colors flex items-center justify-between border border-transparent hover:border-zinc-100 dark:hover:border-zinc-700"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <TeamAvatar user={w} getImageUrl={getImageUrl} />
                                                                <span>{w.name}</span>
                                                            </div>
                                                            <Plus size={12} className="text-zinc-400" />
                                                        </button>
                                                    ))}
                                                    {allWorkers.filter(w => w.project_id === null).length === 0 && <p className="text-[10px] text-zinc-400 italic text-center py-2">No available workers</p>}
                                                </div>
                                            </div>
                                        ) : (
                                            <button onClick={() => setAddingType('worker')} className="w-full py-2 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl text-zinc-400 hover:text-blue-500 hover:border-blue-200 dark:hover:border-blue-900/30 transition-all text-xs font-bold flex items-center justify-center gap-2">
                                                <Plus size={14} /> Add Worker
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b pb-2">Hardware & Machinery</h4>
                        <div className="flex flex-wrap gap-3">
                            {project.status === 'active' && project.machines?.map(m => (
                                <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-bold border border-zinc-200 dark:border-zinc-700 shadow-sm transition-all hover:border-zinc-300 dark:hover:border-zinc-600">
                                    <Cpu size={12} className="text-zinc-400" />
                                    <span>{m.name} ({m.type})</span>
                                    {(isAdmin || isSupervisor) && (
                                        <button
                                            onClick={async () => {
                                                if (!confirm(`Remove ${m.name} from project?`)) return;
                                                try {
                                                    await api.post(`/projects/${project.id}/unassign-machine`, { machineId: m.id });
                                                    toast.success(`${m.name} removed`);
                                                    onSave(); // Refresh
                                                } catch { toast.error('Failed to remove'); }
                                            }}
                                            className="ml-1 p-0.5 text-zinc-400 hover:text-red-500 rounded transition-colors"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            {project.status === 'active' && (isAdmin || isSupervisor) && (
                                <div className="relative">
                                    {addingType === 'machine' ? (
                                        <div className="absolute top-[calc(100%+8px)] left-0 z-10 w-64 space-y-2 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl animate-in fade-in slide-in-from-top-2">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase">Available Machinery</span>
                                                <button onClick={() => setAddingType(null)} className="text-zinc-400 hover:text-zinc-600"><X size={12} /></button>
                                            </div>
                                            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                                                {allMachines.filter(m => m.project_id === null).length > 0 ? (
                                                    allMachines.filter(m => m.project_id === null).map(m => (
                                                        <button
                                                            key={m.id}
                                                            onClick={async () => {
                                                                try {
                                                                    await api.post(`/projects/${project.id}/assign-machine`, { machineId: m.id });
                                                                    toast.success(`${m.name} added`);
                                                                    setAddingType(null);
                                                                    onSave();
                                                                } catch { toast.error('Failed to add'); }
                                                            }}
                                                            className="w-full text-left p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold transition-colors flex items-center justify-between border border-transparent hover:border-zinc-100 dark:hover:border-zinc-700"
                                                        >
                                                            <span>{m.name} ({m.type})</span>
                                                            <Cpu size={12} className="text-zinc-400" />
                                                        </button>
                                                    ))
                                                ) : <p className="text-[10px] text-zinc-400 italic text-center py-2">No available machines</p>}
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={() => setAddingType('machine')} className="flex items-center gap-2 px-3 py-1.5 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-lg text-zinc-400 hover:text-blue-500 hover:border-blue-200 dark:hover:border-blue-900/40 transition-all text-[10px] font-black uppercase tracking-tighter">
                                            <Plus size={12} /> Add Machine
                                        </button>
                                    )}
                                </div>
                            )}
                            {project.status === 'completed' && groupedMachines.map(m => (
                                <div key={m.id} className="w-full space-y-2">
                                    <button
                                        onClick={() => setSelectedResourceId(selectedResourceId === `machine-${m.id}` ? null : `machine-${m.id}`)}
                                        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-bold border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 transition-all"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Cpu size={12} className="text-zinc-400" />
                                            <span>{m.name} ({m.type})</span>
                                            <span className="mx-2 text-[10px] text-zinc-400 px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-900">{m.periods.length} Periods</span>
                                        </div>
                                        <ChevronRight size={12} className={`text-zinc-400 transition-transform ${selectedResourceId === `machine-${m.id}` ? 'rotate-90' : ''}`} />
                                    </button>

                                    {selectedResourceId === `machine-${m.id}` && (
                                        <div className="ml-6 space-y-2 animate-in slide-in-from-left-1 fade-in duration-200">
                                            {m.periods.map((p, idx) => (
                                                <div key={idx} className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 text-[10px]">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-zinc-500 uppercase font-bold tracking-tight">Assignment {idx + 1}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${p.unassigned_at ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'}`}>
                                                            {p.unassigned_at ? 'Completed' : 'Active'}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <p className="text-[8px] text-zinc-400 uppercase font-bold">Start</p>
                                                            <p className="font-bold text-zinc-700 dark:text-zinc-300">{new Date(p.assigned_at).toLocaleString()}</p>
                                                        </div>
                                                        {p.unassigned_at && (
                                                            <div>
                                                                <p className="text-[8px] text-zinc-400 uppercase font-bold">End</p>
                                                                <p className="font-bold text-zinc-700 dark:text-zinc-300">{new Date(p.unassigned_at).toLocaleString()}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {(!project.machines || project.machines.length === 0) && (!project.machineHistory || project.machineHistory.length === 0) && <p className="text-sm text-zinc-500 italic text-center w-full py-4 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl">No hardware history found</p>}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b pb-2">Project Tasks</h4>
                        {project.detailedTasks && project.detailedTasks.length > 0 ? (
                            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                                <table className="w-full text-sm">
                                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                                        <tr className="text-left text-zinc-500 dark:text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">
                                            <th className="px-5 py-3">Task</th>
                                            <th className="px-5 py-3">Worker</th>
                                            <th className="px-5 py-3 text-center">Credits</th>
                                            <th className="px-5 py-3 text-center">Priority</th>
                                            <th className="px-5 py-3 text-center">Status</th>
                                            <th className="px-5 py-3 text-right">Expected</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50 bg-white dark:bg-zinc-950">
                                        {project.detailedTasks.map(t => (
                                            <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                                                <td className="px-5 py-4 font-semibold text-zinc-900 dark:text-zinc-100">{t.title}</td>
                                                <td className="px-5 py-4">
                                                    {t.worker_name ? (
                                                        <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-300">
                                                            <User size={14} className="text-zinc-400" />
                                                            <span className="truncate max-w-[100px] font-medium">{t.worker_name}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-zinc-400 italic">
                                                            <Clock size={14} />
                                                            <span className="truncate max-w-[100px]">Unassigned</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 text-center font-black flex items-center justify-center gap-1 text-blue-600 dark:text-blue-400">
                                                    +{t.credit_value || 1} <Star size={12} className="fill-blue-500 text-blue-500" />
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md ${t.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : t.priority === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                                                        {t.priority}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md ${t.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : t.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : t.status === 'paused' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : t.status === 'delayed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                                        {t.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-right text-zinc-500 font-medium">{t.expected_minutes || 0} min</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-sm text-zinc-500 italic text-center col-span-full py-4 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl">No tasks attached to project</p>
                        )}
                    </div>

                    {project.status === 'active' && (
                        <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800">
                            <button
                                onClick={async () => {
                                    if (!confirm('Mark this project as complete? All resources will be released.')) return;
                                    try {
                                        await api.post(`/projects/${project.id}/complete`);
                                        toast.success('Project completed');
                                        onSave();
                                        onClose();
                                    } catch {
                                        toast.error('Failed to complete project');
                                    }
                                }}
                                className="w-full py-4 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-xl shadow-zinc-200 dark:shadow-none flex items-center justify-center gap-3 active:scale-[0.98]"
                            >
                                <CheckCircle size={20} />
                                Mark as Complete
                            </button>
                        </div>
                    )}

                    {/* Collapsible Timeline & Logs View */}
                    <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                            onClick={() => setShowActivity(!showActivity)}
                            className="w-full flex items-center justify-between p-4 bg-zinc-50/50 hover:bg-zinc-100 dark:bg-zinc-900/20 dark:hover:bg-zinc-900/60 rounded-xl transition-all border border-zinc-200 dark:border-zinc-800 group relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-blue-500/5 dark:bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="flex flex-col items-start gap-1 relative z-10">
                                <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-tighter flex items-center gap-2">
                                    <Activity size={18} className="text-blue-500" />
                                    Project Task Logs & Timeline
                                </h4>
                                <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1.5">
                                    <Activity size={10} />
                                    Click to {showActivity ? 'Collapse' : 'Expand'} Activity Feed
                                </span>
                            </div>
                            <div className="flex items-center gap-3 relative z-10">
                                <span className="text-[10px] font-bold text-zinc-400 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 rounded-md shadow-sm group-hover:border-blue-200 dark:group-hover:border-blue-900/60 group-hover:text-blue-500 transition-colors">
                                    {timelineEvents.length + (project.taskLogs?.length || 0)} Logs
                                </span>
                                <div className={`w-8 h-8 rounded-full bg-white dark:bg-zinc-950 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 shadow-sm transition-transform duration-300 ${showActivity ? 'rotate-90 bg-blue-50 border-blue-200 dark:bg-blue-900/30' : 'group-hover:translate-x-1'}`}>
                                    <ChevronRight size={16} className={`transition-colors ${showActivity ? 'text-blue-500' : 'text-zinc-400'}`} />
                                </div>
                            </div>
                        </button>

                        {showActivity && (
                            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-top-4 fade-in duration-300">
                                <div>
                                    <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2 mb-4 flex items-center gap-2">
                                        <History size={12} />
                                        Resource Assignments
                                    </h4>
                                    <div className="relative space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-100 dark:before:bg-zinc-800">
                                        {timelineEvents.map((event, idx) => (
                                            <div key={idx} className="relative pl-8 animate-in slide-in-from-top-2 fade-in duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                                                <div className={`absolute left-0 top-1 w-6 h-6 rounded-full border-4 border-white dark:border-zinc-950 flex items-center justify-center shadow-sm z-10 ${event.type === 'joined' ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                                    {event.type === 'joined' ? <Plus size={10} className="text-white" /> : <X size={10} className="text-white" />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                                            {event.resource}
                                                            <span className="ml-2 text-[10px] font-normal text-zinc-500">({event.role})</span>
                                                        </span>
                                                        <span className="text-[10px] font-medium text-zinc-400">
                                                            {new Date(event.time).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-tight font-black">
                                                        {event.type === 'joined' ? 'Assigned to Project' : 'Unassigned from Project'}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                        {timelineEvents.length === 0 && (
                                            <div className="text-center py-8">
                                                <Activity size={32} className="mx-auto text-zinc-200 dark:text-zinc-800 mb-2" />
                                                <p className="text-xs text-zinc-400 italic">No timeline events recorded yet</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2 mb-4 flex items-center gap-2">
                                        <Briefcase size={12} />
                                        Task Activities
                                    </h4>
                                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                        {project.taskLogs?.length > 0 ? project.taskLogs.map((l, i) => (
                                            <div key={l.id || i} className="flex gap-4 items-start p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                                <div className="text-[10px] whitespace-nowrap text-zinc-400 font-mono mt-0.5">
                                                    {new Date(l.timestamp || l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-bold text-zinc-900 dark:text-zinc-100 border-b border-zinc-200 dark:border-zinc-800 pb-1 mb-1">{l.action.toUpperCase().replace('_', ' ')}</p>
                                                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 truncate">{l.task_title}</p>
                                                    <p className="text-[10px] text-zinc-500 mt-1">Initiator: <span className="font-bold text-zinc-700 dark:text-zinc-300">{l.worker_name || l.user_name || 'System'}</span> {(l.note || l.pause_reason) && <span className="italic text-zinc-400"> • {l.note || l.pause_reason}</span>}</p>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="text-center py-8">
                                                <History size={32} className="mx-auto text-zinc-200 dark:text-zinc-800 mb-2" />
                                                <p className="text-xs text-zinc-400 italic">No task logs recorded</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

function HistoryFootprint({ history, getImageUrl, onViewProject }) {
    const { t } = useLanguage();
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
                        <History size={24} className="text-emerald-500" />
                        Completed Projects
                    </h2>
                    <p className="text-zinc-500 text-sm">Full history of completed shopfloor project footprints.</p>
                </div>
            </div>

            <div className="grid gap-6">
                {history.map((item, idx) => (
                    <div key={item.project_id || item.id || idx} className="group relative pl-8 border-l-2 border-zinc-100 dark:border-zinc-800 pb-8 last:pb-0">
                        <div className={`absolute left-[-9px] top-0 w-4 h-4 rounded-full border-4 border-white dark:border-zinc-950 ${item.unassigned_at ? 'bg-zinc-300 dark:bg-zinc-700' : 'bg-emerald-500'}`} />

                        <div
                            className="card p-6 group-hover:border-emerald-200 dark:group-hover:border-emerald-900/30 transition-all shadow-sm hover:shadow-md cursor-pointer active:scale-[0.99]"
                            onClick={() => onViewProject(item.project_id)}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="font-bold text-xl text-zinc-900 dark:text-zinc-50">{item.project_name}</h3>
                                {item.unassigned_at ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-900 px-2 py-1 rounded-md border border-zinc-100 dark:border-zinc-800">
                                        Completed
                                    </span>
                                ) : (
                                    <span className="badge badge-success">Currently Assigned</span>
                                )}
                            </div>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 line-clamp-2">{item.project_description || 'No description available.'}</p>

                            <div className="space-y-6">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-4 border-t border-zinc-50 dark:border-zinc-900">
                                    <div>
                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Assigned On</p>
                                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mt-1">{new Date(item.assigned_at).toLocaleDateString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Duration</p>
                                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mt-1">
                                            {item.unassigned_at ? `${Math.ceil((new Date(item.unassigned_at) - new Date(item.assigned_at)) / (1000 * 60 * 60 * 24))} days` : 'Ongoing'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tasks Completed</p>
                                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                                            <CheckCircle size={12} /> {item.completedTasks}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Credits Earned</p>
                                        <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                                            <Star size={12} className="fill-current" /> {item.collectedCredits || 0}
                                        </p>
                                    </div>
                                </div>

                                {/* Project-wide history details for Admins/Supervisors */}
                                {item.details && (
                                    <div className="space-y-4 pt-4 border-t border-zinc-50 dark:border-zinc-900">
                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div>
                                                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                    <Users size={12} /> Team Footprint
                                                </h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {item.details.userHistory?.map(uh => (
                                                        <div key={uh.id} className="flex items-center gap-2 p-1.5 pr-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800" title={`Assigned: ${new Date(uh.assigned_at).toLocaleDateString()}`}>
                                                            <TeamAvatar user={uh} getImageUrl={getImageUrl} />
                                                            <div className="min-w-0">
                                                                <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 truncate">{uh.name}</p>
                                                                <p className="text-[8px] text-zinc-500 uppercase tracking-tighter">{new Date(uh.assigned_at).toLocaleDateString()}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                    <Cpu size={12} /> Hardware Logs
                                                </h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {item.details.machineHistory?.map(mh => (
                                                        <div key={mh.id} className="flex flex-col p-1.5 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800" title={`Assigned: ${new Date(mh.assigned_at).toLocaleDateString()}`}>
                                                            <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">{mh.name}</p>
                                                            <p className="text-[8px] text-zinc-500 uppercase tracking-tighter">{new Date(mh.assigned_at).toLocaleDateString()}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {history.length === 0 && (
                    <div className="text-center py-20 bg-zinc-50 dark:bg-zinc-950/40 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                        <Briefcase size={40} className="mx-auto text-zinc-300 mb-4" />
                        <p className="text-zinc-500 font-medium">No completed project footprints found.</p>
                    </div>
                )}
            </div>
        </div>
    );
}


export default function ProjectsPage() {
    const { user, getImageUrl } = useAuth();
    const { t } = useLanguage();
    const [projects, setProjects] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [supervisors, setSupervisors] = useState([]);
    const [machines, setMachines] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [viewProject, setViewProject] = useState(null);
    const [activeTab, setActiveTab] = useState('current'); // 'current' or 'history'

    const fetchAll = useCallback(async () => {
        try {
            const [pRes, wRes, sRes, mRes, hRes] = await Promise.all([
                api.get('/projects'),
                api.get('/users/workers'),
                api.get('/users/supervisors'),
                api.get('/machines'),
                api.get('/projects/my-history')
            ]);

            // For history, if admin/supervisor, we should get detailed mapping
            let historyData = hRes.data;
            if (user?.role === 'admin' || user?.role === 'supervisor') {
                const detailedHistory = await Promise.all(historyData.map(async h => {
                    try {
                        const dRes = await api.get(`/projects/${h.project_id}`);
                        return { ...h, details: dRes.data };
                    } catch { return h; }
                }));
                historyData = detailedHistory;
            }

            setProjects(pRes.data);
            setWorkers(wRes.data);
            setSupervisors(sRes.data);
            setMachines(mRes.data);
            setHistory(historyData);

        } catch { }
        setLoading(false);
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleViewProject = async id => {
        try {
            const res = await api.get(`/projects/${id}`);
            setViewProject(res.data);
        } catch { toast.error('Failed to load project details'); }
    };

    const handleDelete = async id => {
        if (!window.confirm('Delete this project?')) return;
        try {
            await api.delete(`/projects/${id}`);
            toast.success('Project deleted');
            fetchAll();
        } catch { toast.error('Delete failed'); }
    };

    const isAdmin = user?.role === 'admin';
    const isSupervisor = user?.role === 'supervisor';

    return (
        <div className="space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                        <Layout className="text-blue-500" size={32} />
                        Project Hub
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-1 font-medium">Manage and track shopfloor project footprints.</p>
                </div>
                {isAdmin && activeTab === 'current' && (
                    <button onClick={() => setShowForm(true)} className="btn-primary px-6 py-3 shadow-lg shadow-blue-500/20">
                        <Plus size={18} /> New Project
                    </button>
                )}
            </div>


            <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-2xl w-fit border border-zinc-200 dark:border-zinc-800">
                <button
                    onClick={() => setActiveTab('current')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'current' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                    Active Projects
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'history' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                    <History size={16} /> Completed Projects
                </button>

            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 size={32} className="text-blue-500 animate-spin" /></div>
            ) : (
                <>
                    {activeTab === 'current' ? (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.filter(p => !p.status || p.status === 'active').map(p => (

                                <div key={p.id} className="card group hover:shadow-xl transition-all cursor-pointer overflow-hidden border-zinc-100 dark:border-zinc-800" onClick={() => handleViewProject(p.id)}>
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="p-2.5 bg-blue-50 dark:bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
                                                <Briefcase size={20} className="text-blue-500" />
                                            </div>
                                            {isAdmin && (
                                                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => { setViewProject(p); setShowForm(true); }} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"><Edit2 size={16} className="text-zinc-400 hover:text-zinc-600" /></button>
                                                    <button onClick={() => handleDelete(p.id)} className="p-2 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"><Trash2 size={16} className="text-red-400 hover:text-red-600" /></button>
                                                </div>
                                            )}
                                        </div>
                                        <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 group-hover:text-blue-500 transition-colors">{p.name}</h3>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 line-clamp-2 h-10">{p.description || 'No description provided.'}</p>

                                        <div className="grid grid-cols-2 gap-4 mt-6">
                                            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                                <Users size={14} className="text-blue-500" />
                                                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{p.workerCount} Workers</span>
                                            </div>
                                            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                                <Cpu size={14} className="text-emerald-500" />
                                                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{p.machineCount} Machines</span>
                                            </div>
                                        </div>

                                        <div className="mt-6 flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                                                <Clock size={12} /> {new Date(p.created_at).toLocaleDateString()}
                                            </span>
                                            <div className="flex -space-x-2">
                                                <div className="w-6 h-6 rounded-full bg-blue-500 border border-white dark:border-zinc-800 flex items-center justify-center text-[8px] text-white font-bold">+{p.supervisorCount}</div>
                                                <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 border border-white dark:border-zinc-800 flex items-center justify-center text-[8px] text-zinc-500 font-bold">M</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {projects.length === 0 && (
                                <div className="col-span-full py-20 card border-dashed flex flex-col items-center justify-center bg-zinc-50/50">
                                    <Layout size={48} className="text-zinc-300 mb-4" />
                                    <p className="text-zinc-500 font-bold text-lg">No active projects found</p>
                                    <p className="text-sm text-zinc-400 mt-1">Assign teams to get started.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <HistoryFootprint
                            history={history}
                            getImageUrl={getImageUrl}
                            onViewProject={handleViewProject}
                        />
                    )}
                </>
            )}

            {showForm && (
                <ProjectFormModal
                    onClose={() => { setShowForm(false); setViewProject(null); }}
                    onSave={() => { setShowForm(false); setViewProject(null); fetchAll(); }}
                    editProject={viewProject}
                    workers={workers}
                    supervisors={supervisors}
                    machines={machines}
                />
            )}

            {viewProject && !showForm && (
                <ProjectDetailsView
                    project={viewProject}
                    onClose={() => setViewProject(null)}
                    onSave={() => { fetchAll(); handleViewProject(viewProject.id); }}
                    getImageUrl={getImageUrl}
                    allWorkers={workers}
                    allSupervisors={supervisors}
                    allMachines={machines}
                />
            )}
        </div>
    );
}
