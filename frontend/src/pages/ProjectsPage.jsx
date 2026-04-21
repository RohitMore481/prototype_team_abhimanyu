import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';
import {
    Plus, Search, Edit2, Trash2, User, Cpu,
    X, Loader2, AlertCircle, Clock, Briefcase, Users, Layout, History, CheckCircle
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
                                {supervisors.map(s => (
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
                                {workers.map(w => (
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
                                {machines.map(m => (
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

function ProjectDetailsView({ project, onClose, getImageUrl }) {
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
                            <p className="stat-value">{project.supervisors?.length || 0}</p>
                            <p className="stat-label">Supervisors</p>
                        </div>
                        <div className="card-stat p-4">
                            <Users size={16} className="text-emerald-500 mb-2" />
                            <p className="stat-value">{project.workers?.length || 0}</p>
                            <p className="stat-label">Workers</p>
                        </div>
                        <div className="card-stat p-4">
                            <Cpu size={16} className="text-zinc-500 mb-2" />
                            <p className="stat-value">{project.machines?.length || 0}</p>
                            <p className="stat-label">Machines</p>
                        </div>
                        <div className="card-stat p-4">
                            <Briefcase size={16} className="text-purple-500 mb-2" />
                            <p className="stat-value">{project.tasks?.length || 0}</p>
                            <p className="stat-label">Tasks</p>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b pb-2">Management Team</h4>
                            <div className="space-y-3">
                                {project.supervisors?.length > 0 ? (
                                    project.supervisors.map(s => (
                                        <div key={s.id} className="flex items-center gap-3 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
                                            <TeamAvatar user={s} getImageUrl={getImageUrl} />
                                            <div>
                                                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{s.name}</p>
                                                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">{s.email}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : <p className="text-sm text-zinc-500 italic">No supervisors assigned</p>}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b pb-2">Floor Workers</h4>
                            <div className="space-y-3">
                                {project.workers?.length > 0 ? (
                                    project.workers.map(w => (
                                        <div key={w.id} className="flex items-center gap-3 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
                                            <TeamAvatar user={w} getImageUrl={getImageUrl} />
                                            <div>
                                                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{w.name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${w.status === 'busy' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                                                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">{w.status}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : <p className="text-sm text-zinc-500 italic">No workers assigned</p>}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b pb-2">Assigned Machinery</h4>
                        <div className="flex flex-wrap gap-2">
                            {project.machines?.map(m => (
                                <span key={m.id} className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-bold border border-zinc-200 dark:border-zinc-700">
                                    {m.name} ({m.type})
                                </span>
                            ))}
                            {(!project.machines || project.machines.length === 0) && <p className="text-sm text-zinc-500 italic">No machines assigned</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function HistoryFootprint({ history }) {
    const { t } = useLanguage();
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
                        <History size={24} className="text-blue-500" />
                        Assignment Footprint
                    </h2>
                    <p className="text-zinc-500 text-sm">Historical log of projects assigned to you.</p>
                </div>
            </div>

            <div className="grid gap-4">
                {history.map(item => (
                    <div key={item.id} className="group relative pl-8 border-l-2 border-zinc-100 dark:border-zinc-800 pb-8 last:pb-0">
                        <div className={`absolute left-[-9px] top-0 w-4 h-4 rounded-full border-4 border-white dark:border-zinc-950 ${item.unassigned_at ? 'bg-zinc-300 dark:bg-zinc-700' : 'bg-emerald-500'}`} />

                        <div className="card p-5 group-hover:border-zinc-300 dark:group-hover:border-zinc-700 transition-all">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">{item.project_name}</h3>
                                {!item.unassigned_at && <span className="badge badge-success">Currently Active</span>}
                            </div>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 line-clamp-2">{item.project_description || 'No description available for this project.'}</p>

                            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-zinc-50 dark:border-zinc-900">
                                <div>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Assigned</p>
                                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mt-1">{new Date(item.assigned_at).toLocaleDateString()}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Duration</p>
                                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mt-1">
                                        {item.unassigned_at ? `${Math.ceil((new Date(item.unassigned_at) - new Date(item.assigned_at)) / (1000 * 60 * 60 * 24))} days` : 'Ongoing'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tasks Done</p>
                                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                                        <CheckCircle size={12} /> {item.completedTasks}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {history.length === 0 && (
                    <div className="text-center py-20 bg-zinc-50 dark:bg-zinc-950/40 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                        <Briefcase size={40} className="mx-auto text-zinc-300 mb-4" />
                        <p className="text-zinc-500 font-medium">No historical project footprints found.</p>
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
            setProjects(pRes.data);
            setWorkers(wRes.data);
            setSupervisors(sRes.data);
            setMachines(mRes.data);
            setHistory(hRes.data);
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
                {isAdmin && (
                    <button onClick={() => setShowForm(true)} className="btn-primary px-6 py-3 shadow-lg shadow-blue-500/20">
                        <Plus size={18} /> New Project
                    </button>
                )}
            </div>

            {(isAdmin || isSupervisor) && (
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
                        <History size={16} /> My Footprints
                    </button>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 size={32} className="text-blue-500 animate-spin" /></div>
            ) : (
                <>
                    {activeTab === 'current' ? (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.map(p => (
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
                        <HistoryFootprint history={history} />
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
                    getImageUrl={getImageUrl}
                />
            )}
        </div>
    );
}
