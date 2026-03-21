import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as lineageApi from '../api/lineageApi';
import LineageGraphModel from '../models/LineageGraphModel';

/**
 * Custom hook that manages lineage graph state and API orchestration.
 *
 * Responsibilities:
 *  - Holds graphData and loading state
 *  - Calls the API layer and maps responses to models
 *  - Shows toast notifications for success/error
 *
 * Returns an object with state + handler functions to be used by UI components.
 */
export default function useLineageApi() {
    const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
    const [loading, setLoading] = useState(false);
    const [impactData, setImpactData] = useState(null);

    /**
     * Parse SQL and update the graph, or refresh the current graph if sql is null.
     */
    const visualize = useCallback(async (sql, fileName, dialect = null) => {
        if (typeof sql === 'string' && !sql.trim()) {
            toast.error('Please enter SQL before visualizing');
            return;
        }

        setLoading(true);
        try {
            const data = await lineageApi.visualize({ sql, fileName, dialect });
            const graphModel = LineageGraphModel.fromJSON(data);
            setGraphData(graphModel);
            if (typeof sql === 'string') {
                toast.success('Lineage parsed successfully', { duration: 2000 });
            }
        } catch (err) {
            console.error(err);
            toast.error(err.message, { duration: 4000 });
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Clear the entire graph.
     */
    const clearGraph = useCallback(async () => {
        if (!confirm('Are you sure you want to clear the lineage graph?')) return;

        setLoading(true);
        try {
            await lineageApi.clearGraph();
            setGraphData({ nodes: [], edges: [] });
            toast.success('Graph cleared');
        } catch (err) {
            console.error(err);
            toast.error('Failed to clear graph');
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Clear a specific file from the graph, then refresh.
     */
    const clearFile = useCallback(async (fileName) => {
        if (!confirm('Are you sure you want to clear the current file?')) return;

        setLoading(true);
        try {
            await lineageApi.clearFile(fileName);
            toast.success(`Cleared ${fileName}`);

            // Refresh graph without parsing new SQL
            const data = await lineageApi.visualize();
            const graphModel = LineageGraphModel.fromJSON(data);
            setGraphData(graphModel);
        } catch (err) {
            console.error(err);
            toast.error('Failed to clear file');
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Submit multiple queries sequentially, then display the combined graph.
     * @param {{ sql: string, fileName: string }[]} queries
     */
    const visualizeAll = useCallback(async (queries) => {
        if (!queries || queries.length === 0) return;

        setLoading(true);
        try {
            // Clear existing graph first
            await lineageApi.clearGraph();

            let data;
            for (const q of queries) {
                if (!q.sql?.trim()) continue;
                data = await lineageApi.visualize({ sql: q.sql, fileName: q.fileName });
            }

            if (data) {
                const graphModel = LineageGraphModel.fromJSON(data);
                setGraphData(graphModel);
            }

            toast.success(`Loaded ${queries.length} demo queries`, { duration: 2000 });
        } catch (err) {
            console.error(err);
            toast.error(err.message, { duration: 4000 });
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Fetch column impact (upstream + downstream BFS).
     */
    const fetchImpact = useCallback(async (table, column) => {
        try {
            const data = await lineageApi.getImpact({ table, column });
            setImpactData(data);
        } catch (err) {
            console.error(err);
            toast.error(err.message, { duration: 3000 });
        }
    }, []);

    return {
        graphData,
        loading,
        impactData,
        setImpactData,
        visualize,
        visualizeAll,
        clearGraph,
        clearFile,
        fetchImpact,
    };
}
