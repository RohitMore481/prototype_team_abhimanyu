import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import { 
  LayoutDashboard, User, ShieldCheck, Play, 
  CheckCircle, AlertCircle, Clock, Activity, Box
} from 'lucide-react';

// --- Shared Components ---

const Sidebar = ({ currentRole, setRole }) => (
  <aside className="w-64 glass-sidebar h-screen sticky top-0 p-6 flex flex-col">
    <div className="mb-10 flex items-center gap-3 px-2">
      <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/40">S</div>
      <h2 className="text-xl font-bold tracking-tight text-slate-800">SmartFlow</h2>
    </div>
    <nav className="flex-1 space-y-2">
      {[
        { id: 'worker', icon: <User size={18}/>, label: 'Worker' },
        { id: 'supervisor', icon: <ShieldCheck size={18}/>, label: 'Supervisor' },
        { id: 'manager', icon: <LayoutDashboard size={18}/>, label: 'Manager' }
      ].map(item => (
        <button
          key={item.id}
          onClick={() => setRole(item.id)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all capitalize ${
            currentRole === item.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 hover:bg-white/40'
          }`}
        >
          {item.icon} {item.label}
        </button>
      ))}
    </nav>
  </aside>
);

const StatCard = ({ label, value, icon, color }) => (
  <div className="glass-card p-6 rounded-3xl flex items-center gap-5">
    <div className={`p-4 rounded-2xl bg-${color}-500/10 text-${color}-600`}>{icon}</div>
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-black text-slate-800">{value}</p>
    </div>
  </div>
);

// --- Role-Specific Dashboards ---

const WorkerDash = () => {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    const res = await api.getJobs();
    setJobs(res.data);
  };

  const toggleJob = async (id, currentStatus) => {
    if (currentStatus === 'running') await api.completeJob(id);
    else await api.startJob(id);
    loadJobs();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {jobs.map(job => (
        <div key={job.id} className="glass-card p-6 rounded-[2rem] hover:scale-[1.01] transition-transform">
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1 block">Station B-04</span>
              <h3 className="text-xl font-bold text-slate-800">{job.type || 'Production Batch'}</h3>
            </div>
            <span className={`px-4 py-1 rounded-full text-xs font-bold ${
              job.status === 'running' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-600'
            }`}>
              {job.status || 'idle'}
            </span>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-slate-500 flex items-center gap-1"><Box size={14}/> Input: {job.input || 0}</span>
              <span className="text-slate-500 flex items-center gap-1"><Activity size={14}/> Output: {job.output || 0}</span>
            </div>
            <div className="w-full bg-slate-200/50 h-2 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: '65%' }}></div>
            </div>
          </div>

          <button
            onClick={() => toggleJob(job.id, job.status)}
            className={`w-full glass-button ${
              job.status === 'running' 
                ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
            }`}
          >
            {job.status === 'running' ? <><CheckCircle size={20}/> Complete Job</> : <><Play size={20}/> Start Shift</>}
          </button>
        </div>
      ))}
    </div>
  );
};

const ManagerDash = () => (
  <div className="space-y-8">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <StatCard label="Live Jobs" value="12" icon={<Activity/>} color="blue" />
      <StatCard label="OEE Score" value="84.2%" icon={<ShieldCheck/>} color="emerald" />
      <StatCard label="Downtime" value="14m" icon={<Clock/>} color="amber" />
    </div>
    <div className="glass-card p-8 rounded-[2rem]">
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-xl font-bold text-slate-800">Efficiency Trends</h3>
        <button className="text-sm font-bold text-blue-600">Export PDF</button>
      </div>
      <div className="h-64 flex items-end gap-3 px-2">
        {[45, 60, 40, 85, 70, 90, 80].map((val, i) => (
          <div key={i} className="flex-1 bg-gradient-to-t from-blue-600/20 to-blue-600/60 rounded-xl hover:to-blue-600 transition-all cursor-pointer relative group" style={{ height: `${val}%` }}>
             <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">{val}%</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-4 text-[10px] font-black text-slate-400 px-2 tracking-widest">
        <span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span>
      </div>
    </div>
  </div>
);

// --- Main App Entry ---

export default function App() {
  const [role, setRole] = useState('worker');

  return (
    <div className="flex">
      <Sidebar currentRole={role} setRole={setRole} />
      <main className="flex-1 p-10 max-w-7xl mx-auto">
        <header className="mb-12">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">System Online • Branch-01</span>
          </div>
          <h1 className="text-4xl font-black text-slate-800 capitalize tracking-tight">{role} Console</h1>
        </header>

        {role === 'worker' && <WorkerDash />}
        {role === 'manager' && <ManagerDash />}
        {role === 'supervisor' && (
          <div className="glass-card p-20 rounded-[3rem] text-center max-w-2xl mx-auto">
            <div className="w-20 h-20 bg-blue-500/10 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <ShieldCheck size={40}/>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Awaiting Approvals</h2>
            <p className="text-slate-500 font-medium">All shop-floor assignments are currently up to date.</p>
          </div>
        )}
      </main>
    </div>
  );
}