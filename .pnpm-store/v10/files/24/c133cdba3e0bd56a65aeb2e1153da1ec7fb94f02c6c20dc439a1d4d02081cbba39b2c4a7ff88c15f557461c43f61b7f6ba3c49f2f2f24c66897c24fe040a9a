import type TypedEventEmitter from 'typed-emitter';
import type RTCEngine from '../room/RTCEngine';
import type Room from '../room/Room';
import type { NonSharedUint8Array } from '../type-polyfills/non-shared-typed-arrays';
import { type E2EEManagerCallbacks } from './events';
import type { DecryptDataResponseMessage, E2EEManagerOptions, EncryptDataResponseMessage } from './types';
export interface BaseE2EEManager {
    setup(room: Room): void;
    setupEngine(engine: RTCEngine): void;
    isEnabled: boolean;
    isDataChannelEncryptionEnabled: boolean;
    setParticipantCryptorEnabled(enabled: boolean, participantIdentity: string): void;
    setSifTrailer(trailer: NonSharedUint8Array): void;
    encryptData(data: NonSharedUint8Array): Promise<EncryptDataResponseMessage['data']>;
    handleEncryptedData(payload: NonSharedUint8Array, iv: NonSharedUint8Array, participantIdentity: string, keyIndex: number): Promise<DecryptDataResponseMessage['data']>;
    on<E extends keyof E2EEManagerCallbacks>(event: E, listener: E2EEManagerCallbacks[E]): this;
    dispose?(): void;
}
declare const E2EEManager_base: new () => TypedEventEmitter<E2EEManagerCallbacks>;
/**
 * @experimental
 */
export declare class E2EEManager extends E2EEManager_base implements BaseE2EEManager {
    protected worker: Worker;
    protected room?: Room;
    private encryptionEnabled;
    private keyProvider;
    private decryptDataRequests;
    private encryptDataRequests;
    private dataChannelEncryptionEnabled;
    private unsubscribeLogLevel?;
    private log;
    get logContext(): {
        room: string | undefined;
        participant: string | undefined;
    };
    /**
     * Runs a cleanup callback once this manager is garbage collected. Lets the
     * log-level listener (held in a module-global Set on the main-thread logger)
     * fall out of scope even when the consumer forgets to call `dispose()`.
     */
    private static disposeRegistry;
    constructor(options: E2EEManagerOptions, dcEncryptionEnabled: boolean);
    get isEnabled(): boolean;
    get isDataChannelEncryptionEnabled(): boolean;
    /**
     * @internal
     */
    setup(room: Room): void;
    /**
     * Subscribe the current worker to main-thread `workerLogger` level changes,
     * without strongly retaining `this` or `this.worker` from the module-global
     * listener Set on the logger. See {@link disposeRegistry}.
     */
    private subscribeToLogLevelChanges;
    /**
     * @internal
     * Release the log-level subscription, reject any pending encrypt/decrypt
     * futures, and detach the worker message handlers. The worker itself is
     * caller-owned and is not terminated. Idempotent.
     */
    dispose(): void;
    /**
     * @internal
     */
    setParticipantCryptorEnabled(enabled: boolean, participantIdentity: string): void;
    /**
     * @internal
     */
    setSifTrailer(trailer: NonSharedUint8Array): void;
    private onWorkerMessage;
    private onWorkerError;
    private handleFrameMetadata;
    setupEngine(engine: RTCEngine): void;
    private setupEventListeners;
    encryptData(data: NonSharedUint8Array): Promise<EncryptDataResponseMessage['data']>;
    handleEncryptedData(payload: NonSharedUint8Array, iv: NonSharedUint8Array, participantIdentity: string, keyIndex: number): Promise<{
        uuid: string;
        payload: NonSharedUint8Array;
    } & {
        readonly __throws?: Error | undefined;
    }>;
    private postRatchetRequest;
    private postKey;
    private postEnable;
    private postRTPMap;
    private postSifTrailer;
    /**
     * Derive the participant's encryption state from one of its publications.
     * Publications without trackInfo are skipped rather than thrown on: throwing
     * inside the forEach above would leave every remaining participant without an
     * encryption state, and a cryptor with unknown state can no longer decrypt.
     */
    private setParticipantCryptorEnabledForPublication;
    private setupE2EEReceiver;
    private setupE2EESender;
    /**
     * Handles the given {@code RTCRtpReceiver} by creating a {@code TransformStream} which will inject
     * a frame decoder.
     *
     */
    private handleReceiver;
    /**
     * Handles the given {@code RTCRtpSender} by creating a {@code TransformStream} which will inject
     * a frame encoder.
     *
     */
    private handleSender;
}
export {};
//# sourceMappingURL=E2eeManager.d.ts.map