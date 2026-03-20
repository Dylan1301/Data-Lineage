import { useState, useCallback } from 'react'
import { Toaster } from 'react-hot-toast'

// Hooks
import useLineageApi from './hooks/useLineageApi'
import useFileTabs from './hooks/useFileTabs'
import useThemeDetector from './hooks/useThemeDetector'

// Components
import LineageGraph from './components/LineageGraph'
import ThemeToggle from './components/ThemeToggle'
import SqlEditor from './components/SqlEditor'
import ResizeHandle from './components/ResizeHandle'
import SearchBar from './components/SearchBar'

import './App.css'

function App() {
    // ── Hooks ──────────────────────────────────────────
    const { graphData, loading, visualize, visualizeAll, clearGraph, clearFile } = useLineageApi();
    const { files, activeFile, activeFileId, updateFileContent, addTab, closeTab, selectTab, renameTab, loadDemoQueries } = useFileTabs();
    const isDark = useThemeDetector();

    // ── Local UI state ────────────────────────────────
    const [viewOptions, setViewOptions] = useState({ showTable: true, showColumn: true });
    const [searchQuery, setSearchQuery] = useState('');
    const [fileFilter, setFileFilter] = useState(null);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarWidth');
        return saved ? parseInt(saved, 10) : ResizeHandle.DEFAULT_WIDTH;
    });

    // Tab renaming state
    const [editingTabId, setEditingTabId] = useState(null);
    const [editingTabName, setEditingTabName] = useState('');

    // ── Derived values ────────────────────────────────
    const fileNames = graphData.nodes
        .map(n => n.data?.file_name)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);

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
            <div
                className="border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-850 flex flex-col shadow-lg z-10 transition-colors duration-300"
                style={{ width: sidebarWidth, minWidth: 280, maxWidth: 800 }}
            >
                {/* Header */}
                <div className="p-4 pb-0">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">
                            Lineage Visualizer
                        </h1>
                        <ThemeToggle />
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 overflow-x-auto pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
                        {files.map(file => (
                            <div
                                key={file.id}
                                onClick={() => selectTab(file.id)}
                                onDoubleClick={() => handleTabDoubleClick(file)}
                                className={`group flex items-center gap-2 px-3 py-1.5 rounded-t text-xs font-medium cursor-pointer transition-colors whitespace-nowrap border-t border-l border-r ${activeFileId === file.id
                                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 z-10'
                                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                style={{ marginBottom: '-1px' }}
                            >
                                {editingTabId === file.id ? (
                                    <input
                                        type="text"
                                        value={editingTabName}
                                        onChange={(e) => setEditingTabName(e.target.value)}
                                        onBlur={handleTabRenameSubmit}
                                        onKeyDown={handleTabRenameKeyDown}
                                        autoFocus
                                        className="w-20 px-1 py-0 text-xs bg-white dark:bg-gray-700 border border-blue-400 dark:border-blue-500 rounded outline-none text-gray-800 dark:text-gray-200"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <span title="Double-click to rename">{file.name}</span>
                                )}
                                {files.length > 1 && (
                                    <button
                                        onClick={(e) => closeTab(file.id, e)}
                                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 transition-opacity"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                        <button
                            onClick={addTab}
                            className="px-2 py-1 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors"
                            title="New Query"
                        >
                            +
                        </button>
                    </div>
                </div>

                {/* SQL Editor */}
                <div className="flex-grow flex flex-col px-4 mb-3 min-h-0">
                    <SqlEditor
                        value={activeFile.content}
                        onChange={updateFileContent}
                        darkMode={isDark}
                    />
                </div>

                {/* Action Buttons */}
                <div className="px-4 pb-4 space-y-3 flex-shrink-0">
                    {/* Primary actions row */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => visualize(activeFile.content, activeFile.name)}
                            disabled={loading}
                            className={`flex-1 py-2 px-4 rounded-lg font-bold text-white text-sm transition-all duration-200 ${loading
                                ? 'bg-blue-300 dark:bg-blue-800 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 shadow hover:shadow-md'
                                }`}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Processing...
                                </span>
                            ) : 'Visualize Lineage'}
                        </button>

                        <button
                            onClick={clearGraph}
                            disabled={loading || graphData.nodes.length === 0}
                            className="px-3 py-2 rounded-lg font-semibold text-red-600 dark:text-red-400 text-sm
                                       border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20
                                       hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors
                                       disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Clear All"
                        >
                            Clear
                        </button>
                    </div>

                    {/* Demo + Clear File row */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleRunAllDemos}
                            disabled={loading}
                            className={`flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition-all duration-200 ${loading
                                ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-400 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow hover:shadow-md'
                                }`}
                            title="Send all open tabs to the backend at once"
                        >
                            ▶ Run All Tabs
                        </button>

                        <button
                            onClick={() => clearFile(activeFile.name)}
                            disabled={loading || graphData.nodes.length === 0}
                            className="flex-1 py-2 px-4 rounded-lg font-semibold text-sm
                                       text-red-600 dark:text-red-400
                                       border border-red-200 dark:border-red-800
                                       bg-red-50 dark:bg-red-900/20
                                       hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors
                                       disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Clear File"
                        >
                            Clear File
                        </button>
                    </div>

                    {/* Reset demos row */}
                    <div className="flex gap-2">
                        <button
                            onClick={loadDemoQueries}
                            disabled={loading}
                            className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors
                                       text-gray-500 dark:text-gray-400
                                       border border-gray-200 dark:border-gray-700
                                       bg-white dark:bg-gray-800
                                       hover:bg-gray-100 dark:hover:bg-gray-700
                                       disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Reset all tabs to demo queries"
                        >
                            ↻ Reset Demo Tabs
                        </button>
                    </div>

                    {/* View Options */}
                    <div>
                        <label className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 mb-1 block uppercase tracking-widest">View Options</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setViewOptions(prev => ({ ...prev, showTable: !prev.showTable }))}
                                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${viewOptions.showTable
                                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                            >
                                {viewOptions.showTable ? '✓ Tables' : 'Tables'}
                            </button>
                            <button
                                onClick={() => setViewOptions(prev => ({ ...prev, showColumn: !prev.showColumn }))}
                                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${viewOptions.showColumn
                                    ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300'
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                            >
                                {viewOptions.showColumn ? '✓ Columns' : 'Columns'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ Resize Handle ═══ */}
            <ResizeHandle onWidthChange={handleSidebarResize} />

            {/* ═══ Graph Area ═══ */}
            <div className="flex-grow h-full bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors duration-300">
                {/* Search */}
                {graphData.nodes.length > 0 && (
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-850 flex-shrink-0">
                        <SearchBar
                            onSearchChange={setSearchQuery}
                            fileNames={fileNames}
                            onFileFilterChange={setFileFilter}
                            activeFileFilter={fileFilter}
                        />
                    </div>
                )}

                {/* Graph */}
                <div className="flex-grow">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3">
                            <div className="loading-spinner" />
                            <p className="text-sm text-gray-400 dark:text-gray-500">Parsing lineage...</p>
                        </div>
                    ) : graphData.nodes.length > 0 ? (
                        <LineageGraph
                            initialNodes={graphData.nodes}
                            initialEdges={graphData.edges}
                            viewOptions={viewOptions}
                            searchQuery={searchQuery}
                            fileFilter={fileFilter}
                        />
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
