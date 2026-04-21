import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import ChatAssistant from './ChatAssistant';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  Factory, LayoutDashboard, Cpu, ClipboardList, Users, BarChart3,
  Bell, LogOut, Menu, X, Wifi, WifiOff, Sun, Moon, Languages, Coffee, User,
  History as HistoryIcon
} from 'lucide-react';

export default function Layout({ children }) {
  const { user, logout, getImageUrl } = useAuth();
  const { connected } = useSocket();
  const { isDark, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const navItems = {
    admin: [
      { path: '/admin', label: t('dashboard'), icon: LayoutDashboard },
      { path: '/admin/tasks', label: t('all_tasks'), icon: ClipboardList },
      { path: '/admin/machines', label: t('machines'), icon: Cpu },
      { path: '/admin/users', label: t('users'), icon: Users },
      { path: '/projects', label: 'Projects', icon: Factory },
      { path: '/admin/analytics', label: t('analytics'), icon: BarChart3 },
      { path: '/history', label: t('history'), icon: HistoryIcon },
    ],
    supervisor: [
      { path: '/supervisor', label: t('dashboard'), icon: LayoutDashboard },
      { path: '/supervisor/tasks', label: t('manage_tasks'), icon: ClipboardList },
      { path: '/supervisor/machines', label: t('machines'), icon: Cpu },
      { path: '/supervisor/analytics', label: t('analytics'), icon: BarChart3 },
      { path: '/projects', label: 'Projects', icon: Factory },
      { path: '/supervisor/requests', label: t('requests'), icon: Coffee },
      { path: '/history', label: t('history'), icon: HistoryIcon },
    ],
    worker: [
      { path: '/worker', label: t('my_tasks'), icon: ClipboardList },
      { path: '/projects', label: 'Projects', icon: Factory },
    ],
    monitor: [
      { path: '/analytics', label: t('analytics'), icon: BarChart3 },
      { path: '/history', label: t('history'), icon: HistoryIcon },
    ],
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const [nRes, cRes] = await Promise.all([
        api.get('/notifications'),
        api.get('/notifications/unread-count'),
      ]);
      setNotifications(nRes.data);
      setUnreadCount(cRes.data.count);
    } catch { }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    await api.put('/notifications/read-all');
    setUnreadCount(0);
    setNotifications(p => p.map(n => ({ ...n, is_read: 1 })));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    toast.success('Logged out successfully');
  };

  const items = navItems[user?.role] || [];
  const roleBadge = {
    admin: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
    supervisor: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
    worker: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  }[user?.role] || '';

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-[#09090b]">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-300 bg-white dark:bg-[#09090b] border-r border-zinc-200 dark:border-zinc-800 
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:inset-auto`}>

        <div className="flex items-center gap-3 px-6 py-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-900 dark:bg-white text-zinc-50 dark:text-zinc-900 shadow-sm">
            <Factory size={18} />
          </div>
          <div>
            <p className="font-bold text-zinc-900 dark:text-white text-sm">Shopfloor OS</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Manufacturing Suite</p>
          </div>
        </div>

        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center font-bold text-sm text-zinc-600 dark:text-zinc-300 overflow-hidden shrink-0">
              {user?.profile_picture ? (
                <img src={getImageUrl(user.profile_picture)} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user?.name?.[0]?.toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{user?.name}</p>
              <span className={`inline-block text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border mt-0.5 ${roleBadge}`}>
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={`sidebar-item ${location.pathname === path ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={18} />
              <span className="flex-1">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 px-3 pb-2 text-xs font-medium">
            {connected
              ? <><Wifi size={14} className="text-emerald-500" /><span className="text-emerald-600 dark:text-emerald-500">{t('live_connected')}</span></>
              : <><WifiOff size={14} className="text-red-500" /><span className="text-red-600 dark:text-red-500">{t('disconnected')}</span></>
            }
          </div>
          <Link to="/profile" className={`sidebar-item w-full ${location.pathname === '/profile' ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <User size={18} />
            Profile Settings
          </Link>
          <button onClick={handleLogout} className="sidebar-item w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30 font-medium">
            <LogOut size={18} />
            {t('sign_out')}
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-zinc-900/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 flex items-center justify-between shrink-0">
          <button className="lg:hidden p-2 -ml-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>

          <div className="hidden lg:block">
            <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
              {items.find(i => i.path === location.pathname)?.label || t('dashboard')}
            </h1>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {/* Language Toggle */}
            <div className="relative group">
              <button
                className="flex items-center gap-2 p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
                title="Change Language"
              >
                <Languages size={18} />
                <span className="text-xs font-bold uppercase tracking-widest">{lang}</span>
              </button>
            </div>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors"
              title={isDark ? 'Light Mode' : 'Dark Mode'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Notifications */}
            <div className="relative flex items-center">
              <button
                onClick={() => { setNotifOpen(p => !p); if (!notifOpen) fetchNotifications(); }}
                className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 relative"
              >
                <Bell size={18} />
                {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 z-50 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 animate-slide-in overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                    <p className="font-semibold text-sm">Notifications</p>
                    <div className="flex items-center gap-3">
                      <button onClick={markAllRead} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">Mark read</button>
                      <button onClick={() => setNotifOpen(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"><X size={14} /></button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-zinc-500 flex flex-col items-center gap-2">
                        <Bell size={24} className="text-zinc-300 dark:text-zinc-700" />
                        <p className="text-sm">You're all caught up!</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                        {notifications.map(n => (
                          <div key={n.id} className={`p-4 text-sm transition-colors ${n.is_read ? 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400' : 'bg-blue-50/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100'}`}>
                            <p className={n.is_read ? 'font-normal' : 'font-medium'}>{n.message}</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5 font-medium">{new Date(n.created_at).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto w-full p-4 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      {/* Global Chatbot */}
      <ChatAssistant />
    </div>
  );
}
