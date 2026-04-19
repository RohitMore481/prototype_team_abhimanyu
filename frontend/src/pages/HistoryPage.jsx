import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useLanguage } from '../context/LanguageContext';
import { History as HistoryIcon, Search, Filter } from 'lucide-react';
import toast from 'react-hot-toast';

export default function HistoryPage() {
    const { t } = useLanguage();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await api.get('/logs/recent?limit=100');
                setHistory(res.data);
            } catch (err) {
                toast.error('Failed to fetch history');
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, []);

    const filteredHistory = history.filter(log =>
        log.task_title?.toLowerCase().includes(filter.toLowerCase()) ||
        log.action?.toLowerCase().includes(filter.toLowerCase()) ||
        log.performed_by_name?.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-slide-in">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">System History</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Activity history across the shopfloor</p>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                        type="text"
                        className="input pl-10 h-10 py-0"
                        placeholder="Search history..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>
            </div>

            <div className="glass-card overflow-hidden !p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800">
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Timestamp</th>
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Task</th>
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Action</th>
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Performed By</th>
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Note</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-zinc-400">Loading history...</td>
                                </tr>
                            ) : filteredHistory.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-zinc-400">No history found</td>
                                </tr>
                            ) : (
                                filteredHistory.map(log => (
                                    <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-zinc-400">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{log.task_title || 'System'}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`badge badge-${log.action} capitalize`}>{log.action}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{log.performed_by_name || 'System'}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs truncate">{log.note || log.pause_reason || '-'}</p>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
