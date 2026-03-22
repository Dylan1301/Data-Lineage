import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTheme } from '../context/ThemeContext'

const PREVIEW_LENGTH = 80

function ErrorToast({ message, toastId }) {
    const [expanded, setExpanded] = useState(false)
    const { isDark } = useTheme()

    const firstLine = message.split('\n')[0]
    const isLong = firstLine.length > PREVIEW_LENGTH || message.includes('\n')
    const preview = firstLine.length > PREVIEW_LENGTH
        ? firstLine.slice(0, PREVIEW_LENGTH) + '…'
        : firstLine

    return (
        <div
            className="flex items-start gap-2 text-sm rounded-lg shadow-lg px-3 py-2.5 w-80"
            style={{
                background: isDark ? '#1f2937' : '#ffffff',
                color: isDark ? '#f3f4f6' : '#1f2937',
                border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
            }}
        >
            {/* Error icon */}
            <svg className="text-red-500 flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>

            <div className="flex-1 min-w-0">
                {expanded ? (
                    <pre className="text-xs whitespace-pre-wrap break-words font-mono rounded p-2 max-h-48 overflow-y-auto"
                        style={{ background: isDark ? '#111827' : '#f3f4f6' }}>
                        {message}
                    </pre>
                ) : (
                    <p className="leading-snug">{preview}</p>
                )}
                {isLong && (
                    <button
                        onClick={() => setExpanded(e => !e)}
                        className="text-xs text-blue-500 hover:text-blue-400 mt-1"
                    >
                        {expanded ? 'Show less' : 'Show details'}
                    </button>
                )}
            </div>

            {/* Dismiss */}
            <button
                onClick={() => toast.dismiss(toastId)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 leading-none"
            >
                ✕
            </button>
        </div>
    )
}

export function showErrorToast(message) {
    toast.custom(
        (t) => <ErrorToast message={message} toastId={t.id} />,
        { duration: 6000 }
    )
}
