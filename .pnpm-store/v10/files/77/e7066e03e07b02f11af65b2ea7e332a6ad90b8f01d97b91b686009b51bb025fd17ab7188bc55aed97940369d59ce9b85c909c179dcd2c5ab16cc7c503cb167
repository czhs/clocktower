/**
 * Swaps the global `CompressionStream` / `DecompressionStream` away entirely, emulating a runtime
 * that predates the compression streams api. Returns a function that restores them.
 */
export declare function stubMissingCompressionStreams(): () => void;
/**
 * Swaps in global `CompressionStream` / `DecompressionStream` constructors that reject the
 * `deflate-raw` format the way Chromium 80-102 does (the api exists, but only `gzip` / `deflate`
 * are supported). Returns a function that restores the real ones.
 */
export declare function stubMissingDeflateRawSupport(): () => void;
//# sourceMappingURL=compressionStreamStubs.d.ts.map
