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

    useEffect(() => {
        if (initialNodes && initialNodes.length > 0) {
            let processedEdges = [];
            const uniqueEdges = new Set();

            // 1. Process Column Edges if enabled
            if (viewOptions.showColumn) {
                initialEdges.forEach(edge => {
                    if (edge.edge_type === "column_edge") {
                        // Ensure unique key for column edges too if needed, but usually source/target handle combo is unique
                        processedEdges.push({
                            ...edge,
                            markerEnd: { type: MarkerType.ArrowClosed },
                            animated: true,
                            style: { stroke: '#f97316', strokeWidth: 2 }, // Orange-500
                            zIndex: 10, // Column edges on top
                        });
                    }
                });
            }

            // 2. Process Table Edges if enabled
            if (viewOptions.showTable) {
                initialEdges.forEach(edge => {
                    if (edge.edge_type === "table_edge") {
                        const key = `table-${edge.source}-${edge.target}`;
                        if (!uniqueEdges.has(key)) {
                            uniqueEdges.add(key);
                            processedEdges.push({
                                ...edge,
                                // Enforce table handles for table edges
                                sourceHandle: 'table-source',
                                targetHandle: 'table-target',
                                markerEnd: { type: MarkerType.ArrowClosed },
                                animated: true,
                                style: { stroke: '#2563eb', strokeWidth: 2 }, // Blue-600
                                zIndex: 5, // Table edges below column edges
                            });
                        }
                    }
                });
            }

            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                initialNodes,
                processedEdges
            );
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
            // Delay fitView slightly to allow render
            setTimeout(() => fitView({ padding: 0.2 }), 50);
        }
    }, [initialNodes, initialEdges, viewOptions, setNodes, setEdges, fitView]);

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
