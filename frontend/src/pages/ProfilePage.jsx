import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { User, Lock, Save, Loader2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProfilePage() {
    const { user, setUser, getImageUrl } = useAuth();
    const { t } = useLanguage();
    const [form, setForm] = useState({ name: '', password: '', confirmPassword: '' });
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await api.get('/auth/me');
                setForm(p => ({ ...p, name: res.data.name }));
            } catch (err) {
                toast.error('Failed to fetch profile details');
            } finally {
                setFetching(false);
            }
        };
        fetchProfile();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.password && form.password !== form.confirmPassword) {
            return toast.error('Passwords do not match');
        }

        setLoading(true);
        try {
            await api.put('/auth/profile', {
                name: form.name,
                password: form.password || undefined
            });
            toast.success('Profile updated successfully');
            // Update local auth context name
            setUser({ ...user, name: form.name });
            setForm(p => ({ ...p, password: '', confirmPassword: '' }));
        } catch (err) {
            toast.error(err.response?.data?.error || 'Update failed');
        } finally {
            setLoading(false);
        }
    };

    const isAdmin = user?.role === 'admin';
    const isPrimaryAdmin = user?.email === 'admin@shopfloor.com';

    if (fetching) return (
        <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-zinc-400" size={32} />
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto py-8 animate-slide-in">
            <div className="mb-8 flex items-center gap-6">
                <div className="w-24 h-24 rounded-3xl bg-zinc-100 dark:bg-zinc-800 border-4 border-white dark:border-zinc-800 shadow-xl flex items-center justify-center overflow-hidden shrink-0">
                    {user?.profile_picture ? (
                        <img src={getImageUrl(user.profile_picture)} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                        <User size={40} className="text-zinc-400" />
                    )}
                </div>
                <div>
                    <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Personal Profile</h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-1 font-medium text-sm">Manage your account details and security</p>
                </div>
            </div>

            <div className="glass-card shadow-xl border-zinc-200 dark:border-zinc-800">
                {isPrimaryAdmin && (
                    <div className="mb-8 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl flex gap-3 text-amber-800 dark:text-amber-400">
                        <ShieldCheck size={20} className="shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-bold">Primary Admin Restrictions</p>
                            <p className="opacity-90">To maintain system integrity, the primary administrator credentials cannot be modified via this interface.</p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest block mb-2 px-1">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                                <input
                                    type="text"
                                    className="input pl-10 h-11"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    disabled={isAdmin}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest block mb-2 px-1">Email (ReadOnly)</label>
                            <input
                                type="email"
                                className="input h-11 bg-zinc-50 dark:bg-zinc-900/50 cursor-not-allowed text-zinc-500"
                                value={user?.email}
                                disabled
                            />
                        </div>

                        <hr className="border-zinc-100 dark:border-zinc-800 my-8" />

                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest block mb-1 px-1">New Password</label>
                            <p className="text-[10px] text-zinc-400 mb-3 px-1 italic">Leave blank to keep your current password</p>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                                <input
                                    type="password"
                                    className="input pl-10 h-11"
                                    placeholder="••••••••"
                                    value={form.password}
                                    onChange={e => setForm({ ...form, password: e.target.value })}
                                    disabled={isAdmin}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest block mb-2 px-1">Confirm New Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                                <input
                                    type="password"
                                    className="input pl-10 h-11"
                                    placeholder="••••••••"
                                    value={form.confirmPassword}
                                    onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                                    disabled={isAdmin}
                                />
                            </div>
                        </div>
                    </div>

                    {isAdmin && !isPrimaryAdmin && (
                        <div className="pt-4">
                            <button
                                type="submit"
                                className="btn-primary w-full py-3 text-sm font-bold tracking-brand shadow-lg"
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : <Save className="mr-2" size={18} />}
                                Save Profile Changes
                            </button>
                        </div>
                    )}
                    {!isAdmin && (
                        <div className="pt-4 p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center">
                            <p className="text-zinc-500 text-xs font-medium italic">Your profile details are managed by the administrator and are currently read-only.</p>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
