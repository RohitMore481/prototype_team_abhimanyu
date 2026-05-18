/**
 * WorkflowEditor.jsx
 * Miro-style visual workflow editor for production plan steps.
 * Features:
 *  - Draggable step nodes
 *  - SVG dependency arrows (click node port → click another → creates edge)
 *  - Add / delete steps
 *  - Delete dependency edges
 *  - Read-only mode (readonly prop)
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, X, Trash2, GitBranch, GripVertical, Sparkles, Clock } from 'lucide-react';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const PORT_R = 7;

function generateId() {
    return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function buildInitialLayout(steps) {
    if (!steps || steps.length === 0) return {};
    // Topological sort for left-to-right layout
    const positions = {};
    const deps = {};
    steps.forEach(s => {
        const id = s.id || s.taskId;
        if (id) deps[id] = s.dependsOn || [];
    });

    const col = {};
    function visit(id, depth) {
        if (!id) return;
        if (col[id] >= (depth || 0)) return;
        col[id] = depth || 0;
        steps
            .filter(s => (s.dependsOn || []).includes(id))
            .forEach(s => visit(s.id || s.taskId, (depth || 0) + 1));
    }
    steps.forEach(s => {
        const id = s.id || s.taskId;
        if (id && (!deps[id] || deps[id].length === 0)) visit(id, 0);
    });

    const byCol = {};
    steps.forEach(s => {
        const id = s.id || s.taskId;
        if (!id) return;
        const c = col[id] || 0;
        if (!byCol[c]) byCol[c] = [];
        byCol[c].push(id);
    });

    Object.entries(byCol).forEach(([c, ids]) => {
        ids.forEach((id, row) => {
            positions[id] = {
                x: 80 + (Number(c) || 0) * 260,
                y: 80 + (row || 0) * 120
            };
        });
    });

    return positions;
}

export default function WorkflowEditor({ steps: initialSteps = [], readonly = false, onChange }) {
    const [nodes, setNodes] = useState(() => initialSteps.map(s => ({
        id: s.id || s.taskId || generateId(),
        name: s.taskName || s.name || 'Step',
        duration: s.duration || s.avgMinutesPerUnit || 30,
        dependsOn: s.dependsOn || []
    })));

    const [positions, setPositions] = useState(() => buildInitialLayout(initialSteps));
    const [connecting, setConnecting] = useState(null); // { nodeId, x, y } - source point
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [hoveredPort, setHoveredPort] = useState(null); // { nodeId, type: 'in'|'out' }
    const [addingStep, setAddingStep] = useState(false);
    const [newStepForm, setNewStepForm] = useState({ name: '', duration: 30 });
    const [selectedEdge, setSelectedEdge] = useState(null); // {from, to}
    const [editingNode, setEditingNode] = useState(null); // nodeId
    const svgRef = useRef(null);
    const dragging = useRef(null);

    // Sync back to parent
    useEffect(() => {
        if (!onChange) return;
        const result = nodes.map(n => ({
            taskId: n.id,
            taskName: n.name,
            duration: n.duration,
            dependsOn: n.dependsOn
        }));
        onChange(result);
    }, [nodes]); // eslint-disable-line react-hooks/exhaustive-deps

    const startDrag = useCallback((e, nodeId) => {
        if (readonly) return;
        e.stopPropagation();
        dragging.current = { nodeId, startX: e.clientX, startY: e.clientY, origPos: { ...positions[nodeId] } };

        const onMove = (ev) => {
            if (!dragging.current) return;
            const dx = ev.clientX - dragging.current.startX;
            const dy = ev.clientY - dragging.current.startY;
            setPositions(prev => {
                if (!dragging.current) return prev;
                return {
                    ...prev,
                    [dragging.current.nodeId]: {
                        x: Math.max(0, dragging.current.origPos.x + dx),
                        y: Math.max(0, dragging.current.origPos.y + dy)
                    }
                };
            });
        };
        const onUp = () => {
            dragging.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [positions, readonly]);

    const startConnection = useCallback((e, nodeId) => {
        if (readonly) return;
        e.stopPropagation();
        const rect = svgRef.current.getBoundingClientRect();
        const startX = positions[nodeId].x + NODE_WIDTH;
        const startY = positions[nodeId].y + NODE_HEIGHT / 2;
        setConnecting({ nodeId, x: startX, y: startY });
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

        const onMove = (ev) => {
            const r = svgRef.current.getBoundingClientRect();
            setMousePos({ x: ev.clientX - r.left, y: ev.clientY - r.top });
        };

        const onUp = (ev) => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            setConnecting(null);
            setHoveredPort(null);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [positions, readonly]);

    const completeConnection = useCallback((nodeId) => {
        if (!connecting || connecting.nodeId === nodeId) return;

        // Add dependency: nodeId depends on connecting.nodeId
        setNodes(prev => prev.map(n =>
            n.id === nodeId
                ? { ...n, dependsOn: n.dependsOn.includes(connecting.nodeId) ? n.dependsOn : [...n.dependsOn, connecting.nodeId] }
                : n
        ));
        setConnecting(null);
    }, [connecting]);

    const deleteEdge = useCallback((from, to) => {
        setNodes(prev => prev.map(n =>
            n.id === to ? { ...n, dependsOn: n.dependsOn.filter(d => d !== from) } : n
        ));
        setSelectedEdge(null);
    }, []);

    const deleteNode = useCallback((nodeId) => {
        setNodes(prev => prev.filter(n => n.id !== nodeId).map(n => ({
            ...n, dependsOn: n.dependsOn.filter(d => d !== nodeId)
        })));
        setPositions(prev => { const p = { ...prev }; delete p[nodeId]; return p; });
    }, []);

    const addStep = () => {
        if (!newStepForm.name.trim()) return;
        const id = generateId();
        setNodes(prev => [...prev, { id, name: newStepForm.name, duration: Number(newStepForm.duration), dependsOn: [] }]);
        setPositions(prev => {
            const maxX = Math.max(80, ...Object.values(prev).map(p => p.x));
            return { ...prev, [id]: { x: maxX + 260, y: 80 } };
        });
        setNewStepForm({ name: '', duration: 30 });
        setAddingStep(false);
    };

    const updateNode = (id, fields) => {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, ...fields } : n));
    };

    // SVG dimensions
    const maxX = Math.max(1200, ...Object.values(positions).map(p => (p.x || 0) + NODE_WIDTH + 150));
    const maxY = Math.max(600, ...Object.values(positions).map(p => (p.y || 0) + NODE_HEIGHT + 150));

    const getBezierPath = (x1, y1, x2, y2) => {
        if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return 'M0,0';
        const dx = Math.abs(x2 - x1);
        const offset = Math.min(dx / 2, 100);
        return `M${x1},${y1} C${x1 + offset},${y1} ${x2 - offset},${y2} ${x2},${y2}`;
    };

    return (
        <div className="relative select-none" style={{ minHeight: 400 }}>
            {/* Toolbar */}
            {!readonly && (
                <div className="flex items-center gap-3 mb-3">
                    <button
                        onClick={() => setAddingStep(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 text-white text-sm font-bold rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
                    >
                        <Plus size={18} /> Add Step
                    </button>
                    {selectedEdge && (
                        <button
                            onClick={() => deleteEdge(selectedEdge.from, selectedEdge.to)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white text-sm font-bold rounded-2xl shadow-lg hover:bg-red-600 transition-all animate-slide-in"
                        >
                            <Trash2 size={16} /> Delete Selected Arrow
                        </button>
                    )}
                    <div className="ml-auto px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-100 dark:border-blue-800/50 flex items-center gap-2">
                        <Sparkles size={14} />
                        <span className="text-[11px] font-black uppercase tracking-widest">Miro Interaction: Drag from output to input</span>
                    </div>
                </div>
            )}

            {/* Add step form */}
            {addingStep && (
                <div className="mb-4 flex items-center gap-3 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl animate-slide-in">
                    <input
                        autoFocus
                        className="input h-12 text-base flex-1 rounded-xl"
                        placeholder="Step name (e.g. Quality Check)"
                        value={newStepForm.name}
                        onChange={e => setNewStepForm(f => ({ ...f, name: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && addStep()}
                    />
                    <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 border border-zinc-200 dark:border-zinc-700">
                        <Clock size={16} className="text-zinc-400 mr-2" />
                        <input
                            type="number" min={1}
                            className="bg-transparent h-12 text-sm w-20 outline-none font-bold"
                            placeholder="Min"
                            value={newStepForm.duration}
                            onChange={e => setNewStepForm(f => ({ ...f, duration: e.target.value }))}
                        />
                    </div>
                    <button onClick={addStep} className="btn-primary h-12 px-8 text-sm font-black shadow-lg">Create</button>
                    <button onClick={() => setAddingStep(false)} className="btn-secondary h-12 px-6 text-sm font-bold">Cancel</button>
                </div>
            )}

            {/* Canvas */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-950/50 shadow-inner overflow-auto custom-scrollbar" style={{ maxHeight: 'calc(100vh - 400px)' }}>
                <svg
                    ref={svgRef}
                    width={maxX}
                    height={maxY}
                    onClick={() => { setSelectedEdge(null); setEditingNode(null); }}
                    className="bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px]"
                >
                    <defs key="workflow-defs">
                        <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                            <path d="M0,0 L0,10 L10,5 z" fill="#3b82f6" />
                        </marker>
                        <marker id="arrow-selected" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                            <path d="M0,0 L0,10 L10,5 z" fill="#ef4444" />
                        </marker>
                        <marker id="arrow-ghost" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                            <path d="M0,0 L0,10 L10,5 z" fill="#94a3b8" />
                        </marker>
                    </defs>

                    {/* Edges */}
                    {nodes.flatMap(node =>
                        [...new Set(node.dependsOn || [])].map(depId => {
                            const from = positions[depId];
                            const to = positions[node.id];
                            if (!from || !to) return null;

                            const x1 = from.x + NODE_WIDTH;
                            const y1 = from.y + NODE_HEIGHT / 2;
                            const x2 = to.x;
                            const y2 = to.y + NODE_HEIGHT / 2;
                            const isSelected = selectedEdge?.from === depId && selectedEdge?.to === node.id;
                            const pathD = getBezierPath(x1, y1, x2, y2);

                            return (
                                <g key={`edge-${depId}-${node.id}`}>
                                    <path d={pathD} strokeWidth={15} stroke="transparent" fill="none"
                                        onClick={e => { e.stopPropagation(); setSelectedEdge({ from: depId, to: node.id }); }} style={{ cursor: 'pointer' }} />
                                    <path
                                        d={pathD}
                                        strokeWidth={isSelected ? 4 : 2.5}
                                        stroke={isSelected ? '#ef4444' : '#3b82f6'}
                                        fill="none"
                                        markerEnd={isSelected ? 'url(#arrow-selected)' : 'url(#arrow)'}
                                        className={isSelected ? '' : 'opacity-60 hover:opacity-100 transition-opacity duration-300'}
                                    />
                                </g>
                            );
                        }).filter(Boolean)
                    )}

                    {/* Ghost Edge (while connecting) */}
                    {connecting && (
                        <path
                            key="ghost-edge"
                            d={getBezierPath(connecting.x, connecting.y, mousePos.x, mousePos.y)}
                            strokeWidth={2.5}
                            stroke="#94a3b8"
                            strokeDasharray="5,5"
                            fill="none"
                            markerEnd="url(#arrow-ghost)"
                            style={{ pointerEvents: 'none' }}
                        />
                    )}

                    {/* Nodes */}
                    {nodes.map(node => {
                        const pos = positions[node.id] || { x: 80, y: 80 };
                        const isDepTarget = connecting && connecting.nodeId !== node.id;
                        const isHovered = hoveredPort?.nodeId === node.id;

                        return (
                            <g key={node.id} transform={`translate(${pos.x},${pos.y})`}>
                                {/* Node Shadow / Glow */}
                                <rect
                                    x={-4} y={-4} width={NODE_WIDTH + 8} height={NODE_HEIGHT + 8} rx={18}
                                    fill={isHovered ? 'rgba(59, 130, 246, 0.15)' : 'transparent'}
                                    className="transition-all duration-300"
                                />

                                {/* Node body */}
                                <rect
                                    x={0} y={0} width={NODE_WIDTH} height={NODE_HEIGHT}
                                    rx={16} ry={16}
                                    fill="white"
                                    stroke={isHovered ? '#3b82f6' : '#e4e4e7'}
                                    strokeWidth={isHovered ? 2.5 : 1}
                                    className="dark:fill-zinc-900 dark:stroke-zinc-800 transition-all duration-200"
                                    onMouseDown={e => startDrag(e, node.id)}
                                    style={{ cursor: readonly ? 'default' : 'grab shadow-sm' }}
                                />

                                {/* Step Header */}
                                <rect x={0} y={0} width={NODE_WIDTH} height={32} rx={16} fill="#f8fafc" className="dark:fill-zinc-800/50" clipPath="inset(0 0 16 0)" />

                                {/* Step name */}
                                <text
                                    x={16} y={18}
                                    fontSize={11} fontWeight="800" fill="#64748b"
                                    className="uppercase tracking-widest pointer-events-none"
                                >
                                    Step
                                </text>

                                <foreignObject x={10} y={35} width={NODE_WIDTH - 20} height={40}>
                                    <div className="w-full h-full flex items-center justify-center">
                                        {editingNode === node.id && !readonly ? (
                                            <input
                                                autoFocus
                                                className="w-full bg-blue-50 dark:bg-blue-900/30 border-none outline-none text-center text-sm font-black dark:text-white rounded-md"
                                                value={node.name}
                                                onChange={e => updateNode(node.id, { name: e.target.value })}
                                                onBlur={() => setEditingNode(null)}
                                                onKeyDown={e => e.key === 'Enter' && setEditingNode(null)}
                                            />
                                        ) : (
                                            <p
                                                onClick={(e) => { e.stopPropagation(); !readonly && setEditingNode(node.id); }}
                                                className="text-[13px] font-black text-zinc-900 dark:text-white text-center cursor-text hover:text-blue-500 transition-colors"
                                            >
                                                {node.name.length > 22 ? node.name.slice(0, 20) + '…' : node.name}
                                            </p>
                                        )}
                                    </div>
                                </foreignObject>

                                {/* Duration Badge */}
                                <g
                                    transform={`translate(${NODE_WIDTH - 60}, 8)`}
                                    onClick={(e) => { e.stopPropagation(); if (!readonly) { const d = prompt('Enter new duration (min):', node.duration); if (d) updateNode(node.id, { duration: Number(d) }); } }}
                                    className={readonly ? '' : 'cursor-pointer hover:scale-105 active:scale-95 transition-all'}
                                >
                                    <rect width={52} height={18} rx={9} fill="rgba(59, 130, 246, 0.1)" />
                                    <text x={26} y={10} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="900" fill="#3b82f6">
                                        {node.duration}m
                                    </text>
                                </g>

                                {/* Ports */}
                                {!readonly && (
                                    <>
                                        {/* Output Port (Right) */}
                                        <g
                                            onMouseDown={e => startConnection(e, node.id)}
                                            onMouseEnter={() => setHoveredPort({ nodeId: node.id, type: 'out' })}
                                            onMouseLeave={() => setHoveredPort(null)}
                                            style={{ cursor: 'crosshair' }}
                                        >
                                            <circle cx={NODE_WIDTH} cy={NODE_HEIGHT / 2} r={10} fill="transparent" />
                                            <circle
                                                cx={NODE_WIDTH} cy={NODE_HEIGHT / 2} r={PORT_R}
                                                fill={hoveredPort?.nodeId === node.id && hoveredPort?.type === 'out' ? '#3b82f6' : '#6366f1'}
                                                stroke="white" strokeWidth={2}
                                                className="transition-all duration-200 shadow-lg"
                                            />
                                        </g>

                                        {/* Input Port (Left) - Only active when connecting */}
                                        <g
                                            onMouseUp={() => completeConnection(node.id)}
                                            onMouseEnter={() => isDepTarget && setHoveredPort({ nodeId: node.id, type: 'in' })}
                                            onMouseLeave={() => setHoveredPort(null)}
                                            style={{ cursor: isDepTarget ? 'pointer' : 'default' }}
                                        >
                                            <circle cx={0} cy={NODE_HEIGHT / 2} r={12} fill="transparent" />
                                            {isDepTarget && (
                                                <circle
                                                    cx={0} cy={NODE_HEIGHT / 2} r={PORT_R + 2}
                                                    fill="#10b981" stroke="white" strokeWidth={2}
                                                    className="animate-pulse shadow-lg"
                                                />
                                            )}
                                        </g>
                                    </>
                                )}

                                {/* Delete Node (Top Right) */}
                                {!readonly && !connecting && (
                                    <g
                                        onClick={e => { e.stopPropagation(); deleteNode(node.id); }}
                                        className="opacity-0 hover:opacity-100 group-hover:opacity-100 cursor-pointer transition-opacity"
                                        transform={`translate(${NODE_WIDTH - 22}, -8)`}
                                    >
                                        <circle cx={8} cy={8} r={10} fill="#ef4444" />
                                        <text x={8} y={8} textAnchor="middle" dominantBaseline="middle" fontSize={12} fill="white" fontWeight="900">×</text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {nodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-base font-black uppercase tracking-widest opacity-40">
                        Drop Excel file or add steps to start
                    </div>
                )}
            </div>
        </div>
    );
}
