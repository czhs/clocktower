import type { DataStream_Chunk } from '@livekit/protocol';
import type { BaseStreamInfo, ByteStreamInfo, TextStreamInfo } from '../../types';
export type BaseStreamReaderReadAllOpts = {
    /** An AbortSignal can be used to terminate reads early. */
    signal?: AbortSignal;
};
declare abstract class BaseStreamReader<T extends BaseStreamInfo> {
    protected reader: ReadableStream<DataStream_Chunk>;
    protected totalByteSize?: number;
    protected _info: T;
    protected bytesReceived: number;
    get info(): T;
    /** @internal */
    protected validateBytesReceived(doneReceiving?: boolean): void;
    constructor(info: T, stream: ReadableStream<DataStream_Chunk>, totalByteSize?: number);
    /**
     * Counts a chunk's bytes against `totalByteSize` and reports progress. Chunk ordering and
     * de-duplication happen upstream in the manager's `ensureOrderedChunks`, so every chunk reaching
     * here is new and in order.
     */
    protected handleChunkReceived(chunk: DataStream_Chunk): void;
    /**
     * @param progress - progress of the stream between 0 and 1. Undefined for streams of unknown size
     */
    onProgress?: (progress: number | undefined) => void;
    abstract readAll(opts?: BaseStreamReaderReadAllOpts): Promise<string | Array<Uint8Array>>;
}
export declare class ByteStreamReader extends BaseStreamReader<ByteStreamInfo> {
    signal?: AbortSignal;
    [Symbol.asyncIterator](): {
        next: () => Promise<IteratorResult<Uint8Array>>;
        return(): Promise<IteratorResult<Uint8Array>>;
    };
    /**
     * Injects an AbortSignal, which if aborted, will terminate the currently active
     * stream iteration operation.
     *
     * Note that when using AbortSignal.timeout(...), the timeout applies across
     * the whole iteration operation, not just one individual chunk read.
     */
    withAbortSignal(signal: AbortSignal): this;
    readAll(opts?: BaseStreamReaderReadAllOpts): Promise<Array<Uint8Array>>;
}
/**
 * A class to read chunks from a ReadableStream and decode them as UTF-8 text.
 *
 * NOTE: chunk-level `version` (resending a chunk at an already-received `chunkIndex` to supersede
 * it) is not supported. The reader used to rebuild the whole string from a per-index chunk map and
 * yield it as `TextStreamChunk.collected`, which made superseding work; 5d4a6346 (#1410, text auto
 * chunking) changed the iterator to yield each chunk's text as it arrives, and a streaming reader
 * cannot retract text it has already handed to the consumer. No sender emits a versioned chunk.
 */
export declare class TextStreamReader extends BaseStreamReader<TextStreamInfo> {
    signal?: AbortSignal;
    /**
     * Async iterator implementation to allow usage of `for await...of` syntax.
     * Yields each chunk's decoded text as it arrives - a delta, not the string accumulated so far.
     */
    [Symbol.asyncIterator](): {
        next: () => Promise<IteratorResult<string>>;
        return(): Promise<IteratorResult<string>>;
    };
    /**
     * Injects an AbortSignal, which if aborted, will terminate the currently active
     * stream iteration operation.
     *
     * Note that when using AbortSignal.timeout(...), the timeout applies across
     * the whole iteration operation, not just one individual chunk read.
     */
    withAbortSignal(signal: AbortSignal): this;
    readAll(opts?: BaseStreamReaderReadAllOpts): Promise<string>;
}
export type ByteStreamHandler = (reader: ByteStreamReader, participantInfo: {
    identity: string;
}) => void;
export type TextStreamHandler = (reader: TextStreamReader, participantInfo: {
    identity: string;
}) => void;
export {};
//# sourceMappingURL=StreamReader.d.ts.map
