import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Handle,
    Position,
    useNodesState,
    useEdgesState,
    MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
    ArrowLeft, Calendar, Users, Cpu, Briefcase, Clock,
    CheckCircle, AlertCircle, AlertTriangle, ChevronDown, ChevronUp,
    Wrench, UserPlus, Play, Loader2, Save, Trash2, Edit2, X
} from 'lucide-react';

// Custom node colors map
const statusColors = {
    completed: 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300',
    in_progress: 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300',
    delayed: 'border-red-500 bg-red-50/50 dark:bg-red-950/20 text-red-800 dark:text-red-300',
    pending: 'border-zinc-300 bg-zinc-50/50 dark:bg-zinc-900/10 text-zinc-600 dark:text-zinc-400'
};

function SubAssemblyNode({ data }) {
    const borderClass = data.timeConstraintEnabled && data.onCriticalPath
        ? 'border-amber-500 border-2 shadow-lg shadow-amber-500/10'
        : (statusColors[data.status] || statusColors.pending);

    return (
        <div className={`p-4 rounded-2xl border bg-white dark:bg-zinc-950 shadow-md min-w-[210px] text-left transition-all ${borderClass}`}>
            <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-2 !h-2" />
            <div className="flex justify-between items-center">
                <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Sub-Assembly</span>
                {data.timeConstraintEnabled && data.onCriticalPath && (
                    <span className="text-[8px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-1 py-0.5 rounded animate-pulse">Critical Path</span>
                )}
            </div>
            <div className="font-bold text-xs truncate mt-0.5" title={data.label}>{data.label}</div>
            
            <div className="mt-3 space-y-1 text-[10px]">
                <div className="flex justify-between">
                    <span className="text-zinc-400">Worker:</span>
                    <span className="font-semibold truncate max-w-[100px] text-zinc-800 dark:text-zinc-200">{data.workerName}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-zinc-400">Planned:</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{data.plannedHours} hrs</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-zinc-400">Status:</span>
                    <span className="font-bold capitalize">{data.status.replace('_', ' ')}</span>
                </div>
                {data.timeConstraintEnabled && data.expectedCompletionDate && (
                    <>
                        <div className="flex justify-between">
                            <span className="text-zinc-400">Expected:</span>
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                                {new Date(data.expectedCompletionDate).toLocaleDateString()}
                            </span>
                        </div>
                        {data.delayDays > 0 && (
                            <div className="flex justify-between">
                                <span className="text-amber-600 font-bold">Delay:</span>
                                <span className="font-black text-amber-600">+{data.delayDays}d</span>
                            </div>
                        )}
                    </>
                )}
            </div>
            
            <div className="mt-3 flex items-center justify-between">
                <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5 overflow-hidden mr-2">
                    <div className="h-full bg-blue-500" style={{ width: `${data.progress}%` }} />
                </div>
                <span className="text-[9px] font-black text-blue-500 shrink-0">{data.progress}%</span>
            </div>
            
            <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-2 !h-2" />
        </div>
    );
}

const nodeTypes = {
    customSubAssembly: SubAssemblyNode
};

// Topological layout computation
const layoutNodes = (subassemblies, dependencies, timeConstraintEnabled) => {
    const adj = {};
    const inDegree = {};
    subassemblies.forEach(sa => {
        adj[sa.id] = [];
        inDegree[sa.id] = 0;
    });

    dependencies.forEach(dep => {
        if (adj[dep.source]) {
            adj[dep.source].push(dep.target);
            inDegree[dep.target] = (inDegree[dep.target] || 0) + 1;
        }
    });

    const queue = [];
    const level = {};
    subassemblies.forEach(sa => {
        if (inDegree[sa.id] === 0) {
            queue.push(sa.id);
            level[sa.id] = 0;
        }
    });

    while (queue.length > 0) {
        const u = queue.shift();
        const currentLevel = level[u];
        adj[u].forEach(v => {
            level[v] = Math.max(level[v] || 0, currentLevel + 1);
            queue.push(v);
        });
    }

    const levelCounts = {};
    return subassemblies.map(sa => {
        const lvl = level[sa.id] || 0;
        if (levelCounts[lvl] === undefined) {
            levelCounts[lvl] = 0;
        }
        const indexInLevel = levelCounts[lvl];
        levelCounts[lvl] += 1;

        return {
            id: sa.id,
            type: 'customSubAssembly',
            data: { 
                label: sa.name, 
                status: sa.executionStatus || sa.status || 'pending', 
                progress: sa.progress || 0,
                workerName: sa.workerName || 'Unassigned',
                plannedHours: sa.planned_hours || sa.plannedHours || 0,
                timeConstraintEnabled: timeConstraintEnabled,
                expectedCompletionDate: sa.expectedCompletionDate,
                delayDays: sa.delayDays || 0,
                onCriticalPath: sa.onCriticalPath || false
            },
            position: {
                x: lvl * 280 + 50,
                y: indexInLevel * 160 + 50
            }
        };
    });
};

export default function ProjectDetailsPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor';

    // State definitions
    const [project, setProject] = useState(null);
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('hierarchy'); // 'hierarchy' or 'graph'
    
    // Accordion expanded assemblies
    const [expandedAssemblies, setExpandedAssemblies] = useState({});
    
    // Selected SubAssembly for supervisor execution panel drawer
    const [selectedSubAssembly, setSelectedSubAssembly] = useState(null);
    const [editForm, setEditForm] = useState({
        assigned_worker_id: '',
        status: 'pending',
        progress: 0,
        delays: '',
        notes: ''
    });
    const [savingExecution, setSavingExecution] = useState(false);

    // Slide-over state for detailed views
    const [activeSlideOver, setActiveSlideOver] = useState(null);
    // Collapsible Insight Panel state
    const [insightExpanded, setInsightExpanded] = useState(false);
    const [selectedInsightCard, setSelectedInsightCard] = useState(null);

    // Reset selection when insight expanded toggles to false
    useEffect(() => {
        if (!insightExpanded) {
            setSelectedInsightCard(null);
        }
    }, [insightExpanded]);

    const [componentSearch, setComponentSearch] = useState('');
    const [componentStatusFilter, setComponentStatusFilter] = useState('all');

    const getSubAssemblyMaterialBadge = (sa) => {
        const comps = sa.components || [];
        if (comps.length === 0) {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20">
                    Materials: Ready
                </span>
            );
        }
        
        const total = comps.length;
        const arrived = comps.filter(c => c.status === 'arrived').length;
        const delayed = comps.filter(c => c.status === 'delayed').length;
        
        if (arrived === total) {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20">
                    Materials: Ready
                </span>
            );
        }
        
        if (delayed > 0) {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-50 text-red-750 dark:bg-red-950/20">
                    Materials: Delayed ({arrived}/{total} Arrived)
                </span>
            );
        }
        
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 dark:bg-amber-950/20">
                Materials: Pending ({arrived}/{total} Arrived)
            </span>
        );
    };

    const getAllProjectComponents = () => {
        const list = [];
        project?.assemblies?.forEach(asm => {
            asm.sub_assemblies?.forEach(sa => {
                sa.components?.forEach(c => {
                    list.push({
                        ...c,
                        subAssemblyName: sa.name,
                        assemblyName: asm.name
                    });
                });
            });
        });
        return list;
    };

    const filteredComponents = getAllProjectComponents().filter(c => {
        const matchesSearch = 
            c.name.toLowerCase().includes(componentSearch.toLowerCase()) ||
            (c.part_number && c.part_number.toLowerCase().includes(componentSearch.toLowerCase())) ||
            (c.supplier && c.supplier.toLowerCase().includes(componentSearch.toLowerCase())) ||
            c.subAssemblyName.toLowerCase().includes(componentSearch.toLowerCase());
            
        const matchesStatus = 
            componentStatusFilter === 'all' || 
            c.status?.toLowerCase() === componentStatusFilter.toLowerCase();
            
        return matchesSearch && matchesStatus;
    });

    // React Flow States
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Fetch data definitions
    const fetchProjectDetails = useCallback(async () => {
        try {
            const res = await api.get(`/projects/${id}`);
            setProject(res.data);
            
            // Auto expand first assembly
            if (res.data.assemblies?.length > 0) {
                setExpandedAssemblies(prev => {
                    if (Object.keys(prev).length === 0) {
                        return { [res.data.assemblies[0].id]: true };
                    }
                    return prev;
                });
            }
        } catch (err) {
            toast.error('Failed to load project structure');
            navigate('/projects');
        }
    }, [id, navigate]);

    const fetchGraphDetails = useCallback(async () => {
        try {
            const res = await api.get(`/projects/${id}/dependencies`);
            
            // Incorporate scheduling metrics from project if present
            const enrichedNodes = res.data.nodes.map(node => {
                let enriched = { ...node };
                if (project && project.assemblies) {
                    for (const a of project.assemblies) {
                        const found = a.sub_assemblies?.find(sa => sa.id === node.id);
                        if (found) {
                            enriched.expectedCompletionDate = found.expectedCompletionDate;
                            enriched.expectedStartDate = found.expectedStartDate;
                            enriched.delayDays = found.delayDays;
                            enriched.onCriticalPath = found.onCriticalPath;
                            break;
                        }
                    }
                }
                return enriched;
            });

            const timeConstraintEnabled = project ? project.time_constraint_enabled === 1 : false;
            const rfNodes = layoutNodes(enrichedNodes, res.data.edges, timeConstraintEnabled);
            const rfEdges = res.data.edges.map(e => ({
                ...e,
                id: `e-${e.source}-${e.target}`,
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 20,
                    height: 20,
                    color: e.type === 'custom' ? '#ff3b30' : '#3b82f6'
                },
                style: {
                    stroke: e.type === 'custom' ? '#ff3b30' : '#3b82f6',
                    strokeWidth: 2,
                    strokeDasharray: e.type === 'custom' ? '5,5' : '0'
                }
            }));
            setNodes(rfNodes);
            setEdges(rfEdges);
        } catch {
            toast.error('Failed to load dependency graph');
        }
    }, [id, project, setNodes, setEdges]);

    const [supervisors, setSupervisors] = useState([]);

    const fetchWorkersList = useCallback(async () => {
        try {
            const res = await api.get('/users/workers');
            setWorkers(res.data);
        } catch {}
    }, []);

    const fetchSupervisorsList = useCallback(async () => {
        try {
            const res = await api.get('/users/supervisors');
            setSupervisors(res.data);
        } catch {}
    }, []);

    useEffect(() => {
        const loadAll = async () => {
            setLoading(true);
            await Promise.all([fetchProjectDetails(), fetchWorkersList(), fetchSupervisorsList()]);
            setLoading(false);
        };
        loadAll();
    }, [fetchProjectDetails, fetchWorkersList, fetchSupervisorsList]);

    const handleAssignUser = async (userId) => {
        try {
            await api.post(`/projects/${id}/assign-user`, { userId });
            toast.success('Personnel assigned to project');
            fetchProjectDetails();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to assign personnel');
        }
    };

    const handleUnassignUser = async (userId) => {
        if (!window.confirm('Remove this user from the project? This will also clear their sub-assembly task assignments.')) return;
        try {
            await api.post(`/projects/${id}/unassign-user`, { userId });
            toast.success('Personnel unassigned from project');
            fetchProjectDetails();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to unassign personnel');
        }
    };

    useEffect(() => {
        if (activeTab === 'graph') {
            fetchGraphDetails();
        }
    }, [activeTab, fetchGraphDetails]);

    // Graph connection add override
    const onConnect = async (params) => {
        if (!isAdminOrSupervisor) return;
        if (params.source === params.target) {
            toast.error('Cannot connect a node to itself.');
            return;
        }

        try {
            await api.post(`/projects/${id}/dependencies`, {
                action: 'add',
                fromSubAssemblyId: params.source,
                toSubAssemblyId: params.target
            });
            toast.success('Custom dependency added');
            fetchGraphDetails();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to add dependency');
        }
    };

    // Graph connection remove override
    const onEdgeClick = async (event, edge) => {
        if (!isAdminOrSupervisor) return;
        const confirmDelete = window.confirm(`Remove dependency: ${edge.source} -> ${edge.target}?`);
        if (!confirmDelete) return;

        try {
            await api.post(`/projects/${id}/dependencies`, {
                action: 'remove',
                fromSubAssemblyId: edge.source,
                toSubAssemblyId: edge.target
            });
            toast.success('Dependency override stored');
            fetchGraphDetails();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to remove dependency');
        }
    };

    // Accordion toggles
    const toggleAssembly = (assemblyId) => {
        setExpandedAssemblies(p => ({
            ...p,
            [assemblyId]: !p[assemblyId]
        }));
    };

    // Selection of subassembly for supervisor edit drawer
    const openExecutionPanel = (sa) => {
        if (!isAdminOrSupervisor) return;
        setSelectedSubAssembly(sa);
        setEditForm({
            assigned_worker_id: sa.assigned_worker_id || '',
            status: sa.executionStatus || 'pending',
            progress: sa.progress || 0,
            delays: sa.delays || '',
            notes: sa.notes || ''
        });
    };

    // Save subassembly updates
    const handleSaveExecution = async (e) => {
        e.preventDefault();
        setSavingExecution(true);
        try {
            await api.put(`/projects/${id}/subassemblies/${selectedSubAssembly.id}`, editForm);
            toast.success('Sub-assembly execution updated');
            setSelectedSubAssembly(null);
            fetchProjectDetails();
            if (activeTab === 'graph') {
                fetchGraphDetails();
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update execution');
        } finally {
            setSavingExecution(false);
        }
    };

    // Calculate Material Readiness KPI metrics
    const getMaterialMetrics = () => {
        if (!project || !project.assemblies) return { arrived: 0, pending: 0, delayed: 0, hasRisk: false };
        let arrived = 0;
        let pending = 0;
        let delayed = 0;

        project.assemblies.forEach(asm => {
            asm.sub_assemblies?.forEach(sa => {
                sa.components?.forEach(comp => {
                    if (comp.status === 'arrived') arrived++;
                    else if (comp.status === 'pending') pending++;
                    else if (comp.status === 'delayed') delayed++;
                });
            });
        });

        return {
            arrived,
            pending,
            delayed,
            hasRisk: delayed > 0
        };
    };

    const materials = getMaterialMetrics();

    // Calculate real-time project metrics
    const getExecutionMetrics = () => {
        if (!project || !project.assemblies) return { total: 0, completed: 0, pending: 0, percentage: 0 };
        let total = 0;
        let completed = 0;
        let sumProgress = 0;

        project.assemblies.forEach(asm => {
            asm.sub_assemblies?.forEach(sa => {
                total++;
                if (sa.executionStatus === 'completed') {
                    completed++;
                }
                sumProgress += sa.progress || 0;
            });
        });

        const percentage = total > 0 ? Math.round(sumProgress / total) : 0;
        return {
            total,
            completed,
            pending: total - completed,
            percentage
        };
    };

    const execution = getExecutionMetrics();

    const handleToggleTimeConstraint = async () => {
        try {
            const newStatus = project.time_constraint_enabled === 1 ? 0 : 1;
            await api.put(`/projects/${id}/settings`, { timeConstraintEnabled: newStatus });
            toast.success(`Time constraint mode ${newStatus ? 'enabled' : 'disabled'}`);
            const res = await api.get(`/projects/${id}`);
            setProject(res.data);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update settings');
        }
    };

    const getInsightData = () => {
        const componentsAwaiting = [];
        const delayedComponents = [];
        const readySubassemblies = [];
        const blockedSubassemblies = [];

        project?.assemblies?.forEach(asm => {
            asm.sub_assemblies?.forEach(sa => {
                if (sa.executionStatus !== 'completed') {
                    if (sa.dependencyStatus === 'Ready') {
                        readySubassemblies.push(sa);
                    } else if (sa.dependencyStatus === 'Blocked') {
                        blockedSubassemblies.push(sa);
                    }
                }

                sa.components?.forEach(comp => {
                    if (comp.status !== 'arrived') {
                        componentsAwaiting.push({ ...comp, subAssemblyName: sa.name });
                        if (comp.status === 'delayed') {
                            delayedComponents.push({ ...comp, subAssemblyName: sa.name });
                        }
                    }
                });
            });
        });

        return {
            componentsAwaiting,
            delayedComponents,
            readySubassemblies,
            blockedSubassemblies
        };
    };

    const insightData = getInsightData();
    const isInsightWarning = insightData.delayedComponents.length > 0 || insightData.blockedSubassemblies.length > 0;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 size={40} className="text-blue-500 animate-spin mb-4" />
                <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Loading Project Cockpit...</p>
            </div>
        );
    }

    if (!project) return null;

    const availableSupervisors = supervisors.filter(s => !project.supervisors?.some(ps => ps.id === s.id));
    const availableWorkers = workers.filter(w => !project.workers?.some(pw => pw.id === w.id));

    return (
        <div className="space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-12 px-4">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/projects')} className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-zinc-500">
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black tracking-widest text-blue-500 uppercase bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-md border border-blue-100 dark:border-blue-500/20">
                                {project.odoo_id || `PROJ-${project.id}`}
                            </span>
                            <span className="text-[10px] font-black tracking-widest text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800">
                                {project.odoo_status || 'CONFIRMED'}
                            </span>
                        </div>
                        <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 mt-2">
                            {project.name}
                        </h1>
                        {project.customer && (
                            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mt-1">
                                Customer: <span className="text-zinc-800 dark:text-zinc-200 font-bold">{project.customer}</span>
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-6 bg-zinc-50 dark:bg-zinc-900 p-3 rounded-2xl border border-zinc-150 dark:border-zinc-800 shrink-0">
                    <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-blue-500" />
                        <div>
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Project Deadline</p>
                            <p className="text-xs font-black text-zinc-700 dark:text-zinc-200">{project.deadline ? new Date(project.deadline).toLocaleDateString() : 'N/A'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* KPI Cards & Readiness Warning */}
            <div className={`grid sm:grid-cols-2 ${project.time_constraint_enabled === 1 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
                <div className="card p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between min-h-[110px]">
                    <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Completion Status</span>
                        <Briefcase size={16} className="text-blue-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{execution.percentage}%</p>
                        <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden mt-2">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${execution.percentage}%` }} />
                        </div>
                    </div>
                </div>

                <div className="card p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between min-h-[110px]">
                    <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Sub-Assemblies Done</span>
                        <CheckCircle size={16} className="text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{execution.completed} / {execution.total}</p>
                        <p className="text-[10px] text-zinc-400 mt-1 font-bold">{execution.pending} pending sub-assemblies</p>
                    </div>
                </div>

                <div className="card p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between min-h-[110px]">
                    <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Material Logistics</span>
                        <Cpu size={16} className="text-zinc-500" />
                    </div>
                    <div>
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-2xl font-black text-zinc-900 dark:text-zinc-50">
                                    {(materials.arrived + materials.pending + materials.delayed) > 0 
                                        ? Math.round((materials.arrived / (materials.arrived + materials.pending + materials.delayed)) * 100) 
                                        : 100}%
                                </p>
                                <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">{materials.arrived} Arrived</p>
                            </div>
                            <div className="text-right pb-0.5">
                                <p className="text-xs font-bold text-zinc-500">{materials.pending} pend / {materials.delayed} dly</p>
                            </div>
                        </div>
                        <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden mt-2">
                            <div 
                                className="h-full bg-emerald-500 rounded-full" 
                                style={{ width: `${(materials.arrived + materials.pending + materials.delayed) > 0 
                                    ? Math.round((materials.arrived / (materials.arrived + materials.pending + materials.delayed)) * 100) 
                                    : 100}%` }} 
                            />
                        </div>
                    </div>
                </div>

                {materials.hasRisk ? (
                    <div className="card p-5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 flex flex-col justify-between min-h-[110px]">
                        <div className="flex justify-between items-start">
                            <span className="text-[10px] font-black uppercase text-red-500 tracking-wider">Supply Risk Alert</span>
                            <AlertTriangle size={18} className="text-red-500 animate-pulse" />
                        </div>
                        <div>
                            <p className="text-base font-black text-red-700 dark:text-red-400">⚠ Material Delay Risk</p>
                            <p className="text-[10px] text-red-500 mt-1 font-semibold">One or more critical components are flagged as DELAYED in mock Odoo.</p>
                        </div>
                    </div>
                ) : (
                    <div className="card p-5 bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-250 dark:border-emerald-900/20 flex flex-col justify-between min-h-[110px]">
                        <div className="flex justify-between items-start">
                            <span className="text-[10px] font-black uppercase text-emerald-500 tracking-wider">Supply Risk Status</span>
                            <CheckCircle size={16} className="text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-base font-black text-emerald-700 dark:text-emerald-400">Logistics Cleared</p>
                            <p className="text-[10px] text-emerald-500 mt-1 font-semibold">No delayed component alerts detected.</p>
                        </div>
                    </div>
                )}

                {project.time_constraint_enabled === 1 && project.forecast && (
                    <div className={`card p-5 border flex flex-col justify-between min-h-[110px] transition-all bg-amber-50 dark:bg-amber-950/10 ${project.forecast.isDelayed ? 'border-amber-250' : 'border-blue-150'}`}>
                        <div className="flex justify-between items-start">
                            <span className={`text-[10px] font-black uppercase tracking-wider ${project.forecast.isDelayed ? 'text-amber-600' : 'text-blue-500'}`}>Forecasted Completion</span>
                            <Clock size={16} className={project.forecast.isDelayed ? 'text-amber-500' : 'text-blue-500'} />
                        </div>
                        <div>
                            <p className="text-xl font-black text-zinc-905 dark:text-zinc-50">
                                {new Date(project.forecast.forecastCompletionDate).toLocaleDateString()}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                                    project.forecast.delayRisk === 'High' ? 'bg-red-100 text-red-800' :
                                    project.forecast.delayRisk === 'Medium' ? 'bg-amber-100 text-amber-850' : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                    Risk: {project.forecast.delayRisk}
                                </span>
                                {project.forecast.isDelayed && (
                                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">
                                        Delayed by {project.forecast.delayDaysTotal} days
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* COLLAPSIBLE PROJECT INSIGHT PANEL */}
            <div className="card p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm transition-all">
                <button
                    onClick={() => setInsightExpanded(!insightExpanded)}
                    className="w-full flex items-center justify-between text-left focus:outline-none"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-650 rounded-xl">
                            <Cpu size={18} />
                        </div>
                        <div>
                            <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-50">Project Insight Panel</h3>
                            <p className="text-[10px] text-zinc-400 font-medium">
                                {insightData.delayedComponents.length} delayed parts • {insightData.blockedSubassemblies.length} blocked subassemblies
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isInsightWarning && (
                            <span className="text-[9px] font-black uppercase bg-red-50 text-red-650 px-2 py-0.5 rounded border border-red-150 animate-pulse">
                                Bottlenecks Detected
                             </span>
                        )}
                        {insightExpanded ? <ChevronUp size={18} className="text-zinc-450" /> : <ChevronDown size={18} className="text-zinc-450" />}
                    </div>
                </button>

                {insightExpanded && (
                    <div className="mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-850 space-y-6 animate-fade-in text-xs">
                        {project.time_constraint_enabled === 1 && project.forecast && (
                            <div className="grid md:grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-55 dark:bg-zinc-900/30 border border-zinc-150 dark:border-zinc-800">
                                <div>
                                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-1">Material Arrival Timeline Delay Analysis</p>
                                    <p className="font-bold text-zinc-800 dark:text-zinc-200">{project.forecast.materialDelayImpact}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-1">Worker Capacity Delay Analysis</p>
                                    <p className="font-bold text-zinc-800 dark:text-zinc-200">{project.forecast.workerCapacityImpact}</p>
                                </div>
                            </div>
                        )}

                        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                            <div 
                                onClick={() => setSelectedInsightCard(selectedInsightCard === 'awaiting' ? null : 'awaiting')}
                                className={`p-4 rounded-xl border transition-all cursor-pointer select-none hover:shadow-md ${
                                    selectedInsightCard === 'awaiting' 
                                        ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-500/20' 
                                        : 'bg-zinc-50/50 dark:bg-zinc-900/10 border-zinc-150 dark:border-zinc-800 hover:border-blue-500/50'
                                }`}
                            >
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Awaiting Arrival</p>
                                <p className="text-lg font-black text-zinc-900 dark:text-zinc-50">{insightData.componentsAwaiting.length}</p>
                                <p className="text-[9px] text-zinc-400 font-semibold mt-1">Click to view pending materials</p>
                            </div>
                            <div 
                                onClick={() => setSelectedInsightCard(selectedInsightCard === 'delayed' ? null : 'delayed')}
                                className={`p-4 rounded-xl border transition-all cursor-pointer select-none hover:shadow-md ${
                                    selectedInsightCard === 'delayed' 
                                        ? 'border-red-500 bg-red-50/30 ring-2 ring-red-500/20' 
                                        : 'bg-zinc-50/50 dark:bg-zinc-900/10 border-zinc-150 dark:border-zinc-800 hover:border-red-500/50'
                                }`}
                            >
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Delayed Components</p>
                                <p className="text-lg font-black text-red-500">{insightData.delayedComponents.length}</p>
                                <p className="text-[9px] text-zinc-400 font-semibold mt-1">Click to view delayed parts</p>
                            </div>
                            <div 
                                onClick={() => setSelectedInsightCard(selectedInsightCard === 'ready' ? null : 'ready')}
                                className={`p-4 rounded-xl border transition-all cursor-pointer select-none hover:shadow-md ${
                                    selectedInsightCard === 'ready' 
                                        ? 'border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/20' 
                                        : 'bg-zinc-50/50 dark:bg-zinc-900/10 border-zinc-150 dark:border-zinc-800 hover:border-emerald-500/50'
                                }`}
                            >
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Ready Sub-assemblies</p>
                                <p className="text-lg font-black text-emerald-500">{insightData.readySubassemblies.length}</p>
                                <p className="text-[9px] text-zinc-400 font-semibold mt-1">Click to view ready tasks</p>
                            </div>
                            <div 
                                onClick={() => setSelectedInsightCard(selectedInsightCard === 'blocked' ? null : 'blocked')}
                                className={`p-4 rounded-xl border transition-all cursor-pointer select-none hover:shadow-md ${
                                    selectedInsightCard === 'blocked' 
                                        ? 'border-amber-500 bg-amber-50/30 ring-2 ring-amber-500/20' 
                                        : 'bg-zinc-50/50 dark:bg-zinc-900/10 border-zinc-150 dark:border-zinc-800 hover:border-amber-500/50'
                                }`}
                            >
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Blocked Sub-assemblies</p>
                                <p className="text-lg font-black text-amber-500">{insightData.blockedSubassemblies.length}</p>
                                <p className="text-[9px] text-zinc-400 font-semibold mt-1">Click to view blocked tasks</p>
                            </div>
                        </div>

                        {/* Dynamic Insight Card Details Table */}
                        {selectedInsightCard === 'awaiting' && (
                            <div className="space-y-2 animate-fade-in">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-black uppercase text-blue-500 tracking-wider">Awaiting Arrival Detail Log ({insightData.componentsAwaiting.length} components)</h4>
                                    <button 
                                        onClick={() => setSelectedInsightCard(null)} 
                                        className="text-[10px] text-zinc-400 hover:text-zinc-600 font-bold"
                                    >
                                        Close Details
                                    </button>
                                </div>
                                <div className="overflow-x-auto border border-zinc-150 dark:border-zinc-850 rounded-xl bg-white dark:bg-zinc-950">
                                    <table className="w-full text-left min-w-[700px]">
                                        <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-150 dark:border-zinc-850">
                                            <tr>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Part Number</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Name</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Supplier</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Sub-assembly</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300 text-center">Available / Required</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300 text-center">Expected Arrival</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300 text-center">Status</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300 text-center">Availability Bar</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                                            {insightData.componentsAwaiting.map(c => {
                                                const avail = c.available_quantity ?? 0;
                                                const req = c.required_quantity ?? c.quantity;
                                                const pct = req > 0 ? Math.round((avail / req) * 100) : 0;
                                                return (
                                                    <tr 
                                                        key={c.id} 
                                                        className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10 transition-colors cursor-pointer"
                                                        onClick={() => setActiveSlideOver({ type: 'component', data: c })}
                                                    >
                                                        <td className="p-3 font-mono font-bold text-zinc-800 dark:text-zinc-200">{c.part_number}</td>
                                                        <td className="p-3 text-zinc-700 dark:text-zinc-350 font-semibold">{c.name}</td>
                                                        <td className="p-3 text-zinc-600 dark:text-zinc-400">{c.supplier}</td>
                                                        <td className="p-3 text-zinc-600 dark:text-zinc-400">{c.subAssemblyName}</td>
                                                        <td className="p-3 text-center text-zinc-700 dark:text-zinc-300 font-bold">{avail} / {req}</td>
                                                        <td className="p-3 text-center text-zinc-500 font-medium">{c.expected_arrival || 'Immediate'}</td>
                                                        <td className="p-3 text-center">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                                                c.status === 'delayed' ? 'bg-red-50 text-red-750 dark:bg-red-950/20' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900'
                                                            }`}>
                                                                {c.status}
                                                            </span>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-2 justify-center">
                                                                <div className="w-16 bg-zinc-250 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                                                                </div>
                                                                <span className="text-[10px] font-bold text-zinc-500">{pct}%</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {selectedInsightCard === 'delayed' && (
                            <div className="space-y-2 animate-fade-in">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-black uppercase text-red-550 tracking-wider">Delayed Components Log ({insightData.delayedComponents.length} components)</h4>
                                    <button 
                                        onClick={() => setSelectedInsightCard(null)} 
                                        className="text-[10px] text-zinc-400 hover:text-zinc-650 font-bold"
                                    >
                                        Close Details
                                    </button>
                                </div>
                                <div className="overflow-x-auto border border-red-100 dark:border-red-950/30 rounded-xl bg-white dark:bg-zinc-950">
                                    <table className="w-full text-left min-w-[700px]">
                                        <thead className="bg-red-50/50 dark:bg-red-950/10 border-b border-red-100 dark:border-red-950/25">
                                            <tr>
                                                <th className="p-3 font-bold text-red-800 dark:text-red-300">Part Number</th>
                                                <th className="p-3 font-bold text-red-800 dark:text-red-300">Name</th>
                                                <th className="p-3 font-bold text-red-800 dark:text-red-300">Supplier</th>
                                                <th className="p-3 font-bold text-red-800 dark:text-red-300">Sub-assembly</th>
                                                <th className="p-3 font-bold text-red-800 dark:text-red-300 text-center">Available / Required</th>
                                                <th className="p-3 font-bold text-red-800 dark:text-red-300 text-center">Expected Arrival</th>
                                                <th className="p-3 font-bold text-red-800 dark:text-red-300 text-center">Status</th>
                                                <th className="p-3 font-bold text-red-800 dark:text-red-300 text-center">Availability Bar</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-red-100/50 dark:divide-red-950/20 bg-red-50/5">
                                            {insightData.delayedComponents.map(c => {
                                                const avail = c.available_quantity ?? 0;
                                                const req = c.required_quantity ?? c.quantity;
                                                const pct = req > 0 ? Math.round((avail / req) * 100) : 0;
                                                return (
                                                    <tr 
                                                        key={c.id} 
                                                        className="hover:bg-red-50/30 dark:hover:bg-red-950/10 transition-colors cursor-pointer"
                                                        onClick={() => setActiveSlideOver({ type: 'component', data: c })}
                                                    >
                                                        <td className="p-3 font-mono font-bold text-zinc-800 dark:text-zinc-200">{c.part_number}</td>
                                                        <td className="p-3 text-zinc-700 dark:text-zinc-350 font-semibold">{c.name}</td>
                                                        <td className="p-3 text-zinc-600 dark:text-zinc-400">{c.supplier}</td>
                                                        <td className="p-3 text-zinc-650 dark:text-zinc-400">{c.subAssemblyName}</td>
                                                        <td className="p-3 text-center text-zinc-700 dark:text-zinc-300 font-bold">{avail} / {req}</td>
                                                        <td className="p-3 text-center font-bold text-red-600 dark:text-red-400">{c.expected_arrival}</td>
                                                        <td className="p-3 text-center">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-red-50 text-red-700 dark:bg-red-950/20">
                                                                {c.status}
                                                            </span>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-2 justify-center">
                                                                <div className="w-16 bg-zinc-250 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-red-500" style={{ width: `${pct}%` }} />
                                                                </div>
                                                                <span className="text-[10px] font-bold text-zinc-500">{pct}%</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {selectedInsightCard === 'ready' && (
                            <div className="space-y-2 animate-fade-in">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-black uppercase text-emerald-600 tracking-wider">Ready Sub-assemblies Detail Log ({insightData.readySubassemblies.length} tasks)</h4>
                                    <button 
                                        onClick={() => setSelectedInsightCard(null)} 
                                        className="text-[10px] text-zinc-400 hover:text-zinc-600 font-bold"
                                    >
                                        Close Details
                                    </button>
                                </div>
                                <div className="overflow-x-auto border border-zinc-150 dark:border-zinc-850 rounded-xl bg-white dark:bg-zinc-950">
                                    <table className="w-full text-left min-w-[700px]">
                                        <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-150 dark:border-zinc-850">
                                            <tr>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Sub-assembly Name</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Drawing No</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Parent Assembly</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Worker</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300 text-center">Planned Hours</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300 text-center">Progress</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300 text-center">Material Status</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300 text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                                            {insightData.readySubassemblies.map(sa => {
                                                const parentAsmName = project.assemblies?.find(a => a.id === sa.assembly_id)?.name || 'N/A';
                                                return (
                                                    <tr 
                                                        key={sa.id} 
                                                        className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10 transition-colors cursor-pointer"
                                                        onClick={() => setActiveSlideOver({ type: 'subassembly', data: sa })}
                                                    >
                                                        <td className="p-3 font-bold text-zinc-800 dark:text-zinc-200">{sa.name}</td>
                                                        <td className="p-3 font-mono text-zinc-600 dark:text-zinc-400">{sa.drawing_no}</td>
                                                        <td className="p-3 text-zinc-600 dark:text-zinc-400">{parentAsmName}</td>
                                                        <td className="p-3 text-zinc-800 dark:text-zinc-200 font-semibold">{sa.workerName || 'Unassigned'}</td>
                                                        <td className="p-3 text-center font-semibold text-zinc-700 dark:text-zinc-300">{sa.planned_hours} hrs</td>
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-2 justify-center">
                                                                <div className="w-16 bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-blue-500" style={{ width: `${sa.progress || 0}%` }} />
                                                                </div>
                                                                <span className="text-[10px] font-bold text-zinc-500">{sa.progress || 0}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            {getSubAssemblyMaterialBadge(sa)}
                                                        </td>
                                                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                            {isAdminOrSupervisor && (
                                                                <button 
                                                                    onClick={() => openExecutionPanel(sa)}
                                                                    className="px-2.5 py-1 text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 rounded-md border border-blue-200 dark:border-blue-900/30 transition-all"
                                                                >
                                                                    Edit Execution
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {selectedInsightCard === 'blocked' && (
                            <div className="space-y-2 animate-fade-in">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-black uppercase text-amber-600 tracking-wider">Blocked Sub-assemblies Detail Log ({insightData.blockedSubassemblies.length} tasks)</h4>
                                    <button 
                                        onClick={() => setSelectedInsightCard(null)} 
                                        className="text-[10px] text-zinc-450 hover:text-zinc-650 font-bold"
                                    >
                                        Close Details
                                    </button>
                                </div>
                                <div className="overflow-x-auto border border-zinc-150 dark:border-zinc-850 rounded-xl bg-white dark:bg-zinc-950">
                                    <table className="w-full text-left min-w-[700px]">
                                        <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-150 dark:border-zinc-850">
                                            <tr>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Sub-assembly Name</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Drawing No</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Parent Assembly</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Worker</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300 text-center">Planned Hours</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300">Pending Dependencies</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300 text-center">Progress</th>
                                                <th className="p-3 font-bold text-zinc-700 dark:text-zinc-300 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                                            {insightData.blockedSubassemblies.map(sa => {
                                                const parentAsmName = project.assemblies?.find(a => a.id === sa.assembly_id)?.name || 'N/A';
                                                
                                                // Find unfinished prerequisite sub-assembly names
                                                const incompleteDeps = edges
                                                    .filter(e => e.target === sa.id)
                                                    .map(e => {
                                                        let name = e.source;
                                                        project.assemblies?.forEach(a => {
                                                            const found = a.sub_assemblies?.find(s => s.id === e.source);
                                                            if (found) name = found.name;
                                                        });
                                                        return name;
                                                    });

                                                return (
                                                    <tr 
                                                        key={sa.id} 
                                                        className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10 transition-colors cursor-pointer"
                                                        onClick={() => setActiveSlideOver({ type: 'subassembly', data: sa })}
                                                    >
                                                        <td className="p-3 font-bold text-zinc-800 dark:text-zinc-200">{sa.name}</td>
                                                        <td className="p-3 font-mono text-zinc-650 dark:text-zinc-400">{sa.drawing_no}</td>
                                                        <td className="p-3 text-zinc-650 dark:text-zinc-400">{parentAsmName}</td>
                                                        <td className="p-3 text-zinc-800 dark:text-zinc-200 font-semibold">{sa.workerName || 'Unassigned'}</td>
                                                        <td className="p-3 text-center font-semibold text-zinc-700 dark:text-zinc-300">{sa.planned_hours} hrs</td>
                                                        <td className="p-3">
                                                            <div className="flex flex-wrap gap-1">
                                                                {incompleteDeps.map((dName, idx) => (
                                                                    <span key={idx} className="bg-red-50 text-red-650 dark:bg-red-950/20 text-[9px] font-semibold px-2 py-0.5 rounded border border-red-150">
                                                                        {dName}
                                                                    </span>
                                                                ))}
                                                                {incompleteDeps.length === 0 && <span className="text-zinc-400 italic">None</span>}
                                                            </div>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-2 justify-center">
                                                                <div className="w-16 bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-blue-500" style={{ width: `${sa.progress || 0}%` }} />
                                                                </div>
                                                                <span className="text-[10px] font-bold text-zinc-500">{sa.progress || 0}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-50 text-red-700 dark:bg-red-950/20">
                                                                {sa.executionStatus || 'pending'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* TAB SELECTOR */}
            <div className="flex flex-wrap gap-2 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-2xl w-fit border border-zinc-200 dark:border-zinc-800">
                <button
                    onClick={() => setActiveTab('hierarchy')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'hierarchy' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                    Project Structure Hierarchy
                </button>
                <button
                    onClick={() => setActiveTab('components')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'components' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                    <Cpu size={14} /> All Components Inventory
                </button>
                <button
                    onClick={() => setActiveTab('graph')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'graph' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                    <Wrench size={14} /> Dependency Graph
                </button>
            </div>

            {/* PAGE CONTENTS */}
            <div className="grid lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-2 space-y-6">
                    {activeTab === 'hierarchy' && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Assemblies Hierarchy</h2>
                            {project.assemblies?.map(asm => {
                                const isExpanded = expandedAssemblies[asm.id];
                                const asmComponents = asm.sub_assemblies?.flatMap(sa => sa.components || []) || [];
                                const asmComponentsArrived = asmComponents.filter(c => c.status === 'arrived').length;
                                const asmComponentsTotal = asmComponents.length;
                                const asmArrivalPct = asmComponentsTotal > 0 ? Math.round((asmComponentsArrived / asmComponentsTotal) * 100) : 100;
                                return (
                                    <div key={asm.id} className="border border-zinc-200 dark:border-zinc-850 rounded-2xl overflow-hidden bg-white dark:bg-zinc-950 transition-all shadow-sm">
                                        <div className="w-full flex items-center justify-between p-5 bg-zinc-50/50 dark:bg-zinc-900/20 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-all border-b border-zinc-150 dark:border-zinc-850 text-left">
                                            <div className="flex-1 cursor-pointer" onClick={() => setActiveSlideOver({ type: 'assembly', data: asm })}>
                                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{asm.drawing_no || 'No drawing'}</p>
                                                <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-50 mt-0.5 hover:text-blue-500 transition-colors">{asm.name}</h3>
                                            </div>
                                            <div className="flex flex-col gap-1 min-w-[140px] max-w-[180px] mr-4 hidden sm:flex">
                                                <div className="flex justify-between items-center text-[9px] font-black text-zinc-400 uppercase tracking-wider">
                                                    <span>Material Arrival</span>
                                                    <span className="text-emerald-500 font-extrabold">{asmArrivalPct}%</span>
                                                </div>
                                                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${asmArrivalPct}%` }} />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-[10px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded">
                                                    {asm.sub_assemblies?.length || 0} Sub-assemblies
                                                </span>
                                                <button onClick={() => toggleAssembly(asm.id)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500">
                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </button>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="p-5 space-y-6 divide-y divide-zinc-100 dark:divide-zinc-850 animate-fade-in">
                                                {asm.sub_assemblies?.map(sa => (
                                                    <div key={sa.id} className="pt-5 first:pt-0">
                                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                                            <div className="flex-1 cursor-pointer" onClick={() => setActiveSlideOver({ type: 'subassembly', data: sa })}>
                                                                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{sa.drawing_no}</span>
                                                                <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 mt-0.5 flex items-center gap-2 hover:text-blue-500 transition-colors">
                                                                    {sa.name}
                                                                </h4>
                                                                
                                                                <div className="flex flex-wrap gap-2 mt-2">
                                                                    <span className="inline-flex items-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                                                                        Planned: {sa.planned_hours} hours
                                                                    </span>
                                                                    {getSubAssemblyMaterialBadge(sa)}
                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${sa.dependencyStatus === 'Ready' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : 'bg-red-50 text-red-700 dark:bg-red-950/20'}`}>
                                                                        Dependency: {sa.dependencyStatus}
                                                                    </span>
                                                                    {project.time_constraint_enabled === 1 && sa.expectedCompletionDate && (
                                                                        <span className="inline-flex items-center text-[10px] font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/20 px-2 py-0.5 rounded-full">
                                                                            Expected Comp: {new Date(sa.expectedCompletionDate).toLocaleDateString()}
                                                                        </span>
                                                                    )}
                                                                    {project.time_constraint_enabled === 1 && sa.delayDays > 0 && (
                                                                        <span className="inline-flex items-center text-[10px] font-black bg-amber-50 text-amber-700 dark:bg-amber-950/20 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                                                            ⚠ Delayed by {sa.delayDays} days
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-3 shrink-0">
                                                                {sa.workerName ? (
                                                                    <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 p-2 rounded-xl border border-zinc-150 dark:border-zinc-880">
                                                                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-[9px] text-white font-bold">W</div>
                                                                        <div>
                                                                            <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Worker Assigned</p>
                                                                            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate max-w-[80px]">{sa.workerName}</p>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 p-2 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
                                                                        <UserPlus size={14} className="text-zinc-400" />
                                                                        <span className="text-[10px] font-bold text-zinc-400">Unassigned</span>
                                                                    </div>
                                                                )}
                                                                
                                                                {isAdminOrSupervisor && (
                                                                    <button onClick={() => openExecutionPanel(sa)} className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:border-blue-500/50 transition-all text-zinc-500 hover:text-blue-500">
                                                                        <Edit2 size={14} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Status Bars Container */}
                                                        {(() => {
                                                            const saComponents = sa.components || [];
                                                            const saComponentsArrived = saComponents.filter(c => c.status === 'arrived').length;
                                                            const saComponentsTotal = saComponents.length;
                                                            const saArrivalPct = saComponentsTotal > 0 ? Math.round((saComponentsArrived / saComponentsTotal) * 100) : 100;
                                                            return (
                                                                <div className="mt-4 grid sm:grid-cols-2 gap-4 bg-zinc-50/50 dark:bg-zinc-900/10 p-3 rounded-xl border border-zinc-100 dark:border-zinc-850">
                                                                    {/* Execution Status Bar */}
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`w-2 h-2 rounded-full ${sa.executionStatus === 'completed' ? 'bg-emerald-500' : sa.executionStatus === 'in_progress' ? 'bg-blue-500' : sa.executionStatus === 'delayed' ? 'bg-red-500' : 'bg-zinc-300'}`} />
                                                                            <span className="text-xs font-black capitalize text-zinc-700 dark:text-zinc-300">Execution: {sa.executionStatus?.replace('_', ' ')}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-3 w-[50%]">
                                                                            <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                                                <div className="h-full bg-blue-500" style={{ width: `${sa.progress}%` }} />
                                                                            </div>
                                                                            <span className="text-xs font-bold text-zinc-500">{sa.progress}%</span>
                                                                        </div>
                                                                    </div>
                                                                    {/* Material Arrival Status Bar */}
                                                                    <div className="flex items-center justify-between border-t sm:border-t-0 sm:border-l border-zinc-150 dark:border-zinc-800 pt-2 sm:pt-0 sm:pl-4">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`w-2 h-2 rounded-full ${saArrivalPct === 100 ? 'bg-emerald-500' : saArrivalPct > 0 ? 'bg-amber-500' : 'bg-zinc-300'}`} />
                                                                            <span className="text-xs font-black text-zinc-700 dark:text-zinc-300">Material Arrival</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-3 w-[50%]">
                                                                            <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                                                <div className="h-full bg-emerald-500" style={{ width: `${saArrivalPct}%` }} />
                                                                            </div>
                                                                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{saArrivalPct}%</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Components Visibility list */}
                                                        {sa.components?.length > 0 && (
                                                            <div className="mt-4 overflow-x-auto border border-zinc-150 dark:border-zinc-850 rounded-xl bg-white dark:bg-zinc-950">
                                                                <table className="w-full text-left text-xs min-w-[550px]">
                                                                    <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-150 dark:border-zinc-850">
                                                                        <tr>
                                                                            <th className="p-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Part Number / Name</th>
                                                                            <th className="p-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-center">Available / Required</th>
                                                                            <th className="p-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Expected Arrival</th>
                                                                            <th className="p-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Current Status</th>
                                                                            <th className="p-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-center">Availability Bar</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                                                                        {sa.components.map(comp => {
                                                                            const avail = comp.available_quantity ?? 0;
                                                                            const req = comp.required_quantity ?? comp.quantity;
                                                                            const pct = req > 0 ? Math.round((avail / req) * 100) : 0;
                                                                            return (
                                                                                <tr key={comp.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10 transition-colors cursor-pointer" onClick={() => setActiveSlideOver({ type: 'component', data: comp })}>
                                                                                    <td className="p-3">
                                                                                        <p className="font-bold text-zinc-850 dark:text-zinc-200">{comp.name}</p>
                                                                                        <p className="font-mono text-[9px] text-zinc-400">{comp.part_number || 'N/A'}</p>
                                                                                    </td>
                                                                                    <td className="p-3 text-center font-bold text-zinc-700 dark:text-zinc-300">{avail} / {req}</td>
                                                                                    <td className="p-3 font-medium text-zinc-500">{comp.expected_arrival || 'Immediate'}</td>
                                                                                    <td className="p-3">
                                                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${comp.status === 'arrived' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : comp.status === 'delayed' ? 'bg-red-50 text-red-700 dark:bg-red-950/20' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900'}`}>
                                                                                            {comp.status}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="p-3">
                                                                                        <div className="flex items-center gap-2 justify-center">
                                                                                            <div className="w-16 bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                                                                <div className={`h-full ${comp.status === 'arrived' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                                                                                            </div>
                                                                                            <span className="text-[10px] font-bold text-zinc-500">{pct}%</span>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === 'components' && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 font-black">All Components Inventory</h2>
                                    <p className="text-xs text-zinc-500">Comprehensive list of parts across all assemblies & sub-assemblies.</p>
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Search parts, suppliers..."
                                        className="input text-xs py-1.5 px-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl w-[180px] sm:w-[220px]"
                                        value={componentSearch}
                                        onChange={e => setComponentSearch(e.target.value)}
                                    />
                                    <select
                                        className="input text-xs py-1.5 px-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                                        value={componentStatusFilter}
                                        onChange={e => setComponentStatusFilter(e.target.value)}
                                    >
                                        <option value="all">All Statuses</option>
                                        <option value="arrived">Arrived</option>
                                        <option value="pending">Pending</option>
                                        <option value="delayed">Delayed</option>
                                    </select>
                                </div>
                            </div>

                            <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-850 rounded-2xl bg-white dark:bg-zinc-950 shadow-sm font-sans">
                                <table className="w-full text-left text-xs min-w-[800px]">
                                    <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-850">
                                        <tr>
                                            <th className="p-4 font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest text-[10px]">Part Number</th>
                                            <th className="p-4 font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest text-[10px]">Component Name</th>
                                            <th className="p-4 font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest text-[10px]">Supplier</th>
                                            <th className="p-4 font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest text-[10px]">Sub-assembly / Assembly</th>
                                            <th className="p-4 font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest text-[10px] text-center">Available / Required</th>
                                            <th className="p-4 font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest text-[10px]">Expected Arrival</th>
                                            <th className="p-4 font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest text-[10px]">Status</th>
                                            <th className="p-4 font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest text-[10px] text-center">Availability Bar</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                                        {filteredComponents.map(c => {
                                            const avail = c.available_quantity ?? 0;
                                            const req = c.required_quantity ?? c.quantity;
                                            const pct = req > 0 ? Math.round((avail / req) * 100) : 0;
                                            return (
                                                <tr 
                                                    key={c.id} 
                                                    className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10 transition-colors cursor-pointer"
                                                    onClick={() => setActiveSlideOver({ type: 'component', data: c })}
                                                >
                                                    <td className="p-4 font-mono font-bold text-zinc-900 dark:text-zinc-100">{c.part_number}</td>
                                                    <td className="p-4 text-zinc-800 dark:text-zinc-200 font-semibold">{c.name}</td>
                                                    <td className="p-4 text-zinc-600 dark:text-zinc-400 font-medium">{c.supplier}</td>
                                                    <td className="p-4">
                                                        <p className="font-bold text-zinc-700 dark:text-zinc-300">{c.subAssemblyName}</p>
                                                        <p className="text-[10px] text-zinc-400 font-medium">{c.assemblyName}</p>
                                                    </td>
                                                    <td className="p-4 text-center text-zinc-800 dark:text-zinc-200 font-extrabold">{avail} / {req}</td>
                                                    <td className="p-4 text-zinc-500 font-medium">{c.expected_arrival || 'Immediate'}</td>
                                                    <td className="p-4">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                                            c.status === 'arrived' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' :
                                                            c.status === 'delayed' ? 'bg-red-50 text-red-700 dark:bg-red-950/20' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900'
                                                        }`}>
                                                            {c.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2 justify-center">
                                                            <div className="w-16 bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                                <div className={`h-full ${c.status === 'arrived' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-zinc-550">{pct}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filteredComponents.length === 0 && (
                                            <tr>
                                                <td colSpan={8} className="p-8 text-center text-zinc-400 font-medium italic">No components found matching search criteria.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'graph' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Dependency Graph (React Flow)</h2>
                                    <p className="text-xs text-zinc-500">Nodes = Subassemblies. Edges = Dependencies. Blue = Odoo, Red = Custom. Click edge to delete override.</p>
                                </div>
                                {isAdminOrSupervisor && (
                                    <span className="text-[10px] font-black uppercase text-blue-500 tracking-wider bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded border border-blue-100 dark:border-blue-500/20 animate-pulse">
                                        Graph Editable
                                    </span>
                                )}
                            </div>

                            <div className="h-[600px] w-full border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-950/20 shadow-inner">
                                <ReactFlow
                                    nodes={nodes}
                                    edges={edges}
                                    onNodesChange={onNodesChange}
                                    onEdgesChange={onEdgesChange}
                                    onConnect={onConnect}
                                    onEdgeClick={onEdgeClick}
                                    nodeTypes={nodeTypes}
                                    fitView
                                >
                                    <Background color="#cbd5e1" gap={16} size={1} />
                                    <Controls className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800" />
                                    <MiniMap nodeColor={() => '#e2e8f0'} />
                                </ReactFlow>
                            </div>
                        </div>
                    )}
                </div>

                {/* SUPERVISOR EXECUTION CONTROL PANEL */}
                <div className="space-y-6">
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Execution Cockpit</h2>
                    {selectedSubAssembly ? (
                        <form onSubmit={handleSaveExecution} className="card p-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-md space-y-6 animate-fade-in">
                            <div className="flex items-center justify-between border-b pb-3">
                                <div>
                                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{selectedSubAssembly.drawing_no}</p>
                                    <h3 className="font-bold text-sm text-zinc-800 dark:text-zinc-150">{selectedSubAssembly.name}</h3>
                                </div>
                                <button type="button" onClick={() => setSelectedSubAssembly(null)} className="text-xs font-bold text-zinc-400 hover:text-zinc-650">Cancel</button>
                            </div>

                            {/* Worker assignment */}
                            <div>
                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block mb-2">Assign Worker</label>
                                <select
                                    className="input text-zinc-800 dark:text-zinc-200 w-full"
                                    value={editForm.assigned_worker_id}
                                    onChange={e => setEditForm(p => ({ ...p, assigned_worker_id: e.target.value }))}
                                >
                                    <option value="">Unassigned</option>
                                    {workers.map(w => (
                                        <option key={w.id} value={w.id}>{w.name} ({w.status})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Progress slider */}
                            <div>
                                <div className="flex justify-between text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2">
                                    <span>Task Progress</span>
                                    <span className="text-blue-500 font-black">{editForm.progress}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    className="w-full accent-blue-500 cursor-pointer"
                                    value={editForm.progress}
                                    onChange={e => {
                                        const p = parseInt(e.target.value);
                                        setEditForm(prev => ({
                                            ...prev,
                                            progress: p,
                                            status: p === 100 ? 'completed' : p > 0 ? 'in_progress' : prev.status
                                        }));
                                    }}
                                />
                            </div>

                            {/* Status selection */}
                            <div>
                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block mb-2">Execution Status</label>
                                <select
                                    className="input text-zinc-800 dark:text-zinc-200 w-full"
                                    value={editForm.status}
                                    onChange={e => setEditForm(p => ({ ...p, status: e.target.value, progress: e.target.value === 'completed' ? 100 : p.progress }))}
                                >
                                    <option value="pending">Pending</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="delayed">Delayed / Blocked</option>
                                </select>
                            </div>

                            {/* Delay details */}
                            <div>
                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block mb-2">Delay Description (if blocked)</label>
                                <textarea
                                    className="input w-full resize-none text-zinc-800 dark:text-zinc-200"
                                    rows={2}
                                    value={editForm.delays}
                                    onChange={e => setEditForm(p => ({ ...p, delays: e.target.value }))}
                                    placeholder="Enter delay details..."
                                />
                            </div>

                            {/* Execution Notes */}
                            <div>
                                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block mb-2">Execution Notes</label>
                                <textarea
                                    className="input w-full resize-none text-zinc-800 dark:text-zinc-200"
                                    rows={3}
                                    value={editForm.notes}
                                    onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                                    placeholder="Additional fabrication instructions..."
                                />
                            </div>

                            <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={savingExecution}>
                                {savingExecution ? <Loader2 size={14} className="animate-spin mr-2" /> : <Save size={14} className="mr-2" />}
                                Commit Execution Update
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-6 animate-fade-in">
                            {/* Project Settings Control Toggle */}
                            {isAdminOrSupervisor && (
                                <div className="card p-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50">Time Constraint Mode</h3>
                                            <p className="text-[10px] text-zinc-400 font-medium">Toggle critical path scheduling & delay tracking.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleToggleTimeConstraint}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${project.time_constraint_enabled === 1 ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${project.time_constraint_enabled === 1 ? 'translate-x-6' : 'translate-x-1'}`}
                                            />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Project Team Assignments */}
                            <div className="card p-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-6">
                                <div className="border-b pb-3">
                                    <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                                        <Users size={18} className="text-blue-500" />
                                        Project Team Assignments
                                    </h3>
                                    <p className="text-[10px] text-zinc-400 font-medium">Manage project-wide personnel assignments.</p>
                                </div>

                                {/* Supervisors Section */}
                                <div className="space-y-3">
                                    <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Project Supervisors</h4>
                                    <div className="space-y-2">
                                        {project.supervisors?.map(s => (
                                            <div key={s.id} className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-150 dark:border-zinc-800 animate-fade-in">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{s.name}</p>
                                                    <p className="text-[9px] text-zinc-400 truncate">{s.email}</p>
                                                </div>
                                                {isAdminOrSupervisor && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUnassignUser(s.id)}
                                                        className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                                                        title="Remove from project"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {(!project.supervisors || project.supervisors.length === 0) && (
                                            <p className="text-xs text-zinc-400 italic py-2">No supervisors assigned to this project.</p>
                                        )}
                                    </div>

                                    {isAdminOrSupervisor && availableSupervisors.length > 0 && (
                                        <div className="flex gap-2 pt-1.5">
                                            <select
                                                className="input text-xs w-full py-1.5 px-2 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850"
                                                defaultValue=""
                                                onChange={async (e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        await handleAssignUser(Number(val));
                                                        e.target.value = "";
                                                    }
                                                }}
                                            >
                                                <option value="">+ Assign Supervisor...</option>
                                                {availableSupervisors.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* Workers Section */}
                                <div className="space-y-3">
                                    <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Project Workers</h4>
                                    <div className="space-y-2">
                                        {project.workers?.map(w => (
                                            <div key={w.id} className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-150 dark:border-zinc-800 animate-fade-in">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{w.name}</p>
                                                    <p className="text-[9px] text-zinc-450 uppercase tracking-wide font-semibold">{w.status}</p>
                                                </div>
                                                {isAdminOrSupervisor && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUnassignUser(w.id)}
                                                        className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                                                        title="Remove from project"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {(!project.workers || project.workers.length === 0) && (
                                            <p className="text-xs text-zinc-400 italic py-2">No workers assigned to this project.</p>
                                        )}
                                    </div>

                                    {isAdminOrSupervisor && availableWorkers.length > 0 && (
                                        <div className="flex gap-2 pt-1.5">
                                            <select
                                                className="input text-xs w-full py-1.5 px-2 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850"
                                                defaultValue=""
                                                onChange={async (e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        await handleAssignUser(Number(val));
                                                        e.target.value = "";
                                                    }
                                                }}
                                            >
                                                <option value="">+ Assign Worker...</option>
                                                {availableWorkers.map(w => (
                                                    <option key={w.id} value={w.id}>{w.name} ({w.status})</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* SLIDE OVER CONTAINER */}
            {activeSlideOver && (
                <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
                    <div className="absolute inset-0 overflow-hidden">
                        <div 
                            className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm transition-opacity" 
                            onClick={() => setActiveSlideOver(null)}
                        />

                        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
                            <div className="pointer-events-auto w-screen max-w-md transform transition-all duration-300 ease-in-out shadow-2xl bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800">
                                <div className="flex h-full flex-col overflow-y-scroll py-6 shadow-xl">
                                    <div className="px-6 flex items-center justify-between border-b pb-4 border-zinc-100 dark:border-zinc-900">
                                        <div>
                                            <span className="text-[9px] font-black tracking-widest text-zinc-400 uppercase">
                                                Odoo Metadata Slider
                                            </span>
                                            <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-50 capitalize" id="slide-over-title">
                                                {activeSlideOver.type} Details
                                            </h2>
                                        </div>
                                        <button
                                            type="button"
                                            className="rounded-xl p-2 text-zinc-400 hover:text-zinc-650 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all border border-zinc-200 dark:border-zinc-800"
                                            onClick={() => setActiveSlideOver(null)}
                                        >
                                            <span className="sr-only">Close panel</span>
                                            <X size={16} />
                                        </button>
                                    </div>
                                    
                                    <div className="relative mt-6 flex-1 px-6 space-y-6">
                                        {/* Assembly Details Slideover */}
                                        {activeSlideOver.type === 'assembly' && (() => {
                                            const asm = activeSlideOver.data;
                                            const subassemblies = asm.sub_assemblies || [];
                                            const total = subassemblies.length;
                                            const completed = subassemblies.filter(sa => sa.executionStatus === 'completed').length;
                                            const progressSum = subassemblies.reduce((sum, sa) => sum + (sa.progress || 0), 0);
                                            const progressPercent = total > 0 ? Math.round(progressSum / total) : 0;
                                            const status = progressPercent === 100 ? 'Completed' : progressPercent > 0 ? 'In Progress' : 'Pending';
                                            
                                            return (
                                                <div className="space-y-6 text-sm">
                                                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-150 dark:border-zinc-800 space-y-3">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Assembly Name</p>
                                                            <p className="font-bold text-zinc-900 dark:text-zinc-50">{asm.name}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Drawing No</p>
                                                            <p className="font-mono text-xs font-semibold text-zinc-705 dark:text-zinc-300">{asm.drawing_no || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Status</p>
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                                status === 'Completed' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : 
                                                                status === 'In Progress' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900'
                                                            }`}>
                                                                {status}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center text-xs font-bold text-zinc-500">
                                                            <span>Total Subassemblies</span>
                                                            <span>{completed} / {total} Completed</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-xs font-bold text-zinc-500 mt-2">
                                                            <span>Overall Completion</span>
                                                            <span className="text-blue-500">{progressPercent}%</span>
                                                        </div>
                                                        <div className="w-full bg-zinc-100 dark:bg-zinc-850 h-2 rounded-full overflow-hidden mt-1">
                                                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progressPercent}%` }} />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Included Sub-assemblies</h4>
                                                        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                                                            {subassemblies.map(sa => (
                                                                <div key={sa.id} className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-150 dark:border-zinc-800 text-xs">
                                                                    <div>
                                                                        <p className="font-bold text-zinc-800 dark:text-zinc-200">{sa.name}</p>
                                                                        <p className="text-[9px] text-zinc-400 font-semibold">{sa.drawing_no}</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded capitalize ${
                                                                            sa.executionStatus === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                                                                            sa.executionStatus === 'in_progress' ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-700'
                                                                        }`}>
                                                                            {sa.executionStatus || 'pending'}
                                                                        </span>
                                                                        <p className="text-[10px] text-zinc-450 mt-1 font-semibold">{sa.progress}%</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* SubAssembly Details Slideover */}
                                        {activeSlideOver.type === 'subassembly' && (() => {
                                            const sa = activeSlideOver.data;
                                            const parentAsmName = project.assemblies?.find(a => a.id === sa.assembly_id)?.name || 'N/A';
                                            
                                            // Fetch dependencies
                                            const prerequisites = edges
                                                .filter(e => e.target === sa.id)
                                                .map(e => {
                                                    let name = e.source;
                                                    project.assemblies?.forEach(a => {
                                                        const match = a.sub_assemblies?.find(s => s.id === e.source);
                                                        if (match) name = match.name;
                                                    });
                                                    return { id: e.source, name };
                                                });

                                            const successors = edges
                                                .filter(e => e.source === sa.id)
                                                .map(e => {
                                                    let name = e.target;
                                                    project.assemblies?.forEach(a => {
                                                        const match = a.sub_assemblies?.find(s => s.id === e.target);
                                                        if (match) name = match.name;
                                                    });
                                                    return { id: e.target, name };
                                                });

                                            return (
                                                <div className="space-y-6 text-sm">
                                                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-150 dark:border-zinc-800 space-y-3">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Sub-assembly Name</p>
                                                            <p className="font-bold text-zinc-900 dark:text-zinc-50">{sa.name}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Drawing No</p>
                                                            <p className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">{sa.drawing_no}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Parent Assembly</p>
                                                            <p className="font-semibold text-zinc-700 dark:text-zinc-300">{parentAsmName}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Planned Duration</p>
                                                            <p className="font-bold text-zinc-800 dark:text-zinc-200">{sa.planned_hours} hours</p>
                                                        </div>
                                                    </div>

                                                    <div className="p-4 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/10 border border-zinc-150 dark:border-zinc-800 space-y-3">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Execution Status</p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className={`w-2.5 h-2.5 rounded-full ${
                                                                    sa.executionStatus === 'completed' ? 'bg-emerald-500' :
                                                                    sa.executionStatus === 'in_progress' ? 'bg-blue-500' :
                                                                    sa.executionStatus === 'delayed' ? 'bg-red-500' : 'bg-zinc-300'
                                                                }`} />
                                                                <span className="font-bold capitalize text-zinc-800 dark:text-zinc-200">
                                                                    {sa.executionStatus?.replace('_', ' ') || 'pending'} ({sa.progress || 0}%)
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {sa.workerName && (
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Assigned Worker</p>
                                                                <p className="font-bold text-zinc-800 dark:text-zinc-200">{sa.workerName}</p>
                                                            </div>
                                                        )}
                                                        {sa.notes && (
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Execution Notes</p>
                                                                <p className="text-xs text-zinc-650 dark:text-zinc-350 bg-white dark:bg-zinc-950 p-2 rounded-lg border border-zinc-100 dark:border-zinc-900 mt-1 whitespace-pre-wrap">{sa.notes}</p>
                                                            </div>
                                                        )}
                                                        {sa.delays && (
                                                            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-150 dark:border-red-900/35 rounded-xl">
                                                                <p className="text-[10px] font-black uppercase text-red-500 tracking-wider">Blocker / Delay details</p>
                                                                <p className="text-xs text-red-700 dark:text-red-400 mt-1 whitespace-pre-wrap">{sa.delays}</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {project.time_constraint_enabled === 1 && sa.expectedCompletionDate && (
                                                        <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/10 border border-blue-150 dark:border-blue-900/20 space-y-2">
                                                            <h4 className="text-[10px] font-black uppercase text-blue-500 tracking-wider">Scheduling Calculations</h4>
                                                            <div className="grid grid-cols-2 gap-4 text-xs">
                                                                <div>
                                                                    <span className="text-zinc-400 block font-semibold">Forecast Start:</span>
                                                                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                                                                        {new Date(sa.expectedStartDate).toLocaleDateString()}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-zinc-400 block font-semibold">Forecast End:</span>
                                                                    <span className="font-bold text-blue-600 dark:text-blue-400">
                                                                        {new Date(sa.expectedCompletionDate).toLocaleDateString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {sa.delayDays > 0 && (
                                                                <div className="pt-2 border-t border-blue-100 dark:border-blue-900/30 flex justify-between items-center text-xs">
                                                                    <span className="text-amber-600 font-bold">Incurred Delay:</span>
                                                                    <span className="font-black text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 rounded">
                                                                        +{sa.delayDays} days
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-4 text-xs">
                                                        <div className="space-y-2">
                                                            <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Prerequisite Tasks</h4>
                                                            <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                                                {prerequisites.map(p => (
                                                                    <div key={p.id} className="p-2 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-850 text-[11px] font-medium truncate" title={p.name}>
                                                                        {p.name}
                                                                    </div>
                                                                ))}
                                                                {prerequisites.length === 0 && <p className="text-[11px] text-zinc-400 italic">None (Root node)</p>}
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Successor Tasks</h4>
                                                            <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                                                {successors.map(s => (
                                                                    <div key={s.id} className="p-2 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-850 text-[11px] font-medium truncate" title={s.name}>
                                                                        {s.name}
                                                                    </div>
                                                                ))}
                                                                {successors.length === 0 && <p className="text-[11px] text-zinc-400 italic">None (Leaf node)</p>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Component Details Slideover */}
                                        {activeSlideOver.type === 'component' && (() => {
                                            const comp = activeSlideOver.data;
                                            const expected = comp.expected_arrival ? new Date(comp.expected_arrival) : null;
                                            const actual = comp.actual_arrival ? new Date(comp.actual_arrival) : null;
                                            const status = comp.inventory_status || comp.status;
                                            
                                            let delayDays = 0;
                                            let delayText = '';
                                            let timelineColor = 'bg-blue-500';
                                            let delayColor = 'text-zinc-550';
                                            
                                            if (status === 'arrived') {
                                                if (expected && actual) {
                                                    const diff = actual - expected;
                                                    if (diff > 0) {
                                                        delayDays = Math.max(0, Math.round(diff / (24 * 60 * 60 * 1000)));
                                                        delayText = `Delayed by ${delayDays} days`;
                                                        timelineColor = 'bg-red-500';
                                                        delayColor = 'text-red-500 font-black';
                                                    } else {
                                                        delayText = 'Arrived on-time';
                                                        timelineColor = 'bg-emerald-500';
                                                        delayColor = 'text-emerald-600 font-bold';
                                                    }
                                                } else {
                                                    delayText = 'Arrived';
                                                    timelineColor = 'bg-emerald-500';
                                                    delayColor = 'text-emerald-600 font-bold';
                                                }
                                            } else {
                                                const now = new Date();
                                                if (expected) {
                                                    if (expected < now) {
                                                        delayDays = Math.max(0, Math.round((now - expected) / (24 * 60 * 60 * 1000)));
                                                        delayText = `Delayed by ${delayDays} days`;
                                                        timelineColor = 'bg-red-500';
                                                        delayColor = 'text-red-500 font-black';
                                                    } else {
                                                        const daysLeft = Math.round((expected - now) / (24 * 60 * 60 * 1000));
                                                        delayText = `Expected in ${daysLeft} days`;
                                                        timelineColor = 'bg-blue-500';
                                                        delayColor = 'text-blue-600 font-bold';
                                                    }
                                                } else {
                                                    delayText = 'Awaiting Status';
                                                }
                                            }

                                            return (
                                                <div className="space-y-6 text-sm">
                                                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-150 dark:border-zinc-800 space-y-3">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Part Number</p>
                                                            <p className="font-mono font-bold text-zinc-800 dark:text-zinc-200">{comp.part_number || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Component Name</p>
                                                            <p className="font-bold text-zinc-900 dark:text-zinc-50">{comp.name}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Supplier</p>
                                                            <p className="font-semibold text-zinc-700 dark:text-zinc-300">{comp.supplier || 'N/A'}</p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4 text-xs p-4 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/10 border border-zinc-150 dark:border-zinc-800">
                                                        <div>
                                                            <span className="text-zinc-400 block font-semibold">Required Qty:</span>
                                                            <span className="font-black text-lg text-zinc-800 dark:text-zinc-200">
                                                                {comp.required_quantity ?? comp.quantity}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className="text-zinc-400 block font-semibold">Available Qty:</span>
                                                            <span className={`font-black text-lg ${
                                                                (comp.available_quantity ?? 0) >= (comp.required_quantity ?? comp.quantity) 
                                                                    ? 'text-emerald-500' : 'text-amber-500'
                                                            }`}>
                                                                {comp.available_quantity ?? (comp.status === 'arrived' ? comp.quantity : 0)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4">
                                                        <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Material Arrival Timeline</h4>
                                                        
                                                        <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-zinc-200 dark:before:bg-zinc-800">
                                                            <div className="relative flex gap-3 text-xs">
                                                                <div className="absolute -left-[19px] w-3 h-3 rounded-full bg-emerald-500 border border-white dark:border-zinc-950" />
                                                                <div>
                                                                    <p className="font-bold text-zinc-800 dark:text-zinc-200">Component Ordered</p>
                                                                    <p className="text-[10px] text-zinc-400 font-semibold">Mock Odoo PO Confirmed</p>
                                                                </div>
                                                            </div>

                                                            <div className="relative flex gap-3 text-xs">
                                                                <div className="absolute -left-[19px] w-3 h-3 rounded-full bg-blue-500 border border-white dark:border-zinc-950" />
                                                                <div>
                                                                    <p className="font-bold text-zinc-800 dark:text-zinc-200">Expected Arrival Date</p>
                                                                    <p className="text-[10px] text-zinc-400 font-semibold">
                                                                        {expected ? expected.toLocaleDateString() : 'N/A'}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="relative flex gap-3 text-xs">
                                                                <div className={`absolute -left-[19px] w-3 h-3 rounded-full ${timelineColor} border border-white dark:border-zinc-950`} />
                                                                <div>
                                                                    <p className="font-bold text-zinc-800 dark:text-zinc-200">Logistics Arrival Status</p>
                                                                    <p className="text-[10px] text-zinc-400 font-semibold">
                                                                        Actual: {actual ? actual.toLocaleDateString() : 'Not Arrived Yet'}
                                                                    </p>
                                                                    <p className={`text-[10px] mt-1 uppercase tracking-wider ${delayColor}`}>
                                                                        {delayText}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
