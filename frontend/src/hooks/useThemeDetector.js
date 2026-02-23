import { useState, useEffect } from 'react';

/**
 * Custom hook that watches the `dark` class on <html> and returns a boolean.
 * Used to pass the current theme to non-Tailwind components (e.g. CodeMirror, toasts).
 */
export default function useThemeDetector() {
    const [isDark, setIsDark] = useState(() =>
        document.documentElement.classList.contains('dark')
    );

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'));
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });

        return () => observer.disconnect();
    }, []);

    return isDark;
}
