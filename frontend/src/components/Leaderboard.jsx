import { useState, useEffect } from 'react';
import { Trophy, Star, Medal, ChevronRight } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function Leaderboard({ workingProject }) {
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);
    const { getImageUrl } = useAuth();

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const url = workingProject ? `/credits/leaderboard?projectId=${workingProject}` : '/credits/leaderboard';
                const res = await api.get(url);
                setWorkers(res.data);
            } catch (e) {
                console.error('Failed to fetch leaderboard:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchLeaderboard();
    }, [workingProject]);

    if (loading) return (
        <div className="card space-y-4">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-2xl" />
            ))}
        </div>
    );

    return (
        <div className="card !p-0 overflow-hidden">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/20">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500 rounded-xl text-white shadow-lg shadow-amber-500/20">
                        <Trophy size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100 italic">Top Performers</h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Monthly Rankings</p>
                    </div>
                </div>
            </div>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {workers.map((worker, index) => (
                    <div
                        key={worker.id}
                        className="p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors group cursor-pointer"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-8 flex justify-center">
                                {index === 0 && <Medal className="text-amber-500" size={24} />}
                                {index === 1 && <Medal className="text-zinc-400" size={22} />}
                                {index === 2 && <Medal className="text-orange-400" size={20} />}
                                {index > 2 && <span className="text-sm font-black text-zinc-300 dark:text-zinc-700">#{index + 1}</span>}
                            </div>

                            <div className="relative">
                                {worker.profile_picture ? (
                                    <img
                                        src={getImageUrl(worker.profile_picture)}
                                        alt={worker.name}
                                        className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-zinc-900"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center font-bold text-zinc-500">
                                        {worker.name.charAt(0)}
                                    </div>
                                )}

                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-amber-600 transition-colors">
                                    {worker.name}
                                </h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400">
                                        <Star size={10} className="text-amber-500 fill-current" />
                                        {worker.total_credits} Total
                                    </div>

                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <div className="text-xs font-black text-zinc-900 dark:text-zinc-100">+{worker.today_credits}</div>
                                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">TODAY</div>
                            </div>
                            <ChevronRight className="text-zinc-300 group-hover:text-zinc-400 transition-colors" size={16} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-4 bg-zinc-50/50 dark:bg-zinc-900/20 text-center">
                <button className="text-[11px] font-black text-zinc-500 hover:text-amber-600 uppercase tracking-widest transition-colors flex items-center gap-2 mx-auto">
                    View Complete Hall of Fame
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}
