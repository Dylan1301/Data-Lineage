import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    addEdge,
    Background,
    Controls,
    MiniMap,
    useReactFlow,
    ReactFlowProvider,
    MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TableNode from './TableNode';
import EdgeTooltip from './EdgeTooltip';
import NodeContextMenu from './NodeContextMenu';
import ExportButton from './ExportButton';
import toast from 'react-hot-toast';
import { getLayoutedElements } from '../utils/graphLayout';
import { reduceGraphEdges } from '../utils/graphReduction';
import useGraphHighlight from '../hooks/useGraphHighlight';

const nodeTypes = {
    tableNode: TableNode,
};

const LineageGraphContent = ({
    initialNodes,
    initialEdges,
    viewOptions = { showTable: true, showColumn: true },
    searchQuery = '',
    fileFilter = null,
    onColumnClick = null,
}) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { fitView, setCenter, getZoom } = useReactFlow();
    const graphRef = useRef(null);

    const [minimizedSourceNodes, setMinimizedSourceNodes] = useState(new Set());
    const { highlightedColumns, highlightedTables, highlightedEdges, onColumnHover, onColumnLeave } = useGraphHighlight(initialNodes, initialEdges);

    // Edge tooltip state
    const [edgeTooltip, setEdgeTooltip] = useState(null);

    // Context menu state
    const [contextMenu, setContextMenu] = useState(null);

    const onToggleMinimize = useCallback((nodeId) => {
        setMinimizedSourceNodes((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    }, []);

    // Edge hover handlers
    const onEdgeMouseEnter = useCallback((event, edge) => {
        const sourceNode = initialNodes.find(n => n.id === edge.source);
        const targetNode = initialNodes.find(n => n.id === edge.target);

        setEdgeTooltip({
            x: event.clientX,
            y: event.clientY,
            sourceLabel: sourceNode?.data?.label || edge.source,
            targetLabel: targetNode?.data?.label || edge.target,
            sourceHandle: edge.sourceHandle !== 'table-source' ? edge.sourceHandle?.split('.').pop() : null,
            targetHandle: edge.targetHandle !== 'table-target' ? edge.targetHandle?.split('.').pop() : null,
        });
    }, [initialNodes]);

    const onEdgeMouseLeave = useCallback(() => {
        setEdgeTooltip(null);
    }, []);

    // Node click to focus
    const onNodeClick = useCallback((event, node) => {
        setContextMenu(null); // close context menu on left click
        const zoom = Math.max(getZoom(), 1);
        setCenter(
            node.position.x + 110,
            node.position.y + 60,
            { zoom, duration: 500 }
        );
    }, [getZoom, setCenter]);

    // Context menu
    const onNodeContextMenu = useCallback((event, node) => {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, node });
    }, []);

    const onPaneClick = useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleFocusLineage = useCallback((nodeId) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            setCenter(node.position.x + 110, node.position.y + 60, { zoom: 1.2, duration: 500 });
        }
    }, [nodes, setCenter]);

    const handleCopyName = useCallback(() => {
        toast.success('Table name copied!', { duration: 1500 });
    }, []);

    // Search matching
    const searchMatchNodeIds = React.useMemo(() => {
        if (!searchQuery) return new Set();
        const q = searchQuery.toLowerCase();
        const matched = new Set();
        initialNodes.forEach(n => {
            if (n.data.label.toLowerCase().includes(q)) {
                matched.add(n.id);
            }
            if (n.data.columns.some(c => c.name.toLowerCase().includes(q))) {
                matched.add(n.id);
            }
        });
        return matched;
    }, [searchQuery, initialNodes]);

    const searchMatchColumnIds = React.useMemo(() => {
        if (!searchQuery) return new Set();
        const q = searchQuery.toLowerCase();
        const matched = new Set();
        initialNodes.forEach(n => {
            n.data.columns.forEach(c => {
                if (c.name.toLowerCase().includes(q)) {
                    matched.add(c.id);
                }
            });
        });
        return matched;
    }, [searchQuery, initialNodes]);

    // 1. Layout Effect: Handles structural changes (nodes, edges, view options)
    useEffect(() => {
        if (!initialNodes || initialNodes.length === 0) return;

        // Filter by file if active
        let filteredNodes = initialNodes;
        if (fileFilter) {
            filteredNodes = initialNodes.filter(n => n.data.file_name === fileFilter || n.data.table_node_type === 'table');
        }

        // Identify which nodes are visible based on minimize state
        const visibleNodes = filteredNodes.filter(node => {
            if (node.data.table_node_type === 'table') return true;
            if (node.data.is_first) return true;

            for (const minId of minimizedSourceNodes) {
                const minNode = filteredNodes.find(n => n.id === minId);
                if (minNode && minNode.data.file_name === node.data.file_name && minNode.id !== node.id) {
                    return false;
                }
            }
            return true;
        });

        const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

        const reducedEdges = reduceGraphEdges(initialEdges, visibleNodeIds);

        // 3. Process the reduced edges
        let processedEdges = [];
        const uniqueEdges = new Set();
        const columnConnectedTables = new Set();

        if (viewOptions.showColumn) {
            reducedEdges.forEach(edge => {
                if (edge.edge_type === "column_edge") {
                    const tableConnectionKey = `${edge.source}-${edge.target}`;
                    columnConnectedTables.add(tableConnectionKey);

                    processedEdges.push({
                        ...edge,
                        markerEnd: { type: MarkerType.ArrowClosed },
                        animated: true,
                        style: { stroke: '#f97316', strokeWidth: 2, opacity: 1 },
                        zIndex: 10,
                    });
                }
            });
        }

        if (viewOptions.showTable) {
            reducedEdges.forEach(edge => {
                if (edge.edge_type === "table_edge") {
                    const key = `table-${edge.source}-${edge.target}`;
                    const tableConnectionKey = `${edge.source}-${edge.target}`;

                    if (!uniqueEdges.has(key) && !columnConnectedTables.has(tableConnectionKey)) {
                        uniqueEdges.add(key);
                        processedEdges.push({
                            ...edge,
                            sourceHandle: 'table-source',
                            targetHandle: 'table-target',
                            markerEnd: { type: MarkerType.ArrowClosed },
                            animated: true,
                            style: { stroke: '#2563eb', strokeWidth: 2 },
                            zIndex: 5,
                        });
                    }
                }
            });
        }

        const finalEdges = processedEdges;

        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            visibleNodes,
            finalEdges
        );

        const initializedNodes = layoutedNodes.map(node => ({
            ...node,
            data: {
                ...node.data,
                highlightedColumns: new Set(),
                isHighlighted: false,
                isDimmed: false,
                isSearchMatch: false,
                isSearchActive: false,
                searchMatchColumns: new Set(),
                onColumnHover: onColumnHover,
                onColumnLeave: onColumnLeave,
                onColumnClick: onColumnClick,
                onToggleMinimize: onToggleMinimize,
                isMinimized: minimizedSourceNodes.has(node.id),
                id: node.id,
            }
        }));

        setNodes(initializedNodes);
        setEdges(layoutedEdges);

        // Smooth fit view
        setTimeout(() => fitView({ padding: 0.2, duration: 500 }), 50);

    }, [initialNodes, initialEdges, viewOptions, setNodes, setEdges, fitView, onColumnHover, onColumnLeave, onColumnClick, minimizedSourceNodes, fileFilter]);


    // 2. Highlight Effect
    useEffect(() => {
        setNodes((nds) =>
            nds.map((node) => {
                const isHighlighted = highlightedTables.has(node.id);
                const isDimmed = highlightedTables.size > 0 && !isHighlighted;
                const isSearchMatch = searchMatchNodeIds.has(node.id);
                const isSearchActive = searchQuery.length > 0;

                const nodeSearchMatchCols = new Set();
                if (isSearchActive) {
                    node.data.columns.forEach(c => {
                        if (searchMatchColumnIds.has(c.id)) {
                            nodeSearchMatchCols.add(c.id);
                        }
                    });
                }

                if (
                    node.data.isHighlighted === isHighlighted &&
                    node.data.isDimmed === isDimmed &&
                    node.data.highlightedColumns === highlightedColumns &&
                    node.data.isSearchMatch === isSearchMatch &&
                    node.data.isSearchActive === isSearchActive
                ) {
                    return node;
                }

                return {
                    ...node,
                    data: {
                        ...node.data,
                        highlightedColumns: highlightedColumns,
                        isHighlighted: isHighlighted,
                        isDimmed: isDimmed,
                        isSearchMatch: isSearchMatch,
                        isSearchActive: isSearchActive,
                        searchMatchColumns: nodeSearchMatchCols,
                    },
                };
            })
        );

        setEdges((eds) =>
            eds.map((edge) => {
                const isHighlighted = edge.originalEdgeIds
                    ? edge.originalEdgeIds.some(id => highlightedEdges.has(id))
                    : highlightedEdges.has(edge.id);
                const isDimmed = highlightedEdges.size > 0 && !isHighlighted;

                let newStyle = { ...edge.style };
                let newZIndex = edge.zIndex;

                if (isHighlighted) {
                    newStyle.stroke = '#a855f7';
                    newStyle.strokeWidth = 3;
                    newStyle.opacity = 1;
                    newZIndex = 20;
                } else if (isDimmed) {
                    newStyle.opacity = 0.2;
                    newStyle.strokeWidth = 2;
                    newZIndex = 5;
                } else {
                    newStyle.opacity = 1;
                    newStyle.strokeWidth = 2;
                    newStyle.stroke = edge.sourceHandle === 'table-source' ? '#2563eb' : '#f97316';
                    newZIndex = edge.sourceHandle === 'table-source' ? 5 : 10;
                }

                return {
                    ...edge,
                    style: newStyle,
                    zIndex: newZIndex,
                };
            })
        );
    }, [highlightedColumns, highlightedTables, highlightedEdges, setNodes, setEdges, minimizedSourceNodes, searchQuery, searchMatchNodeIds, searchMatchColumnIds]);

    const onConnect = useCallback(
        (params) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
        [setEdges],
    );

    return (
        <div ref={graphRef} style={{ width: '100%', height: '100%' }} className="relative">
            {/* Floating toolbar */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                <ExportButton graphRef={graphRef} />
            </div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                onEdgeMouseEnter={onEdgeMouseEnter}
                onEdgeMouseLeave={onEdgeMouseLeave}
                onNodeClick={onNodeClick}
                onNodeContextMenu={onNodeContextMenu}
                onPaneClick={onPaneClick}
                fitView
            >
                <Controls />
                <MiniMap />
                <Background variant="dots" gap={12} size={1} />
            </ReactFlow>

            {/* Edge Tooltip */}
            {edgeTooltip && <EdgeTooltip {...edgeTooltip} />}

            {/* Context Menu */}
            {contextMenu && (
                <NodeContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    node={contextMenu.node}
                    onClose={() => setContextMenu(null)}
                    onFocusLineage={handleFocusLineage}
                    onCopyName={handleCopyName}
                />
            )}
        </div>
    );
};

const LineageGraph = (props) => {
    return (
        <ReactFlowProvider>
            <LineageGraphContent {...props} />
        </ReactFlowProvider>
    )
}

export default LineageGraph;
