/**
 * Throttle function - limits how often a function can be called
 * @param func Function to throttle
 * @param limit Time limit in milliseconds
 */
export function throttle(func, limit) {
    let inThrottle;
    let lastResult;

    return function (...args) {
        if (!inThrottle) {
            lastResult = func.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * RequestAnimationFrame-based throttle for smoother visual updates
 */
export function rafThrottle(func) {
    let rafId = null;
    let latestArgs = null;

    return function (...args) {
        latestArgs = args;

        if (rafId === null) {
            rafId = requestAnimationFrame(() => {
                if (latestArgs) {
                    func.apply(this, latestArgs);
                    latestArgs = null;
                }
                rafId = null;
            });
        }
    };
}

/**
 * Debounce function - delays execution until after wait time has elapsed since last call
 * Perfect for search inputs and filters
 * @param func Function to debounce
 * @param wait Wait time in milliseconds
 */
export function debounce(func, wait) {
    let timeoutId = null;

    return function (...args) {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            func.apply(this, args);
            timeoutId = null;
        }, wait);
    };
}
