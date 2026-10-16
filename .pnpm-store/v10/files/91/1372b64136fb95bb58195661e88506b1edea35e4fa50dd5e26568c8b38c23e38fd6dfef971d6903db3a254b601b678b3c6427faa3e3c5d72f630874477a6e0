import type { NonSharedUint8Array } from '../../type-polyfills/non-shared-typed-arrays';
import type { DecodeRatchetOptions, KeySet } from '../types';
import type { ParticipantKeyHandler } from './ParticipantKeyHandler';
export declare class DataCryptor {
    private static sendCount;
    private static makeIV;
    static encrypt(data: NonSharedUint8Array, keys: ParticipantKeyHandler): Promise<{
        payload: NonSharedUint8Array;
        iv: NonSharedUint8Array;
        keyIndex: number;
    }>;
    static decrypt(data: NonSharedUint8Array, iv: NonSharedUint8Array, keys: ParticipantKeyHandler, keyIndex?: number, initialMaterial?: KeySet, ratchetOpts?: DecodeRatchetOptions): Promise<{
        payload: NonSharedUint8Array;
    }>;
}
//# sourceMappingURL=DataCryptor.d.ts.map
