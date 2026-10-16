// colyseus.js@0.16.22
'use strict';

var tslib = require('tslib');
var schema = require('@colyseus/schema');

class H3TransportTransport {
    constructor(events) {
        this.events = events;
        this.isOpen = false;
        this.lengthPrefixBuffer = new Uint8Array(9); // 9 bytes is the maximum length of a length prefix
    }
    connect(url, options = {}) {
        const wtOpts = options.fingerprint && ({
            // requireUnreliable: true,
            // congestionControl: "default", // "low-latency" || "throughput"
            serverCertificateHashes: [{
                    algorithm: 'sha-256',
                    value: new Uint8Array(options.fingerprint).buffer
                }]
        }) || undefined;
        this.wt = new WebTransport(url, wtOpts);
        this.wt.ready.then((e) => {
            console.log("WebTransport ready!", e);
            this.isOpen = true;
            this.unreliableReader = this.wt.datagrams.readable.getReader();
            this.unreliableWriter = this.wt.datagrams.writable.getWriter();
            const incomingBidi = this.wt.incomingBidirectionalStreams.getReader();
            incomingBidi.read().then((stream) => {
                this.reader = stream.value.readable.getReader();
                this.writer = stream.value.writable.getWriter();
                // immediately write room/sessionId for establishing the room connection
                this.sendSeatReservation(options.room.roomId, options.sessionId, options.reconnectionToken);
                // start reading incoming data
                this.readIncomingData();
                this.readIncomingUnreliableData();
            }).catch((e) => {
                console.error("failed to read incoming stream", e);
                console.error("TODO: close the connection");
            });
            // this.events.onopen(e);
        }).catch((e) => {
            // this.events.onerror(e);
            // this.events.onclose({ code: e.closeCode, reason: e.reason });
            console.log("WebTransport not ready!", e);
            this._close();
        });
        this.wt.closed.then((e) => {
            console.log("WebTransport closed w/ success", e);
            this.events.onclose({ code: e.closeCode, reason: e.reason });
        }).catch((e) => {
            console.log("WebTransport closed w/ error", e);
            this.events.onerror(e);
            this.events.onclose({ code: e.closeCode, reason: e.reason });
        }).finally(() => {
            this._close();
        });
    }
    send(data) {
        const prefixLength = schema.encode.number(this.lengthPrefixBuffer, data.length, { offset: 0 });
        const dataWithPrefixedLength = new Uint8Array(prefixLength + data.length);
        dataWithPrefixedLength.set(this.lengthPrefixBuffer.subarray(0, prefixLength), 0);
        dataWithPrefixedLength.set(data, prefixLength);
        this.writer.write(dataWithPrefixedLength);
    }
    sendUnreliable(data) {
        const prefixLength = schema.encode.number(this.lengthPrefixBuffer, data.length, { offset: 0 });
        const dataWithPrefixedLength = new Uint8Array(prefixLength + data.length);
        dataWithPrefixedLength.set(this.lengthPrefixBuffer.subarray(0, prefixLength), 0);
        dataWithPrefixedLength.set(data, prefixLength);
        this.unreliableWriter.write(dataWithPrefixedLength);
    }
    close(code, reason) {
        try {
            this.wt.close({ closeCode: code, reason: reason });
        }
        catch (e) {
            console.error(e);
        }
    }
    readIncomingData() {
        return tslib.__awaiter(this, void 0, void 0, function* () {
            let result;
            while (this.isOpen) {
                try {
                    result = yield this.reader.read();
                    //
                    // a single read may contain multiple messages
                    // each message is prefixed with its length
                    //
                    const messages = result.value;
                    const it = { offset: 0 };
                    do {
                        //
                        // QUESTION: should we buffer the message in case it's not fully read?
                        //
                        const length = schema.decode.number(messages, it);
                        this.events.onmessage({ data: messages.subarray(it.offset, it.offset + length) });
                        it.offset += length;
                    } while (it.offset < messages.length);
                }
                catch (e) {
                    if (e.message.indexOf("session is closed") === -1) {
                        console.error("H3Transport: failed to read incoming data", e);
                    }
                    break;
                }
                if (result.done) {
                    break;
                }
            }
        });
    }
    readIncomingUnreliableData() {
        return tslib.__awaiter(this, void 0, void 0, function* () {
            let result;
            while (this.isOpen) {
                try {
                    result = yield this.unreliableReader.read();
                    //
                    // a single read may contain multiple messages
                    // each message is prefixed with its length
                    //
                    const messages = result.value;
                    const it = { offset: 0 };
                    do {
                        //
                        // QUESTION: should we buffer the message in case it's not fully read?
                        //
                        const length = schema.decode.number(messages, it);
                        this.events.onmessage({ data: messages.subarray(it.offset, it.offset + length) });
                        it.offset += length;
                    } while (it.offset < messages.length);
                }
                catch (e) {
                    if (e.message.indexOf("session is closed") === -1) {
                        console.error("H3Transport: failed to read incoming data", e);
                    }
                    break;
                }
                if (result.done) {
                    break;
                }
            }
        });
    }
    sendSeatReservation(roomId, sessionId, reconnectionToken) {
        const it = { offset: 0 };
        const bytes = [];
        schema.encode.string(bytes, roomId, it);
        schema.encode.string(bytes, sessionId, it);
        if (reconnectionToken) {
            schema.encode.string(bytes, reconnectionToken, it);
        }
        this.writer.write(new Uint8Array(bytes).buffer);
    }
    _close() {
        this.isOpen = false;
    }
}

exports.H3TransportTransport = H3TransportTransport;
//# sourceMappingURL=H3Transport.js.map
