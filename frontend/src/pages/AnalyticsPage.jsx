import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { Loader2, TrendingDown, Cpu, Users } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { toast } from 'react-hot-toast';

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [downtime, setDowntime] = useState(null);
  const [loading, setLoading] = useState(true);

  const [projects, setProjects] = useState([]);
  const [filterProject, setFilterProject] = useState(() => localStorage.getItem('admin_working_project') || '');

  // Fetch projects list once
  useEffect(() => {
    api.get('/projects').then(res => setProjects(res.data)).catch(() => { });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const query = filterProject ? `?projectId=${filterProject}` : '';
      const [sRes, dRes] = await Promise.all([
        api.get(`/analytics/summary${query}`),
        api.get(`/analytics/downtime${query}`)
      ]);
      setData(sRes.data);
      setDowntime(dRes.data);
    } catch (err) {
      console.error('Analytics Fetch Error:', err);
      toast.error('Failed to load analytics data');
    }
    setLoading(false);
  }, [filterProject]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={28} className="text-blue-500 animate-spin" /></div>;

  const workerChartData = (data?.workerPerformance || []).map(w => ({
    name: w.name.split(' ')[0],
    completed: w.completed || 0,
    delayed: w.delayed || 0,
    total: w.total_tasks || 0,
    total_delay_mins: w.total_delay_mins || 0,
    efficiency: w.total_tasks > 0 ? Math.round((w.completed / w.total_tasks) * 100) : 0,
  }));

  const machineChartData = (data?.machineUtilization || []).map(m => ({
    name: m.name.length > 12 ? m.name.substring(0, 12) + '…' : m.name,
    tasks: m.total_tasks || 0,
    completed: m.completed_tasks || 0,
    active: m.active_tasks || 0,
  }));

  const pauseData = (data?.pauseReasons || []).map(p => ({
    name: p.pause_reason,
    count: p.count,
  }));

  const handleFilterChange = (val) => {
    setFilterProject(val);
    localStorage.setItem('admin_working_project', val);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">Analytics & Reports</h1>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">Operational efficiency insights</p>
        </div>

        {/* Project Selector for Admin Isolation */}
        <select
          className="select bg-white dark:bg-zinc-950 font-bold text-sm min-w-[240px] shadow-sm border border-zinc-200 dark:border-zinc-800"
          value={filterProject}
          onChange={e => handleFilterChange(e.target.value)}
        >
          <option value="">Global (All Active Projects)</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} {p.status === 'completed' ? '(Completed)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Workers', value: data?.workerCount || 0, color: 'text-blue-600 dark:text-blue-400', path: '/admin/users' },
          { label: 'Delayed Tasks', value: data?.delayedTasks || 0, color: 'text-zinc-600 dark:text-zinc-400', path: '/admin/tasks?filter=delayed' },
          { label: 'Total Delay (Mins)', value: `${Math.round(workerChartData.reduce((a, b) => a + (b.total_delay_mins || 0), 0))}m`, color: 'text-red-600 dark:text-red-400', path: '/admin/tasks?filter=delayed' },
          { label: 'Completed Today', value: data?.completedToday || 0, color: 'text-emerald-600 dark:text-emerald-400', path: '/admin/tasks?filter=completed' },
          { label: 'Avg Efficiency', value: `${workerChartData.length ? Math.round(workerChartData.reduce((a, b) => a + b.efficiency, 0) / workerChartData.length) : 0}%`, color: 'text-purple-600 dark:text-purple-400', path: null },
        ].map(({ label, value, color, path }) => (
          <div
            key={label}
            className={`card text-center p-6 transition-all hover:shadow-lg hover:scale-[1.02] ${path ? 'cursor-pointer' : ''}`}
            onClick={() => path && (window.location.href = path)}
          >
            <p className={`text-4xl font-black tracking-tight ${color}`}>{value}</p>
            <p className="text-[11px] uppercase tracking-widest font-bold text-zinc-500 mt-2">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 min-w-0">
        {/* Worker Performance */}
        <div className="card">
          <h3 className="font-bold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            <Users size={16} className="text-blue-500" /> Worker Efficiency
          </h3>
          {workerChartData.length > 0 ? (
            <div className="h-[220px] w-full relative">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={workerChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--border)', opacity: 0.2 }} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' }} />
                  <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} name="Completed" />
                  <Bar dataKey="delayed" fill="#ef4444" radius={[4, 4, 0, 0]} name="Delayed" />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-zinc-500 text-center py-8">No data yet</p>}
        </div>

        {/* Machine Utilization */}
        <div className="card">
          <h3 className="font-bold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            <Cpu size={16} className="text-blue-500" /> Machine Utilization
          </h3>
          {machineChartData.length > 0 ? (
            <div className="h-[220px] w-full relative">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={machineChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--border)', opacity: 0.2 }} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' }} />
                  <Bar dataKey="tasks" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total Tasks" />
                  <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} name="Completed" />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-zinc-500 text-center py-8">No data yet</p>}
        </div>
      </div>

      {/* Pause Reasons Breakdown */}
      {pauseData.length > 0 && (
        <div className="card">
          <h3 className="font-bold mb-6 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            <TrendingDown size={16} className="text-amber-500" /> Downtime Cause Analysis
          </h3>
          <div className="h-[200px] w-full relative">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pauseData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} width={160} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--border)', opacity: 0.2 }} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' }} />
                <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Occurrences" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Downtime by Machine */}
      {(downtime?.downtimeByMachine?.length > 0) && (
        <div className="card overflow-hidden !p-0">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Downtime History by Machine</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50">
                <tr className="text-left text-[11px] text-zinc-500 uppercase tracking-wider font-bold">
                  <th className="px-6 py-4">Machine</th>
                  <th className="px-6 py-4">Reason</th>
                  <th className="px-6 py-4">Occurrences</th>
                </tr>
              </thead>
              <tbody>
                {downtime.downtimeByMachine.map((r, i) => (
                  <tr key={i} className="table-row">
                    <td className="px-6 py-4 text-zinc-900 dark:text-zinc-100 font-medium whitespace-nowrap">{r.machine_name}</td>
                    <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 max-w-sm truncate">{r.pause_reason}</td>
                    <td className="px-6 py-4 text-amber-600 dark:text-amber-500 font-bold">{r.pause_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
