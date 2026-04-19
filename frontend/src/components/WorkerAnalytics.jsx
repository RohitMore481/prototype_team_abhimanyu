import { useState, useEffect } from 'react';
import api from '../utils/api';
import {
  Calendar, TrendingUp, Clock,
  AlertTriangle, RefreshCw, History,
  BarChart3, PieChartIcon, Pause, Circle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line
} from 'recharts';

export default function WorkerAnalytics({ workerId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/reports/worker/${workerId}`);
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch worker stats');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [workerId]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <RefreshCw className="animate-spin text-blue-500" size={32} />
      <p className="text-zinc-500 animate-pulse font-medium">Generating performance report...</p>
    </div>
  );

  if (!data) return <div className="text-center py-10 font-medium text-zinc-500">No data available for this worker.</div>;

  const { collective = {}, dailyTrend = [], monthlyTrend = [], activityHistory = [], breakHistory = [] } = data || {};
  const completionRate = collective.total_tasks > 0
    ? Math.round((collective.completed / collective.total_tasks) * 100)
    : 0;

  return (
    <div className="space-y-8 mt-2">
      {/* Top Level Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Completion Rate', value: `${completionRate}%`, icon: PieChartIcon, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20', path: null },
          { label: 'Tasks Done', value: collective.completed || 0, icon: BarChart3, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20', path: `/admin/tasks?filter=completed&workerId=${workerId}` },
          { label: 'Delayed Tasks', value: collective.delayed || 0, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20', path: `/admin/tasks?filter=delayed&workerId=${workerId}` },
          { label: 'Avg Speed', value: `${Math.round(collective.avg_time || 0)}m`, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20', path: null },
        ].map((item, i) => (
          <div
            key={i}
            className={`p-5 rounded-2xl ${item.bg} transition-all hover:shadow-md hover:scale-[1.02] ${item.path ? 'cursor-pointer' : ''}`}
            onClick={() => item.path && (window.location.href = item.path)}
          >
            <item.icon size={18} className={`${item.color} mb-3 opacity-90`} />
            <p className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">{item.value}</p>
            <p className="text-[11px] uppercase tracking-widest text-zinc-600 dark:text-zinc-400 font-bold mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Break History Section */}
      <div className="card">
        <h4 className="text-sm font-bold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100"><Pause size={16} className="text-emerald-500" /> Daily Break History</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 dark:text-zinc-400 uppercase text-[10px] font-bold tracking-widest border-b border-zinc-100 dark:border-zinc-800">
                <th className="pb-3 px-2">Date</th>
                <th className="pb-3">Start Time</th>
                <th className="pb-3">End Time</th>
                <th className="pb-3 text-right pr-2">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {breakHistory && breakHistory.length > 0 ? breakHistory.map((log, i) => {
                const start = new Date(log.start_time);
                const end = log.end_time ? new Date(log.end_time) : null;
                const duration = end ? Math.round((end - start) / 60000) : 'In Progress';
                return (
                  <tr key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="py-3 px-2 text-zinc-900 dark:text-zinc-100 font-bold">{log.date}</td>
                    <td className="py-3 text-zinc-500 dark:text-zinc-400">{start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="py-3 text-zinc-500 dark:text-zinc-400">{end ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td className="py-3 text-right pr-2 font-mono font-bold text-blue-600 dark:text-blue-400">{duration}{typeof duration === 'number' ? 'm' : ''}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="4" className="py-10 text-center text-zinc-400 font-medium italic">No break history found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 min-w-0">
        {/* Daily & Weekly Section */}
        <div className="space-y-6 min-w-0">
          <div className="card">
            <h4 className="text-sm font-bold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100"><TrendingUp size={16} className="text-blue-500" /> Daily Task Completion</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h4 className="text-sm font-bold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100"><Calendar size={16} className="text-emerald-500" /> Monthly Performance Trend</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted)', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--border)', opacity: 0.2 }} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }} />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} name="Tasks Completed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent Activity History */}
        <div className="card flex flex-col pt-6 pb-2 px-6">
          <h4 className="text-sm font-bold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100"><History size={16} className="text-amber-500" /> Recent Activity History</h4>
          <div className="flex-1 space-y-4 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
            {activityHistory.length === 0 && <p className="text-center py-10 text-zinc-500 text-xs font-medium italic bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800">No activity recorded for this worker.</p>}
            {activityHistory.map((log, i) => (
              <div key={i} className="group relative pl-6 pb-4 border-l border-zinc-200 dark:border-zinc-800 last:border-0 last:pb-0">
                <div className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-950 bg-zinc-300 dark:bg-zinc-700 group-hover:bg-blue-500 transition-colors shadow-sm" />
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded mr-2 inline-block">{log.action}</span>
                  <span className="text-[11px] font-semibold text-zinc-500">{new Date(log.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-sm text-zinc-900 dark:text-zinc-100 font-bold leading-snug">{log.task_title}</p>
                {log.note && <p className="text-xs text-zinc-500 mt-1.5 font-medium bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-md border border-zinc-100 dark:border-zinc-800/80">Note: {log.note}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

}
