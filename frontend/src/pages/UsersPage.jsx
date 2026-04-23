import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, X, Loader2, Shield, UserCog, HardHat,
  Circle, Users, Eye, ShieldCheck, Camera, ChevronRight,
  ChevronDown, Mail, Calendar, Info, Briefcase, Edit
} from 'lucide-react';

const ROLE_ICONS = { admin: Shield, supervisor: UserCog, worker: HardHat, monitor: Eye };
const ROLE_COLORS = {
  admin: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
  supervisor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  worker: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20',
  monitor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
};

const STATUS_COLORS = {
  idle: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  busy: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  paused: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
};

function AddUserModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'worker' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = e => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('email', form.email);
      formData.append('password', form.password);
      formData.append('role', form.role);
      if (file) formData.append('profile_picture', file);

      await api.post('/users', formData);
      toast.success('User created');
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
          <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">Add User</h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          <div className="flex flex-col items-center mb-4">
            <div
              className="relative w-24 h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-zinc-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {preview ? (
                <img src={preview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <Camera size={32} className="text-zinc-400" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                <p className="text-[10px] text-white font-bold uppercase">Change</p>
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2 uppercase font-bold tracking-wider">Profile Picture</p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="image/*"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Full Name <span className="text-red-500">*</span></label>
            <input className="input" placeholder="e.g. John Doe" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Email <span className="text-red-500">*</span></label>
            <input className="input" type="email" placeholder="john@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Password <span className="text-red-500">*</span></label>
            <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={6} />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Role <span className="text-red-500">*</span></label>
            <select
              className="select"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
            >
              <option value="supervisor">Supervisor</option>
              <option value="worker">Worker</option>
              <option value="monitor">Monitor</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800 mt-4">
            <button type="submit" className="btn-primary flex-1 justify-center py-2.5" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Create User
            </button>
            <button type="button" className="btn-secondary flex-1 py-2.5" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, projects, onClose, onSave }) {
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    password: '',
    role: user.role,
    project_id: user.project_id || ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/users/${user.id}`, form);
      toast.success('User updated');
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-sm:w-full max-w-sm rounded-2xl shadow-xl animate-slide-in flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/20">
          <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">Edit User</h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Full Name</label>
            <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Email</label>
            <input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">New Password (optional)</label>
            <input className="input" type="password" placeholder="Leave blank to keep same" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} minLength={6} />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Role</label>
            <select
              className="select"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
            >
              <option value="supervisor">Supervisor</option>
              <option value="worker">Worker</option>
              <option value="monitor">Monitor</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Assign Project</label>
            <select
              className="select"
              value={form.project_id}
              onChange={e => setForm({ ...form, project_id: e.target.value })}
            >
              <option value="">— No Project —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800 mt-4">
            <button type="submit" className="btn-primary flex-1 justify-center py-2.5" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Save Changes
            </button>
            <button type="button" className="btn-secondary flex-1 py-2.5" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const { socket } = useSocket();
  const { getImageUrl } = useAuth();

  const fetchUsers = useCallback(async () => {
    try {
      const [uRes, pRes] = await Promise.all([api.get('/users'), api.get('/projects')]);
      setUsers(uRes.data);
      setProjects(pRes.data);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (!socket) return;
    const handleStatus = ({ userId, status, is_on_break, is_live }) => {
      setUsers(prev => prev.map(u => u.id === userId ? {
        ...u,
        ...(status !== undefined && { status }),
        ...(is_on_break !== undefined && { is_on_break }),
        ...(is_live !== undefined && { is_live })
      } : u));
    };
    socket.on('user:status', handleStatus);
    return () => socket.off('user:status', handleStatus);
  }, [socket]);

  const deleteUser = async id => {
    if (!confirm('Delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted');
      fetchUsers();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6 animate-slide-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Users className="text-zinc-400 dark:text-zinc-500" size={28} />
            User Management
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">{users.length} registered users</p>
        </div>
        <button id="add-user-btn" className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> Add User
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="text-zinc-400 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {users.map(u => {
            const Icon = ROLE_ICONS[u.role] || HardHat;
            const isExpanded = expandedUserId === u.id;
            const profilePicUrl = getImageUrl(u.profile_picture);

            return (
              <div
                key={u.id}
                className={`card group/card overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-2 ring-zinc-900 dark:ring-zinc-100 shadow-lg' : 'hover:shadow-md'}`}
              >
                <div
                  className="flex items-start gap-4 cursor-pointer"
                  onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border relative overflow-hidden ${ROLE_COLORS[u.role]}`}>
                    {profilePicUrl ? (
                      <img src={profilePicUrl} alt={u.name} className="w-full h-full object-cover" />
                    ) : (
                      <Icon size={22} className="opacity-80" />
                    )}
                    {u.role === 'worker' && (
                      <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900 ${u.is_live ? (u.status === 'busy' ? 'bg-blue-500' : u.status === 'paused' ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-red-500'}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <p className="font-bold text-zinc-900 dark:text-zinc-100 truncate tracking-tight text-base leading-tight">{u.name}</p>
                      {isExpanded ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </div>
                    <div className="flex items-center flex-wrap gap-2 mt-1">
                      <span className={`inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${ROLE_COLORS[u.role]}`}>
                        {u.role}
                      </span>
                      {u.project_id && (
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1">
                          <Briefcase size={10} /> {projects.find(p => p.id === u.project_id)?.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid gap-3 text-sm">
                      <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                        <Mail size={16} className="shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </div>
                      <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                        <Info size={16} className="shrink-0" />
                        <span className="capitalize">{u.status || 'Active'}</span>
                      </div>
                      <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                        <Calendar size={16} className="shrink-0" />
                        <span>Joined {new Date(u.created_at).toLocaleDateString()}</span>
                      </div>
                      {u.project_id && (
                        <div className="flex items-center gap-3 text-purple-600 dark:text-purple-400 font-medium">
                          <Briefcase size={16} className="shrink-0" />
                          <span>Project: {projects.find(p => p.id === u.project_id)?.name || 'Unknown'}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                      {u.role === 'worker' && (
                        <div className="flex gap-2">
                          <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-1 rounded-md border text-white shadow-sm ${u.is_live ? 'bg-emerald-500 border-emerald-600' : 'bg-red-500 border-red-600'}`}>
                            {u.is_live ? 'ONLINE' : 'OFFLINE'}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-1 rounded-md border ${STATUS_COLORS[u.status || 'idle']}`}>
                            <Circle size={6} fill="currentColor" /> {u.status || 'idle'}
                          </span>
                          {u.is_on_break === 1 && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-1 rounded-md border bg-amber-500 text-white border-amber-600 shadow-sm">
                              BREAK
                            </span>
                          )}
                        </div>
                      )}

                      <div className="ml-auto flex gap-2">
                        {u.email !== 'admin@shopfloor.com' ? (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditUser(u); }}
                              className="btn-secondary py-1.5 px-3 flex items-center gap-2"
                            >
                              <Edit size={14} /> Edit
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteUser(u.id); }}
                              className="btn-secondary py-1.5 px-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 border-red-100 dark:border-red-500/20 flex items-center gap-2"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 px-2 py-1 bg-zinc-50 dark:bg-zinc-900 rounded-md border border-zinc-100 dark:border-zinc-800">
                            <ShieldCheck size={12} /> Protected Account
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && <AddUserModal onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); fetchUsers(); }} />}
      {editUser && <EditUserModal user={editUser} projects={projects} onClose={() => setEditUser(null)} onSave={() => { setEditUser(null); fetchUsers(); }} />}
    </div>
  );
}
