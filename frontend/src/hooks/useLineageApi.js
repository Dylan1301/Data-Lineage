import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as lineageApi from '../api/lineageApi';
import { showErrorToast } from '../components/ErrorToast';
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
const buildGraph = (data) => LineageGraphModel.fromJSON(data);

export default function useLineageApi() {
    const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
    const [loading, setLoading] = useState(false);
    const [impactData, setImpactData] = useState(null);
    const [error, setError] = useState(null);

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
            setGraphData(buildGraph(data));
            localStorage.removeItem('lineage_cleared');
            if (typeof sql === 'string') {
                toast.success('Lineage parsed successfully', { duration: 2000 });
            }
        } catch (err) {
            console.error(err);
            setError(err.message);
            showErrorToast(err.message);
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
            localStorage.setItem('lineage_cleared', 'true');
            toast.success('Graph cleared');
        } catch (err) {
            console.error(err);
            showErrorToast(err.message);
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
            setGraphData(buildGraph(data));
        } catch (err) {
            console.error(err);
            setError(err.message);
            showErrorToast(err.message);
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
                setGraphData(buildGraph(data));
                localStorage.removeItem('lineage_cleared');
            }

            toast.success(`Loaded ${queries.length} demo queries`, { duration: 2000 });
        } catch (err) {
            console.error(err);
            setError(err.message);
            showErrorToast(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * On page load: try to restore the graph from the backend session.
     * If the session is empty (e.g. server restarted), re-submit all saved tabs.
     *
     * @param {{ sql: string, fileName: string }[]} queries - tabs to fall back on
     */
    const initGraph = useCallback(async (queries) => {
        // Silently check if the backend session still has graph data
        try {
            const sessionData = await lineageApi.getGraph();
            const sessionGraph = buildGraph(sessionData);
            if (sessionGraph.nodes.length > 0) {
                setGraphData(sessionGraph);
                return;
            }
        } catch (err) {
            console.error('Failed to restore session on load:', err);
            return;
        }

        // Session is empty — only re-submit if the user didn't explicitly clear
        if (localStorage.getItem('lineage_cleared') === 'true') return;

        const valid = queries.filter(q => q.sql?.trim());
        if (valid.length === 0) return;

        setLoading(true);
        try {
            let lastData;
            for (const q of valid) {
                lastData = await lineageApi.visualize({ sql: q.sql, fileName: q.fileName });
            }
            if (lastData) {
                setGraphData(buildGraph(lastData));
            }
        } catch (err) {
            console.error('Failed to re-submit queries on load:', err);
            showErrorToast(err.message);
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
            showErrorToast(err.message);
        }
    }, []);

    return {
        graphData,
        loading,
        error,
        impactData,
        setImpactData,
        visualize,
        visualizeAll,
        clearGraph,
        clearFile,
        fetchImpact,
        initGraph,
    };
}
