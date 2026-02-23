import React, { useState } from 'react';
import { toPng, toSvg } from 'html-to-image';

const ExportButton = ({ graphRef }) => {
    const [exporting, setExporting] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    const download = (dataUrl, extension) => {
        const link = document.createElement('a');
        link.download = `lineage-graph.${extension}`;
        link.href = dataUrl;
        link.click();
    };

    const handleExport = async (format) => {
        setShowMenu(false);
        if (!graphRef?.current) return;

        const viewport = graphRef.current.querySelector('.react-flow__viewport');
        if (!viewport) return;

        setExporting(true);
        try {
            const options = {
                backgroundColor: document.documentElement.classList.contains('dark') ? '#1e1e2e' : '#f9fafb',
                quality: 1,
                pixelRatio: 2,
            };

            if (format === 'png') {
                const dataUrl = await toPng(viewport, options);
                download(dataUrl, 'png');
            } else {
                const dataUrl = await toSvg(viewport, options);
                download(dataUrl, 'svg');
            }
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setShowMenu(!showMenu)}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                           bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600
                           text-gray-700 dark:text-gray-300
                           hover:bg-gray-50 dark:hover:bg-gray-700 
                           shadow-sm transition-colors disabled:opacity-50"
                title="Export graph"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {exporting ? 'Exporting...' : 'Export'}
            </button>

            {showMenu && (
                <div className="absolute top-full mt-1 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 overflow-hidden min-w-[100px]">
                    <button
                        onClick={() => handleExport('png')}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                        📷 PNG
                    </button>
                    <button
                        onClick={() => handleExport('svg')}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700"
                    >
                        🖼️ SVG
                    </button>
                </div>
            )}
        </div>
    );
};

export default ExportButton;
