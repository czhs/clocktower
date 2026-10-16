/**
 * Per-key rate limiter for repeated errors. Prevents log/emit floods and the
 * unbounded map growth that a per-event log would cause when a broken key
 * keeps producing failures.
 */
export declare class ErrorRateLimiter {
    private readonly throttleMs;
    private readonly windowMs;
    private readonly maxPerWindow;
    private lastAt;
    private counts;
    constructor(throttleMs?: number, windowMs?: number, maxPerWindow?: number);
    reset(): void;
    countFor(key: string): number;
    /**
     * Returns true if the caller should emit for this key. Invokes `onSuppress`
     * exactly once per window when the per-window limit is first crossed.
     */
    shouldEmit(key: string, onSuppress?: () => void): boolean;
}
//# sourceMappingURL=ErrorRateLimiter.d.ts.map