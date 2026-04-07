import { useState, useEffect } from 'react';
import api from '../utils/api';
import { 
  Calendar, TrendingUp, CheckCircle2, Clock, 
  AlertTriangle, RefreshCw, Activity, History,
  BarChart3, PieChartIcon, ArrowRight
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, LineChart, Line, Legend
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
      <RefreshCw className="animate-spin text-blue-400" size={32} />
      <p className="text-slate-400 animate-pulse">Generating performance report...</p>
    </div>
  );

  if (!data) return <div className="text-center py-10 text-slate-500">No data available for this worker.</div>;

  const { collective, dailyTrend, weeklyTrend, monthlyTrend, activityLogs } = data;
  const completionRate = collective.total_tasks > 0 
    ? Math.round((collective.completed / collective.total_tasks) * 100) 
    : 0;

  return (
    <div className="space-y-8">
      {/* Top Level Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Completion Rate', value: `${completionRate}%`, icon: PieChartIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Total Tasks', value: collective.total_tasks, icon: BarChart3, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Avg Speed', value: `${Math.round(collective.avg_time || 0)}m`, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Total Delays', value: collective.delayed || 0, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
        ].map((item, i) => (
          <div key={i} className={`p-4 rounded-2xl border border-slate-800 ${item.bg}`}>
            <item.icon size={18} className={`${item.color} mb-3`} />
            <p className="text-2xl font-bold text-slate-100">{item.value}</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Completion Rate Visualizer */}
      <div className="card bg-slate-800/20 border-slate-700/30">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-slate-200">Worker Efficiency</h4>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${completionRate > 80 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
            {completionRate > 80 ? 'High Performance' : 'Standard'}
          </span>
        </div>
        <div className="h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700 shadow-inner">
          <div 
            className={`h-full transition-all duration-1000 ease-out bg-gradient-to-r ${completionRate > 80 ? 'from-emerald-600 to-emerald-400' : 'from-amber-600 to-amber-400'}`}
            style={{ width: `${completionRate}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-slate-500 uppercase font-medium">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Daily & Weekly Section */}
        <div className="space-y-6">
          <div className="card">
            <h4 className="text-sm font-semibold mb-6 flex items-center gap-2"><TrendingUp size={16} className="text-blue-400" /> Daily Task Completion</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="date" tick={{fontSize: 9, fill: '#64748b'}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fontSize: 9, fill: '#64748b'}} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h4 className="text-sm font-semibold mb-6 flex items-center gap-2"><Calendar size={16} className="text-emerald-400" /> Monthly Performance Trend (Last 6 Months)</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="month" tick={{fontSize: 9, fill: '#64748b'}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fontSize: 9, fill: '#64748b'}} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', fontSize: '12px' }} />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} name="Tasks Completed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Activity Logs Section */}
        <div className="card flex flex-col">
          <h4 className="text-sm font-semibold mb-6 flex items-center gap-2"><History size={16} className="text-amber-400" /> Recent Activity Logs</h4>
          <div className="flex-1 space-y-4 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
            {activityLogs.length === 0 && <p className="text-center py-10 text-slate-500 text-xs italic">No activity recorded for this worker.</p>}
            {activityLogs.map((log, i) => (
              <div key={i} className="group relative pl-6 pb-4 border-l border-slate-700 last:border-0 last:pb-0">
                <div className="absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors" />
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">{log.action}</span>
                  <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-xs text-slate-200 font-medium">{log.task_title}</p>
                {log.note && <p className="text-[10px] text-slate-500 mt-1 italic italic">Note: {log.note}</p>}
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">End of Recent History</p>
          </div>
        </div>
      </div>
    </div>
  );
}
