// colyseus.js@0.16.22
import { Reflection, Decoder, getDecoderStateCallbacks } from '@colyseus/schema';

//
// TODO: use a schema interface, which even having duplicate definitions, it could be used to get the callback proxy.
// 
// ```ts
//     export type SchemaCallbackProxy<RoomState> = (<T extends ISchema>(instance: T) => CallbackProxy<T>);
//     export function getStateCallbacks<T extends ISchema>(room: Room<T>) {
// ```
//
function getStateCallbacks(room) {
    try {
        // SchemaSerializer
        // @ts-ignore
        return getDecoderStateCallbacks(room['serializer'].decoder);
    }
    catch (e) {
        // NoneSerializer
        return undefined;
    }
}
class SchemaSerializer {
    state;
    decoder;
    setState(encodedState, it) {
        this.decoder.decode(encodedState, it);
    }
    getState() {
        return this.state;
    }
    patch(patches, it) {
        return this.decoder.decode(patches, it);
    }
    teardown() {
        this.decoder.root.clearRefs();
    }
    handshake(bytes, it) {
        if (this.state) {
            //
            // TODO: validate definitions against concreate this.state instance
            //
            Reflection.decode(bytes, it); // no-op
            this.decoder = new Decoder(this.state);
        }
        else {
            // initialize reflected state from server
            this.decoder = Reflection.decode(bytes, it);
            this.state = this.decoder.state;
        }
    }
}

export { SchemaSerializer, getStateCallbacks };
//# sourceMappingURL=SchemaSerializer.mjs.map
