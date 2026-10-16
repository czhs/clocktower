/**
 * Compression helpers for data streams. The buffered deflate-raw variant ({@link deflateRawCompress})
 * is for the inline (single-packet) case where the payload is small and bounded;
 * {@link deflateRawTransform} / {@link inflateRawTransform} serve the chunked (multi-packet)
 * `sendText`/`sendBytes`/`sendFile` paths, streaming the bytes through without buffering the whole
 * payload.
 *
 * These operate on bytes (not strings) so a single set of helpers serves both text and byte streams;
 * the `TextEncoder`/`TextDecoder` boundary lives at the manager/reader edges.
 *
 * Both streaming variants are exposed as `ReadableWritablePair`s so they drop straight into a
 * `pipeThrough` chain. Each needs one localized cast to bridge a DOM lib-type mismatch: the platform
 * `CompressionStream`/`DecompressionStream` type their `writable` as `WritableStream<BufferSource>`
 * (a wider element type than `Uint8Array`), and `WritableStream<W>` is covariant in `W`, so neither
 * is structurally a `ReadableWritablePair<Uint8Array, Uint8Array>` without help.
 *
 * @internal
 */
import { type NonSharedUint8Array } from '../../type-polyfills/non-shared-typed-arrays';
/**
 * A `deflate-raw` compression transform (inverse of {@link inflateRawTransform}): pipe a byte stream
 * through it to get the compressed bytes without buffering the whole payload. Used for the chunked
 * `sendText`/`sendBytes`/`sendFile` paths, where the full payload is known up front but is streamed
 * (e.g. from `file.stream()`) rather than held in memory.
 */
export declare function deflateRawTransform(): ReadableWritablePair<NonSharedUint8Array, NonSharedUint8Array>;
/**
 * A `deflate-raw` decompression transform (inverse of {@link deflateRawTransform}): pipe a
 * stream of compressed bytes through it to get the decompressed bytes. Inflate emits output greedily,
 * so as long as the sender flushed at write boundaries each write's content is produced as soon as
 * its compressed bytes arrive.
 */
export declare function inflateRawTransform(): ReadableWritablePair<NonSharedUint8Array, NonSharedUint8Array>;
/** deflate-raw compresses a byte array in full. Use for inline payloads; prefer the streaming
 * path for the chunked case. */
export declare function deflateRawCompress(data: NonSharedUint8Array): Promise<NonSharedUint8Array>;
/**
 * Decompresses a raw-deflate byte array in full (inverse of {@link deflateRawCompress}).
 * `maxByteLength` bounds the decompressed output (decompression-bomb guard); exceeding it rejects
 * with a `PayloadTooLarge` error.
 */
export declare function deflateRawDecompress(data: NonSharedUint8Array, maxByteLength?: number): Promise<NonSharedUint8Array>;
/**
 * Drains a byte stream, concatenating all of its chunks into a single array. When
 * `maxByteLength` is given, drops the stream and throws `PayloadTooLarge` as soon as the
 * accumulated output exceeds it.
 */
export declare function collect(stream: ReadableStream<NonSharedUint8Array>, maxByteLength?: number): Promise<NonSharedUint8Array>;
//# sourceMappingURL=compression.d.ts.map