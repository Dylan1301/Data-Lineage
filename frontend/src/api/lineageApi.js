/**
 * API client for the Lineage backend.
 *
 * This module contains ONLY fetch logic — no React state, no toasts, no UI.
 * Every function returns data on success or throws an Error on failure.
 *
 * Session management:
 *   - The server sets a `session_id` cookie on every response.
 *   - We also store it in localStorage as a fallback and send it as
 *     an `X-Session-Id` header.
 */

const BASE_URL = '/api';

/** Read session ID from localStorage (fallback for non-cookie scenarios). */
function getSessionId() {
    return localStorage.getItem('lineage_session_id');
}

/** Persist session ID from a response header into localStorage. */
function saveSessionId(response) {
    const id = response.headers.get('x-session-id');
    if (id) {
        localStorage.setItem('lineage_session_id', id);
    }
}

/**
 * Internal helper: sends a JSON request and returns the parsed response.
 * Throws an Error with the server's `detail` message (if available) on non-2xx.
 */
async function request(path, { method = 'POST', body = null } = {}) {
    const options = {
        method,
        credentials: 'include', // send cookies cross-origin
    };

    const headers = {};

    // Attach session header as fallback
    const sessionId = getSessionId();
    if (sessionId) {
        headers['X-Session-Id'] = sessionId;
    }

    if (body !== null) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    options.headers = headers;

    const response = await fetch(`${BASE_URL}${path}`, options);

    // Persist session token from response
    saveSessionId(response);

    if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '60';
        throw new Error(
            `Rate limit exceeded. Please try again in ${retryAfter} seconds.`
        );
    }

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
export async function visualize({ sql = null, fileName = null, dialect = null } = {}) {
    const payload = {};
    if (typeof sql === 'string') {
        payload.sql = sql;
        payload.file_name = fileName;
    }
    if (dialect) payload.dialect = dialect;
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

/**
 * Return upstream and downstream impact for a given column.
 *
 * @param {Object} params
 * @param {string} params.table - Table name
 * @param {string} params.column - Column name
 * @returns {Promise<Object>} { column, upstream: [{table, column}], downstream: [{table, column}] }
 */
export async function getImpact({ table, column }) {
    return request('/lineage/impact', { body: { table, column } });
}
