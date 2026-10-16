import type TypedEmitter from 'typed-emitter';
import type { StructuredLogger } from '../../../logger';
import type { TextStreamReader } from '../../data-stream/incoming/StreamReader';
import type OutgoingDataStreamManager from '../../data-stream/outgoing/OutgoingDataStreamManager';
import type Participant from '../../participant/Participant';
import type { PerformRpcParams } from '../utils';
import { RpcError } from '../utils';
import type { RpcClientManagerCallbacks } from './events';
declare const RpcClientManager_base: new () => TypedEmitter<RpcClientManagerCallbacks>;
/**
 * Manages the client (caller) side of RPC: sending requests, tracking pending
 * ack/response state, and handling incoming ack/response packets.
 * @internal
 */
export default class RpcClientManager extends RpcClientManager_base {
    private log;
    private outgoingDataStreamManager;
    private getRemoteParticipantClientProtocol;
    private getServerVersion;
    private pendingAcks;
    private pendingResponses;
    constructor(log: StructuredLogger, outgoingDataStreamManager: OutgoingDataStreamManager, getRemoteParticipantClientProtocol: (identity: Participant['identity']) => number, getServerVersion: () => string | undefined);
    performRpc({ destinationIdentity, method, payload, responseTimeout: responseTimeoutMs, }: PerformRpcParams): Promise<[
        id: string,
        completionPromise: Promise<string>
    ]>;
    private publishRpcRequest;
    /**
     * Handle an incoming data stream containing an RPC response payload.
     * @internal
     */
    handleIncomingDataStream(reader: TextStreamReader, senderIdentity: Participant['identity'], attributes: Record<string, string>): Promise<void>;
    /** @internal */
    handleIncomingRpcResponseSuccess(requestId: string, payload: string): void;
    /** @internal */
    handleIncomingRpcResponseFailure(requestId: string, error: RpcError): void;
    /** @internal */
    handleIncomingRpcAck(requestId: string): void;
    /** @internal */
    handleParticipantDisconnected(participantIdentity: string): void;
}
export {};
//# sourceMappingURL=RpcClientManager.d.ts.map
