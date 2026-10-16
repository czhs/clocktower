import { RpcRequest } from '@livekit/protocol';
import type TypedEmitter from 'typed-emitter';
import { type StructuredLogger } from '../../../logger';
import { type TextStreamReader } from '../../data-stream/incoming/StreamReader';
import type OutgoingDataStreamManager from '../../data-stream/outgoing/OutgoingDataStreamManager';
import type Participant from '../../participant/Participant';
import { type RpcInvocationData } from '../utils';
import type { RpcServerManagerCallbacks } from './events';
declare const RpcServerManager_base: new () => TypedEmitter<RpcServerManagerCallbacks>;
/**
 * Manages the server (handler) side of RPC: processing incoming requests,
 * managing registered method handlers, and sending responses.
 * @internal
 */
export default class RpcServerManager extends RpcServerManager_base {
    private log;
    private outgoingDataStreamManager;
    private getRemoteParticipantClientProtocol;
    private rpcHandlers;
    constructor(log: StructuredLogger, outgoingDataStreamManager: OutgoingDataStreamManager, getRemoteParticipantClientProtocol: (identity: Participant['identity']) => number);
    registerRpcMethod(method: string, handler: (data: RpcInvocationData) => Promise<string>): void;
    unregisterRpcMethod(method: string): void;
    /**
     * Handle an incoming RPCRequest message containing a payload.
     * This handles "version 1" of rpc requests.
     * @internal
     */
    handleIncomingRpcRequest(callerIdentity: string, rpcRequest: RpcRequest): Promise<void>;
    /**
     * Handle an incoming data stream containing a RPC request payload.
     * This handles "version 2" of rpc requests.
     * @internal
     */
    handleIncomingDataStream(reader: TextStreamReader, callerIdentity: Participant['identity'], dataStreamAttrs: Record<string, string>): Promise<void>;
    private publishRpcAck;
    private publishRpcResponsePacket;
    /**
     * Send a successful RPC response payload, choosing the transport based on
     * the caller's client protocol version.
     */
    private publishRpcResponse;
}
export {};
//# sourceMappingURL=RpcServerManager.d.ts.map