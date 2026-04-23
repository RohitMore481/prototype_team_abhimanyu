import { useState, useEffect } from 'react';
import { Star, Flame, Trophy, TrendingUp, Award } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export default function CreditWidget() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [popups, setPopups] = useState([]);
    const { user } = useAuth();
    const { socket } = useSocket();

    const fetchCredits = async () => {
        try {
            const res = await api.get('/credits/summary');
            if (data && res.data.summary.total_credits > data.summary.total_credits) {
                const diff = res.data.summary.total_credits - data.summary.total_credits;
                showPopup(`+${diff}`);
            }
            setData(res.data);
        } catch (e) {
            console.error('Failed to fetch credits:', e);
        } finally {
            setLoading(false);
        }
    };

    const showPopup = (text) => {
        const id = Date.now();
        setPopups(prev => [...prev, { id, text }]);
        setTimeout(() => {
            setPopups(prev => prev.filter(p => p.id !== id));
        }, 2000);
    };

    useEffect(() => {
        fetchCredits();
        const interval = setInterval(fetchCredits, 60000); // Polling every 1m

        if (socket) {
            socket.on('credits:updated', (payload) => {
                if (payload.userId === user?.id) {
                    fetchCredits();
                }
            });
        }

        return () => {
            clearInterval(interval);
            if (socket) socket.off('credits:updated');
        };
    }, [socket, user?.id]);

    if (loading || !data) return (
        <div className="h-32 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-3xl" />
    );

    const { summary, recentLogs } = data;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 relative items-start">
            {/* Popups Layer */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-50 pointer-events-none">
                {popups.map(p => (
                    <div key={p.id} className="bg-amber-500 text-white px-4 py-1 rounded-full font-bold shadow-lg animate-bounce-in">
                        {p.text} ⭐
                    </div>
                ))}
            </div>

            {/* Total Credits */}
            <div className="card bg-gradient-to-br from-amber-500 to-orange-600 text-white border-none shadow-amber-500/20">
                <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-white/20 rounded-xl">
                        <Trophy size={20} />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest opacity-80">Total Rewards</span>
                </div>
                <div className="flex items-end gap-2 text-white">
                    <h2 className="text-4xl font-black">{summary.total_credits}</h2>
                    <Star className="mb-2 fill-current" size={20} />
                </div>
            </div>

            {/* Status Info */}
            <div className="card bg-zinc-900 text-white border-none flex flex-col justify-center items-center text-center">
                <div className="p-3 bg-blue-500/20 rounded-2xl mb-3">
                    <Award className="text-blue-400" size={32} />
                </div>
                <h3 className="text-xl font-black mb-1">Elite Operator</h3>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Task Performance Tracking</p>
            </div>

            {/* Recent Activity */}
            <div className="card overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Award className="text-amber-500" size={18} />
                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100 italic">Recent Gains</h3>
                    </div>
                    <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">TODAY: +{summary.today_credits}</span>
                </div>
                <div className="space-y-3">
                    <div className="p-4 flex flex-col items-center justify-center">
                        <div className="flex items-center gap-10 mb-4">
                            <div className="text-center">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1">Today</p>
                                <p className="text-4xl font-black text-blue-600 dark:text-blue-400">+{summary.today_credits || 0}</p>
                            </div>
                            <div className="w-px h-12 bg-zinc-200 dark:bg-zinc-800" />
                            <div className="text-center">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1">Total</p>
                                <p className="text-4xl font-black text-zinc-900 dark:text-zinc-50">{summary.total_credits || 0}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">Task-Based Performance System Active</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
