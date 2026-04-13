import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useSocket } from '../context/SocketContext';
import { Plus, Trash2, X, Loader2, Shield, UserCog, HardHat, Circle, Users } from 'lucide-react';

const ROLE_ICONS = { admin: Shield, supervisor: UserCog, worker: HardHat };
const ROLE_COLORS = {
  admin: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
  supervisor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  worker: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20',
};

const STATUS_COLORS = {
  idle: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  busy: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  paused: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
};

function AddUserModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'worker' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/users', form);
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
          <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50 border-b-2 border-transparent">Add User</h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
            <select className="select" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              <option value="worker">Worker</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
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

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch { }
    setLoading(false);
  }, []);

  const { socket } = useSocket();

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (!socket) return;
    const handleStatus = ({ userId, status, is_on_break }) => {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status, is_on_break: is_on_break !== undefined ? is_on_break : u.is_on_break } : u));
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
            <Users className="text-zinc-400 dark:text-zinc-500" size={28} /> {/* Note: Assuming Users is imported if needed, using text directly since it was missing here, actually let's just use text */}
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {users.map(u => {
            const Icon = ROLE_ICONS[u.role] || HardHat;
            return (
              <div key={u.id} className="card flex items-start gap-4 hover:shadow-md transition-shadow group">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${ROLE_COLORS[u.role]}`}>
                  <Icon size={22} className="opacity-80" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 pt-0.5">
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 truncate tracking-tight text-base leading-tight">{u.name}</p>
                    {u.role === 'worker' && (
                      <div className="flex gap-1 flex-wrap mt-1">
                        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md border ${STATUS_COLORS[u.status || 'idle']}`}>
                          <Circle size={6} fill="currentColor" /> {u.status || 'idle'}
                        </span>
                        {u.is_on_break === 1 && (
                          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md border bg-amber-500 text-white border-amber-500 dark:bg-amber-600 dark:border-amber-600 animate-pulse">
                            BREAK
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate mt-1">{u.email}</p>
                  <span className={`inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border mt-2 ${ROLE_COLORS[u.role]}`}>
                    {u.role}
                  </span>
                </div>
                <button onClick={() => deleteUser(u.id)} className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors opacity-0 group-hover:opacity-100 sm:opacity-100">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showModal && <AddUserModal onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); fetchUsers(); }} />}
    </div>
  );
}
