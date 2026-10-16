import type { PCTransportManager } from '../PCTransportManager';
import { FlowControlledDataChannel } from './FlowControlledDataChannel';
import { LossyDataChannel } from './LossyDataChannel';
import { ReliableDataChannel } from './ReliableDataChannel';
import { DataChannelKind } from './types';
export interface DataChannelManagerOptions {
    /** Whether the owning engine has been closed — a closed engine rejects headroom waiters. */
    isEngineClosed: () => boolean;
    /**
     * Whether a reconnect attempt is underway: reliable sends defer to the resume replay and lossy
     * sends are skipped while this is true.
     */
    isReconnecting: () => boolean;
    onDataMessage: (message: MessageEvent) => void;
    onDataTrackMessage: (message: MessageEvent) => void;
    onDataError: (event: Event) => void;
    onChannelClose: (kind: DataChannelKind) => void;
    /** A channel's buffer crossed its low-water mark (debounced). Drives DCBufferStatusChanged. */
    onBufferStatusChanged: (kind: DataChannelKind, isLow: boolean) => void;
}
/**
 * Owns the engine's data channels: the three flow-controlled publisher channel wrappers (which
 * live for the engine's lifetime and have RTCDataChannel handles attached/detached as peer
 * connections come and go) plus the subscriber-side receive handles adopted by label.
 *
 * Handle turnover goes through {@link FlowControlledDataChannel.attach}/`detach`, which reject
 * parked headroom waiters as a built-in — there is no separate invalidation step to forget.
 */
export declare class DataChannelManager {
    readonly reliable: ReliableDataChannel;
    readonly lossy: LossyDataChannel;
    readonly dataTrack: LossyDataChannel;
    private reliableSub?;
    private lossySub?;
    private dataTrackSub?;
    private opts;
    constructor(opts: DataChannelManagerOptions);
    /** The flow-control wrapper for `kind`. */
    channelFor(kind: DataChannelKind): FlowControlledDataChannel;
    /** The raw RTCDataChannel handle for `kind`, publisher side by default. */
    getHandle(kind: DataChannelKind, subscriber?: boolean): RTCDataChannel | undefined;
    get hasPublisherChannels(): boolean;
    /**
     * Creates the three publisher data channels on the given transport, wires their handlers, and
     * attaches them to the wrappers — attaching rejects any waiters still parked on replaced
     * channel objects.
     */
    createPublisherChannels(pcManager: PCTransportManager): void;
    /**
     * Adopts a subscriber-side data channel by label, wiring the matching receive handler.
     * Returns false for labels this manager doesn't own.
     */
    adoptSubscriberChannel(channel: RTCDataChannel): boolean;
    /**
     * Tears down all channels for a peer-connection cleanup: rejects parked waiters (detach — the
     * spec allows `pc.close()` to transition channels to 'closed' without firing events, so waiting
     * for browser close events is not an option), strips handlers, closes the handles, and resets
     * the reliable session state.
     */
    teardown(): void;
}
//# sourceMappingURL=DataChannelManager.d.ts.map
