import React, { useEffect, useRef, useState } from 'react';

const NodeContextMenu = ({ x, y, node, onClose, onFocusLineage, onCopyName }) => {
    const menuRef = useRef(null);
    const [showDetails, setShowDetails] = useState(false);

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
        {
            label: showDetails ? 'Hide Details' : 'Node Details',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
            ),
            action: () => setShowDetails(prev => !prev),
            keepOpen: true,
        },
    ];

    // Compute adjusted position to keep menu on-screen
    const menuWidth = 240;
    const menuHeight = showDetails ? 400 : 200;
    const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8);
    const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8);

    return (
        <div
            ref={menuRef}
            className="fixed z-50 bg-white dark:bg-gray-800 
                        border border-gray-200 dark:border-gray-600 
                        rounded-lg shadow-xl overflow-hidden"
            style={{ left: adjustedX, top: adjustedY, minWidth: 220, maxWidth: 320 }}
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

            {/* Expanded Details Panel */}
            {showDetails && (
                <div className="border-t border-gray-200 dark:border-gray-600">
                    <div className="px-3 py-2 space-y-1.5 max-h-[300px] overflow-y-auto">
                        {/* Metadata rows */}
                        <DetailRow label="Table" value={node.data.label} />
                        <DetailRow label="File" value={node.data.file_name || '—'} />
                        <DetailRow
                            label="Type"
                            value={
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${node.data.table_node_type === 'table'
                                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                                    }`}>
                                    {node.data.table_node_type?.toUpperCase() || 'QUERY'}
                                </span>
                            }
                        />
                        {node.data.schema && <DetailRow label="Schema" value={node.data.schema} />}
                        <DetailRow
                            label="Is First"
                            value={node.data.is_first ? '✓ Yes' : '✗ No'}
                        />
                        <DetailRow label="Node ID" value={node.id} mono />

                        {/* Column list */}
                        {node.data.columns?.length > 0 && (
                            <div className="pt-1.5 mt-1.5 border-t border-gray-100 dark:border-gray-700">
                                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                    Columns ({node.data.columns.length})
                                </span>
                                <div className="mt-1 space-y-0.5">
                                    {node.data.columns.map((col, i) => (
                                        <div
                                            key={col.id || i}
                                            className="flex items-center justify-between py-0.5 px-1.5 rounded text-[11px] hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                        >
                                            <span className="text-gray-700 dark:text-gray-300 font-medium">{col.name}</span>
                                            <span className="text-gray-400 dark:text-gray-500 text-[9px] font-mono truncate ml-2 max-w-[100px]" title={col.id}>
                                                {col.id?.split('.').pop()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

/** Small row displaying a label: value pair */
const DetailRow = ({ label, value, mono = false }) => (
    <div className="flex items-start gap-2 text-[11px]">
        <span className="text-gray-400 dark:text-gray-500 font-medium min-w-[55px] shrink-0">{label}</span>
        <span className={`text-gray-700 dark:text-gray-300 break-all ${mono ? 'font-mono text-[10px]' : ''}`}>
            {value}
        </span>
    </div>
);

export default NodeContextMenu;

