/** one summarised stats entry; keys without a value are dropped */
type Summary = Record<string, unknown>;
/**
 * Picks the interesting fields out of a `getStats()` report and groups them by
 * RTP stream, so a stats dump can be read without unfolding the raw report.
 */
export declare function summarizeStatsReport(report: RTCStatsReport): {
    connection: Summary | undefined;
    outbound: Summary[] | undefined;
    inbound: Summary[] | undefined;
};
export {};
//# sourceMappingURL=statsSummary.d.ts.map
