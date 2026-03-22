import { useState, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import DEMO_QUERIES from '../data/demoQueries';

/**
 * Build an initial file list from the demo queries so every
 * demo tab is ready the moment the page loads.
 */
function buildDemoFiles() {
    return DEMO_QUERIES.map((q, idx) => ({
        id: `demo-${idx + 1}`,
        name: q.name,
        content: q.sql,
    }));
}

/**
 * Custom hook for managing SQL file tabs.
 *
 * Encapsulates:
 *  - Tab list state (files)
 *  - Active tab tracking
 *  - Add / close / update / load-demo operations
 */
export default function useFileTabs() {
    const [files, setFiles] = useState(() => {
        try {
            const saved = localStorage.getItem('lineage_tabs');
            if (saved) return JSON.parse(saved);
        } catch {}
        return buildDemoFiles();
    });

    const [activeFileId, setActiveFileId] = useState(() => {
        return localStorage.getItem('lineage_active_tab') || 'demo-1';
    });

    // Persist tabs to localStorage on every change
    useEffect(() => {
        localStorage.setItem('lineage_tabs', JSON.stringify(files));
    }, [files]);

    useEffect(() => {
        localStorage.setItem('lineage_active_tab', activeFileId);
    }, [activeFileId]);

    const activeFile = files.find(f => f.id === activeFileId) || files[0];

    const updateFileContent = useCallback((content) => {
        setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content } : f));
    }, [activeFileId]);

    const addTab = useCallback(() => {
        const newId = Date.now().toString();
        const newFile = { id: newId, name: `Query ${files.length + 1}`, content: '' };
        setFiles(prev => [...prev, newFile]);
        setActiveFileId(newId);
    }, [files.length]);

    const closeTab = useCallback((id, e) => {
        e?.stopPropagation();
        if (files.length === 1) return;

        setFiles(prev => {
            const newFiles = prev.filter(f => f.id !== id);
            if (activeFileId === id) {
                setActiveFileId(newFiles[newFiles.length - 1].id);
            }
            return newFiles;
        });
    }, [files.length, activeFileId]);

    const selectTab = useCallback((id) => {
        setActiveFileId(id);
    }, []);

    /**
     * Rename a tab.
     */
    const renameTab = useCallback((id, newName) => {
        if (!newName?.trim()) return;
        setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName.trim() } : f));
    }, []);

    /**
     * Reset all tabs to the demo queries.
     */
    const loadDemoQueries = useCallback(() => {
        const demoFiles = buildDemoFiles();
        setFiles(demoFiles);
        setActiveFileId(demoFiles[0].id);
    }, []);

    /**
     * Import a .sql file: read its text content and open it as a new tab.
     */
    const importFile = useCallback((file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const name = file.name.replace(/\.sql$/i, '');
            const content = e.target.result;
            const newId = Date.now().toString();
            setFiles(prev => [...prev, { id: newId, name, content }]);
            setActiveFileId(newId);
        };
        reader.readAsText(file);
    }, []);

    /**
     * Import a folder of .sql files: open each as a new tab.
     */
    const importFolder = useCallback((fileList) => {
        const sqlFiles = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.sql'));
        if (sqlFiles.length === 0) return;

        let firstNewId = null;
        let pending = sqlFiles.length;

        sqlFiles.forEach((file, idx) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const name = file.name.replace(/\.sql$/i, '');
                const content = e.target.result;
                const newId = `${Date.now()}-${idx}`;
                if (idx === 0) firstNewId = newId;
                setFiles(prev => [...prev, { id: newId, name, content }]);
                pending--;
                if (pending === 0 && firstNewId) {
                    setActiveFileId(firstNewId);
                }
            };
            reader.readAsText(file);
        });
    }, []);

    /**
     * Download all open tabs as a single .zip file.
     */
    const downloadAllFiles = useCallback(async () => {
        const zip = new JSZip();
        files.forEach(f => {
            const fileName = f.name.endsWith('.sql') ? f.name : `${f.name}.sql`;
            zip.file(fileName, f.content || '');
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lineage-queries.zip';
        a.click();
        URL.revokeObjectURL(url);
    }, [files]);

    return {
        files,
        activeFile,
        activeFileId,
        updateFileContent,
        addTab,
        closeTab,
        selectTab,
        renameTab,
        loadDemoQueries,
        importFile,
        importFolder,
        downloadAllFiles,
    };
}
