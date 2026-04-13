import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, Loader2, Clock, Cpu } from 'lucide-react';

function MachineCard({ machine, canEdit, onEdit, onDelete }) {
  const statusCls = {
    running: 'border-l-4 border-l-emerald-500 border-t-zinc-200 border-r-zinc-200 border-b-zinc-200 dark:border-t-zinc-800 dark:border-r-zinc-800 dark:border-b-zinc-800 bg-white dark:bg-zinc-900',
    idle: 'border-l-4 border-l-amber-500 border-t-zinc-200 border-r-zinc-200 border-b-zinc-200 dark:border-t-zinc-800 dark:border-r-zinc-800 dark:border-b-zinc-800 bg-white dark:bg-zinc-900',
    breakdown: 'border-l-4 border-l-red-500 border-t-zinc-200 border-r-zinc-200 border-b-zinc-200 dark:border-t-zinc-800 dark:border-r-zinc-800 dark:border-b-zinc-800 bg-white dark:bg-zinc-900',
  }[machine.status] || 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800';

  const dotCls = {
    running: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
    idle: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]',
    breakdown: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
  }[machine.status] || 'bg-zinc-400';

  const idleDuration = machine.idle_since
    ? Math.round((Date.now() - new Date(machine.idle_since).getTime()) / 60000)
    : null;

  return (
    <div className={`card overflow-hidden transition-all duration-300 hover:shadow-md ${statusCls} p-5`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${dotCls}`} />
          <div>
            <p className="font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">{machine.name}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{machine.type}</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity [&:hover]:opacity-100 sm:opacity-100">
            <button onClick={() => onEdit(machine)} className="p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={() => onDelete(machine.id)} className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50 flex items-center justify-between">
        <span className={`badge badge-${machine.status}`}>{machine.status.toUpperCase()}</span>
        {machine.status !== 'running' && idleDuration !== null && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium bg-zinc-50 dark:bg-zinc-800 px-2 py-1 rounded-md">
            <Clock size={12} /> {idleDuration}m ago
          </span>
        )}
        {machine.status === 'running' && machine.last_active_at && (
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-500">Active</span>
        )}
      </div>
    </div>
  );
}

function MachineModal({ machine, onClose, onSave }) {
  const [form, setForm] = useState({ name: machine?.name || '', type: machine?.type || '', status: machine?.status || 'idle' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      if (machine) {
        await api.put(`/machines/${machine.id}`, form);
        toast.success('Machine updated');
      } else {
        await api.post('/machines', form);
        toast.success('Machine added');
      }
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
          <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50 border-b-2 border-transparent">{machine ? 'Edit Machine' : 'Add Machine'}</h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Machine Name <span className="text-red-500">*</span></label>
            <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required placeholder="CNC Machine #1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Machine Type <span className="text-red-500">*</span></label>
            <input className="input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} required placeholder="CNC Milling" />
          </div>
          {machine && (
            <div>
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1.5 uppercase tracking-wide">Status</label>
              <select className="select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                <option value="running">Running</option>
                <option value="idle">Idle</option>
                <option value="breakdown">Breakdown</option>
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800 mt-4">
            <button type="submit" className="btn-primary flex-1 justify-center py-2.5" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              {machine ? 'Update' : 'Add Machine'}
            </button>
            <button type="button" className="btn-secondary flex-1 py-2.5" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MachinesPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMachine, setEditMachine] = useState(null);

  const fetchMachines = useCallback(async () => {
    try {
      const res = await api.get('/machines');
      setMachines(res.data);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMachines(); }, [fetchMachines]);
  useEffect(() => {
    if (!socket) return;
    socket.on('machine:status', fetchMachines);
    return () => socket.off('machine:status', fetchMachines);
  }, [socket, fetchMachines]);

  const deleteMachine = async id => {
    if (!confirm('Delete this machine?')) return;
    try {
      await api.delete(`/machines/${id}`);
      toast.success('Machine deleted');
      fetchMachines();
    } catch { toast.error('Failed to delete'); }
  };

  const canEdit = user?.role !== 'worker';

  const grouped = {
    running: machines.filter(m => m.status === 'running'),
    idle: machines.filter(m => m.status === 'idle'),
    breakdown: machines.filter(m => m.status === 'breakdown'),
  };

  return (
    <div className="space-y-6 animate-slide-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Cpu className="text-zinc-400 dark:text-zinc-500" size={28} />
            Machines
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">{machines.length} machines registered in the factory</p>
        </div>
        {canEdit && (
          <button id="add-machine-btn" className="btn-primary" onClick={() => { setEditMachine(null); setShowModal(true); }}>
            <Plus size={18} /> Add Machine
          </button>
        )}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Running', count: grouped.running.length, cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400' },
          { label: 'Idle', count: grouped.idle.length, cls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400' },
          { label: 'Breakdown', count: grouped.breakdown.length, cls: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400' },
        ].map(({ label, count, cls }) => (
          <div key={label} className={`rounded-2xl p-4 text-center shadow-sm ${cls}`}>
            <p className="text-3xl font-extrabold">{count}</p>
            <p className="text-xs font-bold uppercase tracking-wider mt-1 opacity-80">{label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="text-zinc-400 animate-spin" /></div>
      ) : (
        <div className="space-y-8">
          {['running', 'idle', 'breakdown'].map(status => (
            grouped[status].length > 0 && (
              <div key={status}>
                <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">{status} Machines</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {grouped[status].map(m => (
                    <MachineCard
                      key={m.id}
                      machine={m}
                      canEdit={canEdit}
                      onEdit={m => { setEditMachine(m); setShowModal(true); }}
                      onDelete={deleteMachine}
                    />
                  ))}
                </div>
              </div>
            )
          ))}
          {machines.length === 0 && (
            <div className="text-center py-16 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-500">
              <Cpu size={32} className="mx-auto mb-3 opacity-20" />
              <p>No machines registered yet.</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <MachineModal
          machine={editMachine}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); fetchMachines(); }}
        />
      )}
    </div>
  );
}
