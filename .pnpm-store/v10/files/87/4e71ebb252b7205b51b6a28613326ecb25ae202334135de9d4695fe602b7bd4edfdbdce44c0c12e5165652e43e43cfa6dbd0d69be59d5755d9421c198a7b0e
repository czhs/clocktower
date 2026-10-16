import * as log from 'loglevel';
export declare enum LogLevel {
    trace = 0,
    debug = 1,
    info = 2,
    warn = 3,
    error = 4,
    silent = 5
}
export declare enum LoggerNames {
    Default = "livekit",
    Room = "livekit-room",
    TokenSource = "livekit-token-source",
    Participant = "livekit-participant",
    Track = "livekit-track",
    Publication = "livekit-track-publication",
    Engine = "livekit-engine",
    Signal = "livekit-signal",
    PCManager = "livekit-pc-manager",
    PCTransport = "livekit-pc-transport",
    E2EE = "lk-e2ee",
    DataTracks = "livekit-data-tracks",
    Region = "livekit-region",
    ICE = "livekit-ice",
    Stats = "livekit-stats"
}
type LogLevelString = keyof typeof LogLevel;
export type StructuredLogger = log.Logger & {
    trace: (msg: string, context?: object) => void;
    debug: (msg: string, context?: object) => void;
    info: (msg: string, context?: object) => void;
    warn: (msg: string, context?: object) => void;
    error: (msg: string, context?: object) => void;
    setDefaultLevel: (level: log.LogLevelDesc) => void;
    setLevel: (level: log.LogLevelDesc) => void;
    getLevel: () => number;
};
export type ContextProvider = () => object | undefined;
declare const _default: StructuredLogger;
export default _default;
/**
 * @internal
 *
 * Get a named logger. When `ctxFn` is supplied, every log call
 * automatically:
 * 1. prepends a `[key=value ...]` prefix derived from `ctxFn()` to the
 *    message string, so identifiers are visible in browser devtools
 *    without expanding the structured context object, and
 * 2. merges `ctxFn()` into the structured context passed to any
 *    `setLogExtension` consumer, so ingestion pipelines continue to
 *    receive the full metadata unchanged.
 */
export declare function getLogger(name: string, ctxFn?: ContextProvider): StructuredLogger;
export declare function setLogLevel(level: LogLevel | LogLevelString, loggerName?: LoggerNames): void;
export type LogExtension = (level: LogLevel, msg: string, context?: object) => void;
/**
 * use this to hook into the logging function to allow sending internal livekit logs to third party services
 * if set, the browser logs will lose their stacktrace information (see https://github.com/pimterry/loglevel#writing-plugins)
 */
export declare function setLogExtension(extension: LogExtension, logger?: StructuredLogger): void;
export declare const workerLogger: StructuredLogger;
/** @internal Subscribe to workerLogger level changes (so E2EE workers can be kept in sync). */
export declare function onWorkerLogLevelChanged(cb: (level: LogLevel) => void): () => void;
/** @internal Test-only accessor: current number of workerLogger level listeners. */
export declare function getWorkerLogLevelListenerCount(): number;
//# sourceMappingURL=logger.d.ts.map