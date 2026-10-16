import type { NonSharedUint8Array } from '../../type-polyfills/non-shared-typed-arrays';
import { FlowControlledDataChannel, type FlowControlledDataChannelOptions } from './FlowControlledDataChannel';
export interface LossyDataChannelOptions extends FlowControlledDataChannelOptions {
    /**
     * What to do with a send while the buffer is full: `drop` discards it to keep latency bounded
     * (the classic lossy channel), `wait` backpressures the producer until there is headroom (the
     * data-track channel, whose producer decides what to skip at frame granularity).
     */
    bufferFullBehavior: 'drop' | 'wait';
    /** Sends are silently discarded while this is true (a reconnect attempt is underway). */
    shouldSkipSends: () => boolean;
}
/**
 * A lossy channel: flow control plus a per-instance full-buffer policy.
 *
 * Each instance owns its own byterate stat, drop counter, and (when tuning is started) the
 * dynamic `bufferedAmountLowThreshold` adjustment that keeps the drop gate at roughly 100ms of
 * buffered latency. Keeping these per instance is what prevents one channel's traffic from
 * steering another channel's policy.
 */
export declare class LossyDataChannel extends FlowControlledDataChannel {
    private bufferFullBehavior;
    private shouldSkipSends;
    private statCurrentBytes;
    private statByterate;
    private statInterval;
    private dropCount;
    constructor(opts: LossyDataChannelOptions);
    /** Sends prepared bytes with this channel's full-buffer policy (drop or wait). */
    send(msg: NonSharedUint8Array): Promise<void>;
    /**
     * Starts the once-per-second adjustment of the channel's `bufferedAmountLowThreshold` to the
     * observed byterate, keeping the drop gate at roughly 100ms of buffered latency (clamped to
     * the watermarks). Restarts cleanly if already running.
     */
    startThresholdTuning(): void;
    /** Stops the threshold tuning and resets the stats and drop counter. */
    stopThresholdTuning(): void;
}
//# sourceMappingURL=LossyDataChannel.d.ts.map