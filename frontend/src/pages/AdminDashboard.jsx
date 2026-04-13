import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import {
  TrendingUp, Calendar, Users, Cpu, Clock,
  CheckCircle2, AlertTriangle, RefreshCw, ChevronRight, Activity, ClipboardList, X, Circle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import WorkerAnalytics from '../components/WorkerAnalytics';

const TASK_COLORS = {
  not_started: '#a1a1aa', // zinc-400
  in_progress: '#3b82f6', // blue-500
  paused: '#f59e0b',      // amber-500
  completed: '#10b981',   // emerald-500
  delayed: '#ef4444'      // red-500
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [weeklyData, setWeeklyData] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [workerData, setWorkerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const { socket } = useSocket();
  const { isDark } = useTheme();

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/analytics/summary');
      setSummary(res.data);
    } catch { }
    setLoading(false);
  }, []);

  const fetchWeekly = async () => {
    try {
      const res = await api.get('/reports/weekly');
      setWeeklyData(res.data);
    } catch { }
  };

  const fetchMonthly = async () => {
    try {
      const res = await api.get('/reports/monthly');
      setMonthlyData(res.data);
    } catch { }
  };

  const fetchWorkers = async () => {
    try {
      const res = await api.get('/reports/workers');
      setWorkerData(res.data);
    } catch { }
  };

  useEffect(() => {
    if (activeTab === 'overview') fetchSummary();
    if (activeTab === 'weekly') fetchWeekly();
    if (activeTab === 'monthly') fetchMonthly();
    if (activeTab === 'workers') fetchWorkers();
  }, [activeTab, fetchSummary]);

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
  }, [socket, activeTab, fetchSummary]);

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
    const taskMap = Object.fromEntries((summary.taskCounts || []).map(r => [r.status, r.count]));
    const machineMap = Object.fromEntries((summary.machineCounts || []).map(r => [r.status, r.count]));
    const totalTasks = Object.values(taskMap).reduce((a, b) => a + b, 0);
    const completionRate = totalTasks > 0 ? Math.round(((taskMap.completed || 0) / totalTasks) * 100) : 0;
    const pieData = (summary.taskCounts || []).map(r => ({ name: r.status.replace('_', ' '), value: r.count }));

    return (
      <div className="space-y-6 animate-slide-in">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Tasks', value: totalTasks, icon: ClipboardList, color: 'text-blue-500' },
            { label: 'Delayed Tasks', value: summary.delayedTasks || 0, icon: AlertTriangle, color: 'text-red-500' },
            { label: 'Completed Today', value: summary.completedToday || 0, icon: CheckCircle2, color: 'text-emerald-500' },
            { label: 'Completion Rate', value: `${completionRate}%`, icon: TrendingUp, color: 'text-purple-500' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card flex items-center gap-4">
              <div className={`p-3 rounded-xl flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50`}>
                <Icon size={20} className={color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">{value}</p>
                <p className="text-xs text-zinc-500 font-medium">{label}</p>
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
              { label: 'Running', key: 'running', cls: 'badge-running', count: machineMap.running || 0 },
              { label: 'Occupied', key: 'occupied', cls: 'badge-paused', count: machineMap.occupied || 0 },
              { label: 'Idle', key: 'idle', cls: 'badge-idle', count: machineMap.idle || 0 },
              { label: 'Breakdown', key: 'breakdown', cls: 'badge-breakdown', count: machineMap.breakdown || 0 },
            ].map(({ label, cls, count }) => (
              <div key={label} className="flex flex-col items-center justify-center p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/30">
                <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 mb-3">{count}</p>
                <span className={cls}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-semibold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
              <Activity size={18} className="text-zinc-500" /> Task Distribution
            </h3>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={90} dataKey="value" label={({ name }) => name}>
                    {pieData.map((e, i) => <Cell key={i} fill={TASK_COLORS[e.name.replace(' ', '_')] || '#a1a1aa'} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <h3 className="font-semibold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
              <TrendingUp size={18} className="text-zinc-500" /> Daily Trend
            </h3>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
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
      </div>
    );
  };

  const renderWeekly = () => {
    if (!weeklyData) return <div className="text-center py-10"><RefreshCw className="animate-spin inline mr-2 text-zinc-400" /></div>;
    const { current, dailyTrend } = weeklyData;
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card flex flex-col justify-center">
            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Total Tasks</p>
            <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">{current.total_tasks || 0}</p>
          </div>
          <div className="card flex flex-col justify-center border-l-4 border-l-emerald-500">
            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Completed</p>
            <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-500">{current.completed || 0}</p>
          </div>
          <div className="card flex flex-col justify-center border-l-4 border-l-red-500">
            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Delayed</p>
            <p className="text-3xl font-extrabold text-red-600 dark:text-red-500">{current.delayed || 0}</p>
          </div>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-6 text-zinc-900 dark:text-zinc-100">7-Day Productivity Trend</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
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
            <div>
              <p className="text-xs text-zinc-500 font-semibold mb-1">Total Tasks</p>
              <p className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{current.total_tasks || 0}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 font-semibold mb-1">Completed</p>
              <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-500">{current.completed || 0}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 font-semibold mb-1">Delays</p>
              <p className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-500">{current.delayed || 0}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 font-semibold mb-1">Avg Time</p>
              <p className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{current.avg_completion_time ? Math.round(current.avg_completion_time) : 0} <span className="text-sm font-medium text-zinc-400">min</span></p>
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            Machine Utilization (Tasks Assigned)
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
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
                      <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-400 group-hover:bg-zinc-900 group-hover:text-zinc-50 dark:group-hover:bg-white dark:group-hover:text-zinc-900 transition-colors">
                        {w.worker_name?.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold">{w.worker_name}</span>
                        {w.is_on_break === 1 && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase flex items-center gap-1 leading-none pt-1 animate-pulse">
                          <Circle size={4} fill="currentColor" /> Break
                        </span>}
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
    </div>
  );
}
