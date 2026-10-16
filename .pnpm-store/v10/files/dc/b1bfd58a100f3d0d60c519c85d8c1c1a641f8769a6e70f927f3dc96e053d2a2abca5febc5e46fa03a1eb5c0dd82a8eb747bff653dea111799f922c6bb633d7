import type { NonSharedUint8Array } from '../../type-polyfills/non-shared-typed-arrays';
import { DataTrackExtensions } from './packet/extensions';
/** A pair of payload bytes and packet extensions which can be fed into a {@link DataTrackPacketizer}. */
export type DataTrackFrame = {
    payload: NonSharedUint8Array;
    userTimestamp?: bigint;
};
/** An internal representation o data track frame which contains all SFU metadata. */
export type DataTrackFrameInternal = {
    payload: NonSharedUint8Array;
    extensions: DataTrackExtensions;
};
export declare const DataTrackFrameInternal: {
    from(frame: DataTrackFrame): {
        payload: Uint8Array<ArrayBuffer>;
        extensions: DataTrackExtensions;
    };
    /** Converts from a DataTrackFrameInternal -> DataTrackFrame. Some internal information is
     * discarded like e2ee encrption extension data. */
    lossyIntoFrame(frame: DataTrackFrameInternal): DataTrackFrame;
};
//# sourceMappingURL=frame.d.ts.map