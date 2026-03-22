import { useState, useCallback } from 'react';

export default function useGraphHighlight(initialNodes, initialEdges) {
    const [highlightedColumns, setHighlightedColumns] = useState(new Set());
    const [highlightedTables, setHighlightedTables] = useState(new Set());
    const [highlightedEdges, setHighlightedEdges] = useState(new Set());

    const findConnectedLineage = useCallback((startColId, allEdges) => {
        const visitedCols = new Set([startColId]);
        const visitedTables = new Set();
        const visitedEdges = new Set();
        const queue = [startColId];

        const startNode = initialNodes.find(n => n.data.columns.some(c => c.id === startColId));
        if (startNode) visitedTables.add(startNode.id);

        while (queue.length > 0) {
            const currentId = queue.shift();

            allEdges.forEach(edge => {
                if (edge.edge_type === 'column_edge') {
                    if (edge.sourceHandle === currentId && !visitedEdges.has(edge.id)) {
                        visitedEdges.add(edge.id);
                        if (!visitedCols.has(edge.targetHandle)) {
                            visitedCols.add(edge.targetHandle);
                            queue.push(edge.targetHandle);
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

    return { highlightedColumns, highlightedTables, highlightedEdges, onColumnHover, onColumnLeave };
}
