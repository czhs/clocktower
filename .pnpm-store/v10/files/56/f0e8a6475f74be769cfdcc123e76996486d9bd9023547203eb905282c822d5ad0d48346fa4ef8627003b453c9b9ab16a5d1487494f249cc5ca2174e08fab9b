import { ClientInfo_Capability } from '@livekit/protocol';
import type { StructuredLogger } from '../../../logger';
import type RTCEngine from '../../RTCEngine';
import type { ByteStreamInfo, SendBytesOptions, SendFileOptions, SendTextOptions, StreamBytesOptions, StreamTextOptions, TextStreamInfo } from '../../types';
import { ByteStreamWriter, TextStreamWriter } from './StreamWriter';
/**
 * Manages sending custom user data via data channels.
 * @internal
 */
export default class OutgoingDataStreamManager {
    protected engine: RTCEngine;
    protected log: StructuredLogger;
    /** Returns the advertised client protocol of a remote participant, used to decide whether a
     * recipient can receive single-packet (inline) data streams. */
    protected getRemoteParticipantClientProtocol: (identity: string) => number;
    /** Returns the client capabilities a remote participant advertises, used to decide whether a
     * recipient can decompress a deflate-raw compressed stream. */
    protected getRemoteParticipantCapabilities: (identity: string) => Array<ClientInfo_Capability>;
    /** Returns the identities of every remote participant currently in the room, used to decide
     * whether a broadcast (no explicit destinations) can be sent inline. */
    protected getAllRemoteParticipantIdentities: () => Array<string>;
    constructor(engine: RTCEngine, log: StructuredLogger, getRemoteParticipantClientProtocol: (identity: string) => number, getRemoteParticipantCapabilities: (identity: string) => Array<ClientInfo_Capability>, getAllRemoteParticipantIdentities: () => Array<string>);
    setupEngine(engine: RTCEngine): void;
    /** {@inheritDoc LocalParticipant.sendText} */
    sendText(text: string, options?: SendTextOptions): Promise<TextStreamInfo>;
    /**
     * Sends a complete in-memory byte payload. Mirrors {@link sendText}'s semantics: when every
     * recipient supports data streams v2 the payload rides inline in a single header packet
     * (optionally deflate-raw compressed), otherwise it is sent as a (optionally compressed)
     * chunked byte stream. Unlike {@link sendFile}, the whole payload is already in memory, so the
     * inline single-packet fast path applies.
     */
    sendBytes(bytes: Uint8Array, options?: SendBytesOptions): Promise<ByteStreamInfo>;
    /**
     * Returns true only if every recipient is known to support data streams v2 (single-packet inline
     * streams and compression). For a targeted send this checks the named destination identities; for
     * a broadcast (no explicit destinations) it checks every remote participant currently in the room.
     * An empty room (nobody to receive) is considered eligible.
     */
    private allRecipientsSupportV2;
    /**
     * Returns true only if every recipient advertises the deflate-raw compression capability (so it
     * can decompress a compressed stream). Resolved the same way as {@link allRecipientsSupportV2}:
     * named destinations, or every remote participant for a broadcast; an empty room is eligible.
     */
    private allRecipientsSupportCompression;
    /**
     * Shared chunked-stream send for `sendText`/`sendFile`: sends the prebuilt header packet, then
     * forwards `source` (optionally deflate-raw compressed) as `streamChunk` packets re-chunked to
     * the MTU budget with contiguous indices, then sends the trailer. The source is consumed
     * incrementally, so a `file.stream()` is never buffered in full. The platform compressor can't
     * flush mid-stream, so compression is only used when the whole payload is available as a stream
     * up front (not for incremental writers like `streamText`/`streamBytes`).
     */
    private sendChunkedByteStream;
    /**
     * @internal
     */
    streamText(options?: StreamTextOptions): Promise<TextStreamWriter>;
    sendFile(file: File, options?: SendFileOptions): Promise<{
        id: string;
    }>;
    /**
     * Streams a file as a chunked byte stream, compressed (deflate-raw) when the runtime supports it
     * and every recipient is on data streams v2. The file is piped `file.stream()` →
     * (`CompressionStream`) → chunk packets via {@link sendChunkedByteStream}, so it is never fully
     * buffered in memory — unlike {@link sendBytes}, there is no inline single-packet fast path for
     * files (the compressed size can't be known up front without buffering the whole file).
     */
    private _sendFile;
    streamBytes(options?: StreamBytesOptions): Promise<ByteStreamWriter>;
}
//# sourceMappingURL=OutgoingDataStreamManager.d.ts.map
