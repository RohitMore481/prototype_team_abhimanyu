import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import {
  TrendingUp, Calendar, Users, Cpu, Clock,
  CheckCircle2, AlertTriangle, RefreshCw, ChevronRight, Activity, ClipboardList, X, Circle,
  BellRing
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import WorkerAnalytics from '../components/WorkerAnalytics';
import AlertsPanel from '../components/AlertsPanel';
import Leaderboard from '../components/Leaderboard';

const TASK_COLORS = {
  not_started: '#a1a1aa', // zinc-400
  in_progress: '#3b82f6', // blue-500
  paused: '#f59e0b',      // amber-500
  completed: '#10b981',   // emerald-500
  delayed: '#ef4444'      // red-500
};



function AlertsWidget({ onOpen }) {
  const [activeCount, setActiveCount] = useState(0);
  const { socket } = useSocket();

  const fetchCount = useCallback(async () => {
    try {
      const res = await api.get('/supervisor/alerts?status=active');
      setActiveCount(res.data.length);
    } catch { }
  }, []);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  useEffect(() => {
    if (!socket) return;
    const updateCount = () => fetchCount();
    socket.on('worker_logout_alert', updateCount);
    return () => socket.off('worker_logout_alert', updateCount);
  }, [socket, fetchCount]);

  if (activeCount === 0) return null;

  return (
    <div
      onClick={onOpen}
      className="group relative p-5 rounded-3xl bg-amber-500 text-white shadow-xl shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer overflow-hidden animate-bounce-subtle"
    >
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
        <AlertTriangle size={80} />
      </div>
      <div className="flex items-center gap-4 relative z-10">
        <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-md">
          <BellRing className="text-white" size={24} />
        </div>
        <div>
          <h3 className="text-2xl font-black">{activeCount} Worker Alerts</h3>
          <p className="text-xs font-bold text-white/80 uppercase tracking-widest">Action Required</p>
        </div>
        <div className="ml-auto p-2 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors">
          <ChevronRight size={20} />
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {

  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [weeklyData, setWeeklyData] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [workerData, setWorkerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [projects, setProjects] = useState([]);
  const [workingProject, setWorkingProject] = useState(() => localStorage.getItem('admin_working_project') || '');
  const { socket } = useSocket();
  const { isDark } = useTheme();
  const { user, getImageUrl } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === 'admin') {
      api.get('/projects').then(res => setProjects(res.data)).catch(() => { });
    }
  }, [user?.role]);

  const fetchSummary = useCallback(async () => {
    try {
      const url = workingProject ? `/analytics/summary?projectId=${workingProject}` : '/analytics/summary';
      const res = await api.get(url);
      setSummary(res.data);
    } catch { }
    setLoading(false);
  }, [workingProject]);

  const fetchWeekly = useCallback(async () => {
    try {
      const url = workingProject ? `/reports/weekly?projectId=${workingProject}` : '/reports/weekly';
      const res = await api.get(url);
      setWeeklyData(res.data);
    } catch { }
  }, [workingProject]);

  const fetchMonthly = useCallback(async () => {
    try {
      const url = workingProject ? `/reports/monthly?projectId=${workingProject}` : '/reports/monthly';
      const res = await api.get(url);
      setMonthlyData(res.data);
    } catch { }
  }, [workingProject]);

  const fetchWorkers = useCallback(async () => {
    try {
      const url = workingProject ? `/reports/workers?projectId=${workingProject}` : '/reports/workers';
      const res = await api.get(url);
      setWorkerData(res.data);
    } catch { }
  }, [workingProject]);

  useEffect(() => {
    if (activeTab === 'overview') fetchSummary();
    if (activeTab === 'weekly') fetchWeekly();
    if (activeTab === 'monthly') fetchMonthly();
    if (activeTab === 'workers') fetchWorkers();
  }, [activeTab, fetchSummary, fetchWeekly, fetchMonthly, fetchWorkers]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      if (activeTab === 'overview') fetchSummary();
      if (activeTab === 'weekly') fetchWeekly();
      if (activeTab === 'monthly') fetchMonthly();
      if (activeTab === 'workers') fetchWorkers();
    };

    socket.on('task:updated', refresh);
    socket.on('task:deleted', refresh);
    socket.on('machine:status', refresh);
    socket.on('user:status', refresh);

    return () => {
      socket.off('task:updated', refresh);
      socket.off('task:deleted', refresh);
      socket.off('machine:status', refresh);
      socket.off('user:status', refresh);
    };
  }, [socket, activeTab, fetchSummary, fetchWeekly, fetchMonthly, fetchWorkers]);

  const tooltipStyle = {
    background: isDark ? '#18181b' : '#ffffff',
    border: `1px solid ${isDark ? '#27272a' : '#e4e4e7'}`,
    borderRadius: '8px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    color: isDark ? '#fafafa' : '#09090b',
  };

  if (loading && !summary && activeTab === 'overview') return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={24} className="text-zinc-400 animate-spin" />
    </div>
  );

  const renderOverview = () => {
    if (!summary) return null;

    const totalTasks = summary.taskCounts?.reduce((sum, item) => sum + item.count, 0) || 0;
    const completedTasks = summary.taskCounts?.find(t => t.status === 'completed')?.count || 0;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const totalDelay = summary.total_delay_mins || 0;

    const machineMap = (summary.machineCounts || []).reduce((acc, current) => {
      acc[current.status] = current.count;
      return acc;
    }, {});

    const pieData = (summary.taskCounts || []).map(t => ({
      name: t.status.replace('_', ' '),
      value: t.count
    }));

    return (
      <div className="space-y-6 animate-slide-in">
        {user?.role === 'supervisor' && summary.projectName && (
          <div className="px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-xl shadow-blue-500/20 mb-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
              <ClipboardList size={80} />
            </div>
            <p className="text-blue-100 text-xs font-black uppercase tracking-[0.2em] mb-1">Active Assignment</p>
            <h2 className="text-4xl font-black tracking-tight flex items-center gap-3">
              <div className="w-1.5 h-8 bg-white/30 rounded-full" />
              {summary.projectName}
            </h2>
            <div className="mt-4 flex items-center gap-4 text-sm font-bold text-blue-50/80">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 uppercase tracking-tighter">
                <Users size={14} /> Team Lead
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 uppercase tracking-tighter">
                <Clock size={14} /> Active Project
              </div>
            </div>
          </div>
        )}

        {user?.role === 'supervisor' && (
          <div className="mb-8">
            <AlertsWidget onOpen={() => setIsAlertsOpen(true)} />
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Tasks', value: totalTasks, icon: ClipboardList, color: 'text-blue-500', path: `/${user?.role}/tasks` },
            { label: 'Delayed Tasks', value: `${summary.delayedTasks || 0}`, subValue: `${Math.round(totalDelay)}m delay`, icon: AlertTriangle, color: 'text-red-500', path: `/${user?.role}/tasks?filter=delayed` },
            { label: 'Completed Today', value: summary.completedToday || 0, icon: CheckCircle2, color: 'text-emerald-500', path: `/${user?.role}/tasks?filter=completed` },
            { label: 'Completion Rate', value: `${completionRate}%`, icon: TrendingUp, color: 'text-purple-500', path: null },
          ].map(({ label, value, icon: Icon, color, path }) => (
            <div
              key={label}
              className={`card flex items-center gap-4 transition-all duration-300 ${path ? 'hover:scale-[1.02] hover:shadow-lg cursor-pointer' : ''}`}
              onClick={() => path && navigate(path)}
            >
              <div className={`p-3 rounded-xl flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50 group-hover:bg-white dark:group-hover:bg-zinc-700 transition-colors`}>
                <Icon size={20} className={color} />
              </div>
              <div className="flex-1">
                <div className="flex items-end gap-1.5">
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">{value}</p>
                  {label === 'Delayed Tasks' && (
                    <span className="text-[10px] font-black text-red-500 mb-1 px-1 bg-red-50 dark:bg-red-500/10 rounded uppercase">
                      {Math.round(totalDelay)}m
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500 font-medium">{label}</p>
                  {path && <ChevronRight size={12} className="text-zinc-300" />}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 className="font-semibold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            <Cpu size={18} className="text-zinc-500" /> Machine Status
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Running', key: 'running', cls: 'badge-running', count: machineMap.running || 0, path: `/${user?.role}/machines?filter=running` },
              { label: 'Occupied', key: 'occupied', cls: 'badge-paused', count: machineMap.occupied || 0, path: `/${user?.role}/machines?filter=occupied` },
              { label: 'Idle', key: 'idle', cls: 'badge-idle', count: machineMap.idle || 0, path: `/${user?.role}/machines?filter=idle` },
              { label: 'Breakdown', key: 'breakdown', cls: 'badge-breakdown', count: machineMap.breakdown || 0, path: `/${user?.role}/machines?filter=breakdown` },
            ].map(({ label, cls, count, key, path }) => (
              <div
                key={label}
                onClick={() => navigate(path)}
                className="flex flex-col items-center justify-center p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/30 hover:bg-white dark:hover:bg-zinc-800/50 transition-all cursor-pointer group shadow-sm hover:shadow-md"
              >
                <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 mb-3 group-hover:scale-110 transition-transform">{count}</p>
                <span className={`${cls} transition-colors`}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="card min-w-0">
              <h3 className="font-semibold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                <Activity size={18} className="text-zinc-500" /> Task Distribution
              </h3>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={90} dataKey="value" label={({ name }) => name}>
                      {pieData.map((e, i) => <Cell key={i} fill={TASK_COLORS[e.name.replace(' ', '_')] || '#a1a1aa'} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card min-w-0">
              <h3 className="font-semibold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                <TrendingUp size={18} className="text-zinc-500" /> Daily Trend
              </h3>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={summary.dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#27272a' : '#e4e4e7'} vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: isDark ? '#a1a1aa' : '#71717a' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: isDark ? '#a1a1aa' : '#71717a' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} name="Tasks" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <Leaderboard workingProject={workingProject} />
          </div>
        </div>
      </div>
    );
  };

  const renderWeekly = () => {
    if (!weeklyData) return <div className="text-center py-10"><RefreshCw className="animate-spin inline mr-2 text-zinc-400" /></div>;
    const { current, dailyTrend } = weeklyData;
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            onClick={() => navigate(`/${user?.role}/tasks`)}
            className="card flex flex-col justify-center cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all group"
          >
            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Total Tasks</p>
            <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 group-hover:text-blue-600 transition-colors">{current.total_tasks || 0}</p>
          </div>
          <div
            onClick={() => navigate(`/${user?.role}/tasks?filter=completed`)}
            className="card flex flex-col justify-center border-l-4 border-l-emerald-500 cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all group"
          >
            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Completed</p>
            <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-500 group-hover:text-emerald-400 transition-colors">{current.completed || 0}</p>
          </div>
          <div
            onClick={() => navigate(`/${user?.role}/tasks?filter=delayed`)}
            className="card flex flex-col justify-center border-l-4 border-l-red-500 cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all group"
          >
            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Delayed</p>
            <p className="text-3xl font-extrabold text-red-600 dark:text-red-500 group-hover:text-red-400 transition-colors">{current.delayed || 0}</p>
          </div>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-6 text-zinc-900 dark:text-zinc-100">7-Day Productivity Trend</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#27272a' : '#e4e4e7'} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: isDark ? '#a1a1aa' : '#71717a' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: isDark ? '#a1a1aa' : '#71717a' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                <Bar dataKey="count" fill="#3b82f6" name="Total Tasks" radius={[4, 4, 0, 0]} barSize={32} />
                <Bar dataKey="completed" fill="#10b981" name="Completed" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  const renderMonthly = () => {
    if (!monthlyData) return <div className="text-center py-10"><RefreshCw className="animate-spin inline mr-2 text-zinc-400" /></div>;
    const { current, machineUtilization } = monthlyData;
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="card">
          <h3 className="font-semibold mb-6 text-zinc-900 dark:text-zinc-100">Monthly Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div onClick={() => navigate(`/${user?.role}/tasks`)} className="cursor-pointer group">
              <p className="text-xs text-zinc-500 font-semibold mb-1 group-hover:text-zinc-400 transition-colors uppercase tracking-widest">Total Tasks</p>
              <p className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 group-hover:text-blue-500 transition-colors">{current.total_tasks || 0}</p>
            </div>
            <div onClick={() => navigate(`/${user?.role}/tasks?filter=completed`)} className="cursor-pointer group">
              <p className="text-xs text-zinc-500 font-semibold mb-1 group-hover:text-zinc-400 transition-colors uppercase tracking-widest">Completed</p>
              <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-500 group-hover:text-emerald-400 transition-colors">{current.completed || 0}</p>
            </div>
            <div onClick={() => navigate(`/${user?.role}/tasks?filter=delayed`)} className="cursor-pointer group">
              <p className="text-xs text-zinc-500 font-semibold mb-1 group-hover:text-zinc-400 transition-colors uppercase tracking-widest">Delays</p>
              <p className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-500 group-hover:text-red-400 transition-colors">{current.delayed || 0}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 font-semibold mb-1 uppercase tracking-widest">Avg Time</p>
              <p className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{current.avg_completion_time ? Math.round(current.avg_completion_time) : 0} <span className="text-sm font-medium text-zinc-400">min</span></p>
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            Machine Utilization (Tasks Assigned)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={machineUtilization} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#27272a' : '#e4e4e7'} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: isDark ? '#a1a1aa' : '#71717a' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: isDark ? '#a1a1aa' : '#71717a' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="task_count" fill="#8b5cf6" name="Total Tasks" radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="completed" fill="#10b981" name="Completed" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  const renderWorkers = () => {
    if (!workerData) return <div className="text-center py-10"><RefreshCw className="animate-spin inline mr-2 text-zinc-400" /></div>;
    return (
      <div className="card animate-slide-in">
        <h3 className="font-semibold mb-2 text-zinc-900 dark:text-zinc-100">Collective Worker Performance</h3>
        <p className="text-sm text-zinc-500 mb-6 flex items-center gap-1.5"><Activity size={14} /> Click on a worker to view detailed daily/weekly analytics.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 dark:text-zinc-400 uppercase text-xs font-semibold tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                <th className="pb-3 px-3">Worker</th>
                <th className="pb-3 text-center">Credits</th>
                <th className="pb-3 text-center">Tasks</th>
                <th className="pb-3 text-center">Completed</th>
                <th className="pb-3 text-center">Delayed</th>
                <th className="pb-3 text-right pr-4 w-40">Efficiency</th>
                <th className="pb-3 text-right">Avg Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {workerData.map(w => {
                const eff = w.total_tasks > 0 ? Math.round((w.completed / w.total_tasks) * 100) : 0;
                return (
                  <tr
                    key={w.id}
                    onClick={() => setSelectedWorker(w)}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer transition-colors group"
                  >
                    <td className="py-4 px-3 font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-400 overflow-hidden shrink-0 transition-colors">
                        {w.profile_picture ? (
                          <img src={getImageUrl(w.profile_picture)} alt={w.worker_name} className="w-full h-full object-cover" />
                        ) : (
                          w.worker_name?.charAt(0)
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold">{w.worker_name}</span>
                        {w.is_on_break === 1 && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase flex items-center gap-1 leading-none pt-1 animate-pulse">
                          <Circle size={4} fill="currentColor" /> Break
                        </span>}
                      </div>
                    </td>
                    <td className="py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-blue-600 dark:text-blue-400 font-black text-base">{w.total_credits || 0}</span>
                        <span className="text-[10px] uppercase tracking-tighter text-zinc-400 font-bold">Points</span>
                      </div>
                    </td>
                    <td className="py-4 text-center text-zinc-600 dark:text-zinc-300 font-medium">{w.total_tasks}</td>
                    <td className="py-4 text-center text-emerald-600 dark:text-emerald-500 font-semibold">{w.completed}</td>
                    <td className="py-4 text-center text-red-600 dark:text-red-500 font-semibold">{w.delayed}</td>
                    <td className="py-4 text-right pr-4">
                      <div className="flex items-center justify-end gap-3">
                        <div className="h-1.5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${eff > 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${eff}%` }} />
                        </div>
                        <span className={`text-xs font-bold w-8 text-right ${eff > 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{eff}%</span>
                      </div>
                    </td>
                    <td className="py-4 text-right text-zinc-500 dark:text-zinc-400 font-medium">{w.avg_completion_time ? Math.round(w.avg_completion_time) : 0} min</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl w-max shadow-sm">
          {[
            { id: 'overview', icon: Activity, label: 'Overview' },
            { id: 'weekly', icon: Clock, label: 'Weekly' },
            { id: 'monthly', icon: TrendingUp, label: 'Monthly' },
            { id: 'workers', icon: Users, label: 'Workers' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all rounded-lg ${activeTab === t.id
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm border border-zinc-200 dark:border-zinc-700/50'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 border border-transparent'
                }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {user?.role === 'admin' && (
          <div className="w-full sm:w-auto relative">
            <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 ml-1">Working Project</h4>
            <select
              className="select w-full sm:w-64 !py-2 !h-auto text-sm bg-white dark:bg-zinc-900 shadow-sm transition-all hover:border-zinc-400 focus:border-blue-500"
              value={workingProject}
              onChange={e => {
                const val = e.target.value;
                setWorkingProject(val);
                localStorage.setItem('admin_working_project', val);
              }}
            >
              <option value="">Global System Scope</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'weekly' && renderWeekly()}
      {activeTab === 'monthly' && renderMonthly()}
      {activeTab === 'workers' && renderWorkers()}

      {/* Analytics Drill-down Modal */}
      {selectedWorker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 lg:p-8 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm animate-slide-in">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl flex flex-col relative">
            <div className="sticky top-0 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md z-10 flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                  <TrendingUp className="text-zinc-400" size={20} />
                  Performance Drill-down: {selectedWorker.worker_name || selectedWorker.name}
                </h2>
                <p className="text-sm text-zinc-500 mt-1">Individual productivity trends and historical data</p>
              </div>
              <button
                onClick={() => setSelectedWorker(null)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <WorkerAnalytics workerId={selectedWorker.id} />
            </div>
          </div>
        </div>
      )}

      <AlertsPanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
      />
    </div>
  );
}
