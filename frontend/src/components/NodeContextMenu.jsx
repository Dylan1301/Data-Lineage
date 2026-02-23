import React, { useEffect, useRef } from 'react';

const NodeContextMenu = ({ x, y, node, onClose, onFocusLineage, onCopyName }) => {
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                onClose();
            }
        };
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [onClose]);

    if (!node) return null;

    const menuItems = [
        {
            label: 'Copy Table Name',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
            ),
            action: () => {
                navigator.clipboard.writeText(node.data.label);
                onCopyName?.();
                onClose();
            },
        },
        {
            label: 'Focus Lineage',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
            ),
            action: () => {
                onFocusLineage?.(node.id);
                onClose();
            },
        },
        {
            label: `Columns: ${node.data.columns?.length || 0}`,
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
            ),
            disabled: true,
        },
    ];

    return (
        <div
            ref={menuRef}
            className="fixed z-50 min-w-[180px] bg-white dark:bg-gray-800 
                        border border-gray-200 dark:border-gray-600 
                        rounded-lg shadow-xl overflow-hidden"
            style={{ left: x, top: y }}
        >
            {/* Header */}
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-600">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate block">
                    {node.data.label}
                </span>
                {node.data.file_name && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{node.data.file_name}</span>
                )}
            </div>

            {/* Menu Items */}
            {menuItems.map((item, idx) => (
                <button
                    key={idx}
                    onClick={item.action}
                    disabled={item.disabled}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors
                        ${item.disabled
                            ? 'text-gray-400 dark:text-gray-500 cursor-default'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                        }
                        ${idx > 0 ? 'border-t border-gray-100 dark:border-gray-700' : ''}`}
                >
                    <span className="text-gray-400 dark:text-gray-500">{item.icon}</span>
                    {item.label}
                </button>
            ))}
        </div>
    );
};

export default NodeContextMenu;
