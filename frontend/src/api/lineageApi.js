/**
 * API client for the Lineage backend.
 *
 * This module contains ONLY fetch logic — no React state, no toasts, no UI.
 * Every function returns data on success or throws an Error on failure.
 */

const BASE_URL = '/api';

/**
 * Internal helper: sends a JSON request and returns the parsed response.
 * Throws an Error with the server's `detail` message (if available) on non-2xx.
 */
async function request(path, { method = 'POST', body = null } = {}) {
    const options = { method };

    if (body !== null) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${path}`, options);

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `API Error: ${response.statusText}`);
    }

    // Some endpoints (clear, clear-file) return minimal JSON
    return response.json();
}

/**
 * Parse SQL and return the lineage graph, or return the current graph if no SQL is provided.
 *
 * @param {Object} params
 * @param {string|null} params.sql - SQL to parse (null = just fetch current graph)
 * @param {string|null} params.fileName - The tab/file name to associate with this SQL
 * @returns {Promise<Object>} Raw graph JSON ({ nodes, edges })
 */
export async function visualize({ sql = null, fileName = null } = {}) {
    const payload = {};
    if (typeof sql === 'string') {
        payload.sql = sql;
        payload.file_name = fileName;
    }
    return request('/lineage/visualize', { body: payload });
}

/**
 * Clear the entire lineage graph.
 * @returns {Promise<Object>} { status: "ok" }
 */
export async function clearGraph() {
    return request('/lineage/clear');
}

/**
 * Clear a specific file's lineage from the graph.
 *
 * @param {string} fileName - Name of the file to clear
 * @returns {Promise<Object>} { status: "ok" }
 */
export async function clearFile(fileName) {
    return request('/lineage/clear-file', { body: { file_name: fileName } });
}
