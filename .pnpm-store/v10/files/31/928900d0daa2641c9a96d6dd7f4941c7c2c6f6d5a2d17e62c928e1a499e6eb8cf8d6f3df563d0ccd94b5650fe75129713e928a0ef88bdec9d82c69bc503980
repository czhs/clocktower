/**
 * Test helper: resolves `true` if `promise` is still pending after `ms`
 * (default: one macrotask), `false` if it has already settled — regardless of
 * whether it resolved or rejected.
 *
 * Use to assert that something has *not* happened yet (e.g. an onClose callback
 * that must stay silent), optionally within a timeout window. Preferable to
 * `Promise.race([p, Promise.resolve(sentinel)])` when the "not yet" needs to
 * hold for a duration rather than just the current microtask.
 */
export declare function isPending(promise: Promise<unknown>, ms?: number): Promise<boolean>;
//# sourceMappingURL=promiseState.d.ts.map