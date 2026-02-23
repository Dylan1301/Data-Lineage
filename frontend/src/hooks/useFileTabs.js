import { useState, useCallback } from 'react';

const DEFAULT_SQL = `SELECT
    ranked_customers.customer_id,
    ranked_customers.first_name,
    ranked_customers.last_name,
    ranked_customers.total_spent
FROM (
    SELECT
        c.customer_id,
        c.first_name,
        c.last_name,
        SUM(o.total_amount) AS total_spent
    FROM customers c
    INNER JOIN orders o
        ON o.customer_id = c.customer_id
    WHERE o.status = 'COMPLETED'
    GROUP BY
        c.customer_id,
        c.first_name,
        c.last_name
) AS ranked_customers
WHERE ranked_customers.total_spent > (
    SELECT AVG(o2.total_amount)
    FROM orders o2
    WHERE o2.status = 'COMPLETED'
)
ORDER BY ranked_customers.total_spent DESC`;

/**
 * Custom hook for managing SQL file tabs.
 *
 * Encapsulates:
 *  - Tab list state (files)
 *  - Active tab tracking
 *  - Add / close / update tab operations
 */
export default function useFileTabs() {
    const [files, setFiles] = useState([
        { id: '1', name: 'Query 1', content: DEFAULT_SQL },
    ]);
    const [activeFileId, setActiveFileId] = useState('1');

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

    return {
        files,
        activeFile,
        activeFileId,
        updateFileContent,
        addTab,
        closeTab,
        selectTab,
    };
}
