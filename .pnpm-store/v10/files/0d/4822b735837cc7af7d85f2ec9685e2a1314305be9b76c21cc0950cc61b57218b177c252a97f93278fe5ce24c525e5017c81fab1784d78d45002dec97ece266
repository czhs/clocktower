import { ITransport, ITransportEventMap } from "./ITransport";
export declare class H3TransportTransport implements ITransport {
    events: ITransportEventMap;
    wt: WebTransport;
    isOpen: boolean;
    reader: ReadableStreamDefaultReader;
    writer: WritableStreamDefaultWriter;
    unreliableReader: ReadableStreamDefaultReader<Uint8Array>;
    unreliableWriter: WritableStreamDefaultWriter<Uint8Array>;
    private lengthPrefixBuffer;
    constructor(events: ITransportEventMap);
    connect(url: string, options?: any): void;
    send(data: Buffer | Uint8Array): void;
    sendUnreliable(data: Buffer | Uint8Array): void;
    close(code?: number, reason?: string): void;
    protected readIncomingData(): Promise<void>;
    protected readIncomingUnreliableData(): Promise<void>;
    protected sendSeatReservation(roomId: string, sessionId: string, reconnectionToken?: string): void;
    protected _close(): void;
}
