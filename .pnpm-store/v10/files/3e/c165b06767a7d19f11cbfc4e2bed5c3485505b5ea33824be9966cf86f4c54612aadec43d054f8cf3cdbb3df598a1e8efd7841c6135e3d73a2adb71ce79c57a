import { DataPacket, DataStream_CompressionType, DataStream_Header } from '@livekit/protocol';
import type { ByteStreamInfo, StreamTextOptions, TextStreamInfo } from '../../types';
/** The data-streams-v2 wire signals carried directly on the header: the compression flag and the
 * inline single-packet payload. Both used to live in reserved header attributes; they are now
 * first-class protobuf fields on `DataStream.Header`. */
export interface StreamHeaderV2Fields {
    /** Compression applied to the inline/chunked payload. Defaults to `NONE` when omitted. */
    compression?: DataStream_CompressionType;
    /** The full payload smuggled into the header for single-packet (inline) sends. */
    inlineContent?: Uint8Array;
}
/** Builds the `DataStream_Header` for a text stream from its info and stream options. */
export declare function buildTextStreamHeader(info: TextStreamInfo, options?: Pick<StreamTextOptions, 'version' | 'replyToStreamId' | 'type'>, v2?: StreamHeaderV2Fields): DataStream_Header;
/** Builds the `DataStream_Header` for a byte stream from its info. */
export declare function buildByteStreamHeader(info: ByteStreamInfo, v2?: StreamHeaderV2Fields): DataStream_Header;
/** Wraps a `DataStream_Header` in a `DataPacket` ready to be sent over a data channel. */
export declare function createStreamHeaderPacket(header: DataStream_Header, destinationIdentities?: Array<string>): DataPacket;
//# sourceMappingURL=header-utils.d.ts.map