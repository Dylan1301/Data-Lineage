import React, { useState, useCallback, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'

// Context / Hooks
import { useTheme } from './context/ThemeContext'
import useLineageApi from './hooks/useLineageApi'
import useFileTabs from './hooks/useFileTabs'
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts'

// Components
import LineageGraph from './components/LineageGraph'
import ImpactPanel from './components/ImpactPanel'
import Sidebar from './components/Sidebar'
import ResizeHandle, { DEFAULT_WIDTH } from './components/ResizeHandle'
import SearchBar from './components/SearchBar'

function App() {
    // ── Hooks ──────────────────────────────────────────
    const { isDark } = useTheme();
    const { graphData, loading, impactData, setImpactData, visualize, visualizeAll, clearGraph, clearFile, fetchImpact, initGraph } = useLineageApi();
    const { files, activeFile, activeFileId, updateFileContent, addTab, closeTab, selectTab, renameTab, loadDemoQueries, importFile, importFolder, downloadAllFiles } = useFileTabs();

    // Restore graph on first load
    useEffect(() => {
        const queries = files
            .filter(f => f.content?.trim())
            .map(f => ({ sql: f.content, fileName: f.name }));
        initGraph(queries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Local UI state ────────────────────────────────
    const [viewOptions, setViewOptions] = useState({ showTable: true, showColumn: true });
    const [searchQuery, setSearchQuery] = useState('');
    const [fileFilter, setFileFilter] = useState(null);
    const [dialect, setDialect] = useState('');
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarWidth');
        return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
    });

    // Tab renaming state
    const [editingTabId, setEditingTabId] = useState(null);
    const [editingTabName, setEditingTabName] = useState('');

    // ── Derived values ────────────────────────────────
    const fileNames = graphData.nodes
        .map(n => n.data?.file_name)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);

    const graphStats = React.useMemo(() => {
        const tables = graphData.nodes.filter(n => n.data?.table_node_type === 'table').length;
        const queries = graphData.nodes.filter(n => n.data?.table_node_type !== 'table').length;
        const colEdges = graphData.edges.filter(e => e.edge_type === 'column_edge').length;
        const files = new Set(graphData.nodes.map(n => n.data?.file_name).filter(Boolean)).size;
        return { tables, queries, colEdges, files };
    }, [graphData]);

    // ── Handlers ──────────────────────────────────────
    const handleSidebarResize = useCallback((width) => {
        setSidebarWidth(width);
        localStorage.setItem('sidebarWidth', width.toString());
    }, []);

    const handleRunAllDemos = useCallback(() => {
        const queries = files
            .filter(f => f.content?.trim())
            .map(f => ({ sql: f.content, fileName: f.name }));
        visualizeAll(queries);
    }, [files, visualizeAll]);

    const handleTabDoubleClick = useCallback((file) => {
        setEditingTabId(file.id);
        setEditingTabName(file.name);
    }, []);

    const handleTabRenameSubmit = useCallback(() => {
        if (editingTabId && editingTabName.trim()) {
            renameTab(editingTabId, editingTabName);
        }
        setEditingTabId(null);
        setEditingTabName('');
    }, [editingTabId, editingTabName, renameTab]);

    const handleTabRenameKeyDown = useCallback((e) => {
        if (e.key === 'Enter') {
            handleTabRenameSubmit();
        } else if (e.key === 'Escape') {
            setEditingTabId(null);
            setEditingTabName('');
        }
    }, [handleTabRenameSubmit]);

    const handleColumnClick = useCallback((tableName, colName) => {
        fetchImpact(tableName, colName);
    }, [fetchImpact]);

    // ── Keyboard shortcuts ────────────────────────────
    useKeyboardShortcuts({
        onVisualize: () => visualize(activeFile.content, activeFile.name, dialect || null),
        onClosePanel: () => setImpactData(null),
    });

    // ── Render ────────────────────────────────────────
    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
            {/* Toast notifications */}
            <Toaster
                position="top-right"
                toastOptions={{
                    className: 'text-sm',
                    style: {
                        background: isDark ? '#1f2937' : '#ffffff',
                        color: isDark ? '#f3f4f6' : '#1f2937',
                        border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                    },
                    success: {
                        iconTheme: { primary: '#10b981', secondary: isDark ? '#1f2937' : '#ffffff' },
                    },
                    error: {
                        iconTheme: { primary: '#ef4444', secondary: isDark ? '#1f2937' : '#ffffff' },
                    },
                }}
            />

            {/* ═══ Sidebar ═══ */}
            <Sidebar
                files={files}
                activeFile={activeFile}
                activeFileId={activeFileId}
                updateFileContent={updateFileContent}
                addTab={addTab}
                closeTab={closeTab}
                selectTab={selectTab}
                renameTab={renameTab}
                loadDemoQueries={loadDemoQueries}
                importFile={importFile}
                importFolder={importFolder}
                downloadAllFiles={downloadAllFiles}
                onVisualize={() => visualize(activeFile.content, activeFile.name, dialect || null)}
                onClearGraph={clearGraph}
                onRunAll={handleRunAllDemos}
                onClearFile={() => clearFile(activeFile.name)}
                loading={loading}
                hasGraph={graphData.nodes.length > 0}
                dialect={dialect}
                setDialect={setDialect}
                viewOptions={viewOptions}
                setViewOptions={setViewOptions}
                sidebarWidth={sidebarWidth}
                isDark={isDark}
                editingTabId={editingTabId}
                editingTabName={editingTabName}
                setEditingTabId={setEditingTabId}
                setEditingTabName={setEditingTabName}
                onTabDoubleClick={handleTabDoubleClick}
                onTabRenameSubmit={handleTabRenameSubmit}
                onTabRenameKeyDown={handleTabRenameKeyDown}
            />

            {/* ═══ Resize Handle ═══ */}
            <ResizeHandle onWidthChange={handleSidebarResize} />

            {/* ═══ Graph Area ═══ */}
            <div className="flex-grow h-full bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors duration-300">
                {/* Search + Stats */}
                {graphData.nodes.length > 0 && (
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-850 flex-shrink-0">
                        <SearchBar
                            onSearchChange={setSearchQuery}
                            fileNames={fileNames}
                            onFileFilterChange={setFileFilter}
                            activeFileFilter={fileFilter}
                        />
                        <div className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 flex gap-3">
                            <span>{graphStats.tables} table{graphStats.tables !== 1 ? 's' : ''}</span>
                            <span>{graphStats.queries} quer{graphStats.queries !== 1 ? 'ies' : 'y'}</span>
                            <span>{graphStats.colEdges} column edge{graphStats.colEdges !== 1 ? 's' : ''}</span>
                            <span>{graphStats.files} file{graphStats.files !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                )}

                {/* Graph */}
                <div className="flex-grow relative">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3">
                            <div className="loading-spinner" />
                            <p className="text-sm text-gray-400 dark:text-gray-500">Parsing lineage...</p>
                        </div>
                    ) : graphData.nodes.length > 0 ? (
                        <>
                            <LineageGraph
                                initialNodes={graphData.nodes}
                                initialEdges={graphData.edges}
                                viewOptions={viewOptions}
                                searchQuery={searchQuery}
                                fileFilter={fileFilter}
                                onColumnClick={handleColumnClick}
                            />
                            <ImpactPanel
                                impactData={impactData}
                                onClose={() => setImpactData(null)}
                            />
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
                                <circle cx="18" cy="18" r="3" />
                                <circle cx="6" cy="6" r="3" />
                                <path d="M6 21V9a9 9 0 0 0 9 9" />
                            </svg>
                            <p className="text-sm">Enter SQL and click <span className="font-semibold text-blue-500">Visualize</span> to see the lineage.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default App
