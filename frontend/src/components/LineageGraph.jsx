import React, { useCallback, useEffect } from 'react';
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
import dagre from 'dagre';
import TableNode from './TableNode';

const nodeTypes = {
    tableNode: TableNode,
};

const getLayoutedElements = (nodes, edges, direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const nodeWidth = 220;
    const nodeHeight = 36; // Base height, usually varies by content

    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
        // Estimating height based on columns for better layout
        const height = 40 + (node.data.columns.length * 24);
        dagreGraph.setNode(node.id, { width: nodeWidth, height: height });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            targetPosition: 'left',
            sourcePosition: 'right',
            position: {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeWithPosition.height / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
};

const LineageGraphContent = ({ initialNodes, initialEdges, viewOptions = { showTable: true, showColumn: true } }) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { fitView } = useReactFlow();

    const [highlightedColumns, setHighlightedColumns] = React.useState(new Set());
    const [highlightedTables, setHighlightedTables] = React.useState(new Set());
    const [highlightedEdges, setHighlightedEdges] = React.useState(new Set());

    // Helper to find connected columns and edges
    const findConnectedLineage = useCallback((startColId, allEdges) => {
        const visitedCols = new Set([startColId]);
        const visitedTables = new Set();
        const visitedEdges = new Set();
        const queue = [startColId];

        // Find the table containing the start column
        const startNode = initialNodes.find(n => n.data.columns.some(c => c.id === startColId));
        if (startNode) visitedTables.add(startNode.id);

        while (queue.length > 0) {
            const currentId = queue.shift();

            // Find edges connected to this column (downstream)
            allEdges.forEach(edge => {
                if (edge.edge_type === 'column_edge') {
                    if (edge.sourceHandle === currentId && !visitedEdges.has(edge.id)) {
                        visitedEdges.add(edge.id);
                        if (!visitedCols.has(edge.targetHandle)) {
                            visitedCols.add(edge.targetHandle);
                            queue.push(edge.targetHandle);
                            // Find table for this column
                            const targetNode = initialNodes.find(n => n.data.columns.some(c => c.id === edge.targetHandle));
                            if (targetNode) visitedTables.add(targetNode.id);
                        }
                    }
                }
            });
        }
        return { visitedCols, visitedTables, visitedEdges };
    }, [initialNodes]);

    const onColumnHover = useCallback((colId) => {
        const { visitedCols, visitedTables, visitedEdges } = findConnectedLineage(colId, initialEdges);
        setHighlightedColumns(visitedCols);
        setHighlightedTables(visitedTables);
        setHighlightedEdges(visitedEdges);
    }, [findConnectedLineage, initialEdges]);

    const onColumnLeave = useCallback(() => {
        setHighlightedColumns(new Set());
        setHighlightedTables(new Set());
        setHighlightedEdges(new Set());
    }, []);

    // 1. Layout Effect: Handles structural changes (nodes, edges, view options)
    useEffect(() => {
        if (!initialNodes || initialNodes.length === 0) return;

        let processedEdges = [];
        const uniqueEdges = new Set();
        const columnConnectedTables = new Set();

        // Process Column Edges first to identify connections
        if (viewOptions.showColumn) {
            initialEdges.forEach(edge => {
                if (edge.edge_type === "column_edge") {
                    const tableConnectionKey = `${edge.source}-${edge.target}`;
                    columnConnectedTables.add(tableConnectionKey);

                    processedEdges.push({
                        ...edge,
                        markerEnd: { type: MarkerType.ArrowClosed },
                        animated: true,
                        style: { stroke: '#f97316', strokeWidth: 2, opacity: 1 }, // Default Orange
                        zIndex: 10,
                    });
                }
            });
        }

        // Process Table Edges
        if (viewOptions.showTable) {
            initialEdges.forEach(edge => {
                if (edge.edge_type === "table_edge") {
                    const key = `table-${edge.source}-${edge.target}`;
                    const tableConnectionKey = `${edge.source}-${edge.target}`;

                    // Skip table edge if column edge exists between same tables
                    if (!uniqueEdges.has(key) && !columnConnectedTables.has(tableConnectionKey)) {
                        uniqueEdges.add(key);
                        processedEdges.push({
                            ...edge,
                            sourceHandle: 'table-source',
                            targetHandle: 'table-target',
                            markerEnd: { type: MarkerType.ArrowClosed },
                            animated: true,
                            style: { stroke: '#2563eb', strokeWidth: 2 }, // Blue-600
                            zIndex: 5,
                        });
                    }
                }
            });
        }

        // Calculate layout
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            initialNodes,
            processedEdges
        );

        // Initial node setup (without highlighting)
        const initializedNodes = layoutedNodes.map(node => ({
            ...node,
            data: {
                ...node.data,
                highlightedColumns: new Set(),
                isHighlighted: false,
                isDimmed: false,
                onColumnHover: onColumnHover,
                onColumnLeave: onColumnLeave
            }
        }));

        setNodes(initializedNodes);
        setEdges(layoutedEdges);

        // Initial fit view
        setTimeout(() => fitView({ padding: 0.2 }), 50);

    }, [initialNodes, initialEdges, viewOptions, setNodes, setEdges, fitView, onColumnHover, onColumnLeave]);


    // 2. Highlight Effect: Handles visual updates ONLY (no layout changes)
    useEffect(() => {
        // Update Nodes: preserve position, update data
        setNodes((nds) =>
            nds.map((node) => {
                const isHighlighted = highlightedTables.has(node.id);
                const isDimmed = highlightedTables.size > 0 && !isHighlighted;

                // Only update if changed to avoid unnecessary re-renders
                if (
                    node.data.isHighlighted === isHighlighted &&
                    node.data.isDimmed === isDimmed &&
                    node.data.highlightedColumns === highlightedColumns
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
                    },
                };
            })
        );

        // Update Edges: update style and zIndex
        setEdges((eds) =>
            eds.map((edge) => {
                const isHighlighted = highlightedEdges.has(edge.id);
                const isDimmed = highlightedEdges.size > 0 && !isHighlighted;

                let newStyle = { ...edge.style };
                let newZIndex = edge.zIndex;

                if (edge.type !== 'smoothstep') { // specific check if needed, or apply generally
                    if (isHighlighted) {
                        newStyle.stroke = '#a855f7'; // Purple-500
                        newStyle.strokeWidth = 3;
                        newStyle.opacity = 1;
                        newZIndex = 20;
                    } else if (isDimmed) {
                        newStyle.opacity = 0.2;
                        newStyle.strokeWidth = 2; // Reset width if needed
                        newZIndex = 5;
                    } else {
                        // Reset to default
                        newStyle.opacity = 1;
                        newStyle.strokeWidth = 2;
                        newStyle.stroke = edge.sourceHandle === 'table-source' ? '#2563eb' : '#f97316';
                        newZIndex = edge.sourceHandle === 'table-source' ? 5 : 10;
                    }
                }

                return {
                    ...edge,
                    style: newStyle,
                    zIndex: newZIndex,
                };
            })
        );
    }, [highlightedColumns, highlightedTables, highlightedEdges, setNodes, setEdges]);

    const onConnect = useCallback(
        (params) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
        [setEdges],
    );

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
            >
                <Controls />
                <MiniMap />
                <Background variant="dots" gap={12} size={1} />
            </ReactFlow>
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
