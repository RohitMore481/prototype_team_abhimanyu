import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';
import { Check, X, Clock, AlertTriangle, Coffee, Cpu, Loader2, Search, User } from 'lucide-react';

export default function RequestsPage() {
    const { t } = useLanguage();
    const { socket } = useSocket();
    const { getImageUrl } = useAuth();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending');

    const fetchRequests = useCallback(async () => {
        try {
            const res = await api.get('/requests');
            setRequests(res.data);
        } catch {
            toast.error('Failed to fetch requests');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRequests();
        if (socket) {
            socket.on('request:new', (newReq) => {
                setRequests(prev => [newReq, ...prev]);
                toast(`New ${newReq.type} request from ${newReq.user_name}`, { icon: '🔔' });
            });
            socket.on('request:updated', (updatedReq) => {
                setRequests(prev => prev.map(r => r.id === updatedReq.id ? updatedReq : r));
            });
        }
        return () => {
            if (socket) {
                socket.off('request:new');
                socket.off('request:updated');
            }
        };
    }, [socket, fetchRequests]);

    const handleAction = async (id, status) => {
        try {
            await api.put(`/requests/${id}`, { status });
            toast.success(`Request ${status}`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Action failed');
        }
    };

    const filteredRequests = requests.filter(r => {
        if (filter === 'all') return true;
        return r.status === filter;
    });

    return (
        <div className="space-y-6 animate-slide-in max-w-[1200px] mx-auto pb-12">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mt-1 tracking-tight">Approval Requests</h1>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm">Manage worker breaks and machine breakdown reports</p>
                </div>
                <div className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    {['pending', 'approved', 'rejected', 'all'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-all ${filter === f ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 shadow-md' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 size={32} className="text-zinc-400 animate-spin" /></div>
            ) : filteredRequests.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-zinc-900/40 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center">
                    <Search size={48} className="text-zinc-300 dark:text-zinc-700 mb-4" />
                    <p className="text-zinc-500 font-medium">No {filter !== 'all' ? filter : ''} requests found</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredRequests.map(request => (
                        <div key={request.id} className={`p-6 rounded-2xl border transition-all ${request.status === 'pending' ? 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm ring-1 ring-blue-500/10' : 'bg-zinc-50/50 dark:bg-zinc-900/20 border-zinc-100 dark:border-zinc-800 opacity-80'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-2 border-white dark:border-zinc-800 shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                                        {request.user_picture ? (
                                            <img src={getImageUrl(request.user_picture)} alt={request.user_name} className="w-full h-full object-cover" />
                                        ) : (
                                            <User size={24} className="text-zinc-400" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">{request.user_name}</h3>
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${request.status === 'pending' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' : request.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                                {request.status}
                                            </span>
                                        </div>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                            Requested {request.type === 'break' ? 'a break' : 'a machine breakdown report'} • {new Date(request.created_at).toLocaleString()}
                                        </p>
                                        {request.data && JSON.parse(request.data).note && (
                                            <p className="mt-2 text-xs bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg text-zinc-600 dark:text-zinc-400 italic">
                                                "{JSON.parse(request.data).note}"
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {request.status === 'pending' ? (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleAction(request.id, 'rejected')}
                                            className="p-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl border border-red-200 dark:border-red-500/20 transition-colors group"
                                            title="Reject"
                                        >
                                            <X size={20} className="group-active:scale-90 transition-transform" />
                                        </button>
                                        <button
                                            onClick={() => handleAction(request.id, 'approved')}
                                            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95 group font-bold"
                                        >
                                            <Check size={20} className="group-active:scale-90 transition-transform" />
                                            Approve
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-xs font-medium text-zinc-400 dark:text-zinc-500 italic">
                                        Processed at {new Date(request.updated_at).toLocaleTimeString()}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
