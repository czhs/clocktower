// packages/core/src/serializer/SchemaSerializer.ts
import { Encoder, dumpChanges, Reflection } from "@colyseus/schema";
import { debugPatch } from "../Debug.mjs";
import { Protocol } from "../Protocol.mjs";
import { ClientState } from "../Transport.mjs";
var SHARED_VIEW = {};
var SchemaSerializer = class {
  constructor() {
    this.id = "schema";
    this.hasFilters = false;
    // flag to avoid re-encoding full state if no changes were made
    this.needFullEncode = true;
    // TODO: make this optional. allocating a new buffer for each room may not be always necessary.
    this.fullEncodeBuffer = Buffer.allocUnsafe(Encoder.BUFFER_SIZE);
    this.sharedOffsetCache = { offset: 0 };
  }
  reset(newState) {
    this.encoder = new Encoder(newState);
    this.hasFilters = this.encoder.context.hasFilters;
    this.fullEncodeBuffer[0] = Protocol.ROOM_STATE;
    if (this.hasFilters) {
      this.encodedViews = /* @__PURE__ */ new Map();
    }
  }
  getFullState(client) {
    if (this.needFullEncode || this.encoder.root.changes.length > 0 || // TODO: remove this check on 0.17
    // @ts-ignore
    this.encoder.root.changes.next !== void 0) {
      this.sharedOffsetCache = { offset: 1 };
      this.fullEncodeCache = this.encoder.encodeAll(this.sharedOffsetCache, this.fullEncodeBuffer);
      this.needFullEncode = false;
    }
    if (this.hasFilters && client?.view) {
      return this.encoder.encodeAllView(
        client.view,
        this.sharedOffsetCache.offset,
        { ...this.sharedOffsetCache },
        this.fullEncodeBuffer
      );
    } else {
      return this.fullEncodeCache;
    }
  }
  applyPatches(clients) {
    let numClients = clients.length;
    if (numClients === 0) {
      this.encoder.discardChanges();
      return false;
    }
    if (!this.encoder.hasChanges) {
      if (this.hasFilters) {
        const clientsWithViewChange = clients.filter((client) => {
          return client.state === ClientState.JOINED && client.view?.changes.size > 0;
        });
        if (clientsWithViewChange.length > 0) {
          const it2 = { offset: 1 };
          const sharedOffset = it2.offset;
          this.encoder.sharedBuffer[0] = Protocol.ROOM_STATE_PATCH;
          clientsWithViewChange.forEach((client) => {
            client.raw(this.encoder.encodeView(client.view, sharedOffset, it2));
          });
        }
      }
      return false;
    }
    this.needFullEncode = true;
    if (debugPatch.enabled) {
      debugPatch.dumpChanges = dumpChanges(this.encoder.state);
    }
    const it = { offset: 1 };
    this.encoder.sharedBuffer[0] = Protocol.ROOM_STATE_PATCH;
    const encodedChanges = this.encoder.encode(it);
    if (!this.hasFilters) {
      while (numClients--) {
        const client = clients[numClients];
        if (client.state !== ClientState.JOINED) {
          continue;
        }
        client.raw(encodedChanges);
      }
    } else {
      const sharedOffset = it.offset;
      while (numClients--) {
        const client = clients[numClients];
        if (client.state !== ClientState.JOINED) {
          continue;
        }
        const view = client.view || SHARED_VIEW;
        let encodedView = this.encodedViews.get(view);
        if (encodedView === void 0) {
          encodedView = view === SHARED_VIEW ? encodedChanges : this.encoder.encodeView(client.view, sharedOffset, it);
          this.encodedViews.set(view, encodedView);
        }
        client.raw(encodedView);
      }
      this.encodedViews.clear();
    }
    this.encoder.discardChanges();
    if (debugPatch.enabled) {
      debugPatch(
        "%d bytes sent to %d clients, %j",
        encodedChanges.length,
        clients.length,
        debugPatch.dumpChanges
      );
    }
    return true;
  }
  handshake() {
    if (!this.handshakeCache) {
      this.handshakeCache = this.encoder.state && Reflection.encode(this.encoder);
    }
    return this.handshakeCache;
  }
};
export {
  SchemaSerializer
};
