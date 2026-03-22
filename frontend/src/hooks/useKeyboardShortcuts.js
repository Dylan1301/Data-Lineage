import { useEffect } from 'react';

/**
 * Registers global keyboard shortcuts.
 *
 * @param {Object} params
 * @param {Function} params.onVisualize - Called on Ctrl/Cmd+Enter
 * @param {Function} params.onClosePanel - Called on Escape
 */
export default function useKeyboardShortcuts({ onVisualize, onClosePanel }) {
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                onVisualize();
            }
            if (e.key === 'Escape') {
                onClosePanel();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onVisualize, onClosePanel]);
}
