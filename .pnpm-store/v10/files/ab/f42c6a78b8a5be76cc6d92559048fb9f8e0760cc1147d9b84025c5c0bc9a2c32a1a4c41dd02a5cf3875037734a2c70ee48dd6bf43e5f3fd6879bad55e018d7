import type { NonSharedUint8Array } from '../type-polyfills/non-shared-typed-arrays';
export interface DataPacketItem {
    data: NonSharedUint8Array;
    sequence: number;
    /**
     * Whether the packet has been handed to the data channel. Unsent packets are queued for the
     * resume replay (e.g. sends that landed in a reconnect window) and must never be trimmed by
     * {@link DataPacketBuffer.alignBufferedAmount}, which reasons about the channel's buffered
     * bytes — those only ever contain sent packets.
     */
    sent: boolean;
}
export declare class DataPacketBuffer {
    private buffer;
    private _totalSize;
    private _sentSize;
    push(item: DataPacketItem): void;
    pop(): DataPacketItem | undefined;
    getAll(): DataPacketItem[];
    /** Every queued packet not yet handed to the channel, in sequence order. */
    getUnsent(): DataPacketItem[];
    /** Marks a single queued packet as handed to the channel. */
    markSent(item: DataPacketItem): void;
    /**
     * Marks every queued packet as not-yet-sent. Used at the start of a resume replay: whatever is
     * still buffered was sent on the previous channel (or deferred) and must be re-handed to the
     * current one, so none of it counts as sent until the replay actually transmits it.
     */
    markAllUnsent(): void;
    popToSequence(sequence: number): void;
    alignBufferedAmount(bufferedAmount: number): void;
    get length(): number;
}
//# sourceMappingURL=dataPacketBuffer.d.ts.map