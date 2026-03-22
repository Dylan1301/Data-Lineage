import React, { useCallback, useEffect, useState } from 'react';

const MIN_WIDTH = 280;
const MAX_WIDTH = 800;
export const DEFAULT_WIDTH = 420;

const ResizeHandle = ({ onWidthChange }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
            onWidthChange(newWidth);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Prevent text selection while dragging
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isDragging, onWidthChange]);

    return (
        <div
            onMouseDown={handleMouseDown}
            className={`w-1.5 cursor-col-resize flex-shrink-0 transition-colors duration-150
                        hover:bg-blue-400 dark:hover:bg-blue-500
                        ${isDragging ? 'bg-blue-500 dark:bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'}`}
            title="Drag to resize"
        />
    );
};

export default ResizeHandle;
