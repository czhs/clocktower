"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Decoder = void 0;
const annotations_1 = require("./annotations");
const consts_1 = require("./changes/consts");
const decode = require("./encoding/decode");
const spec_1 = require("./spec");
const ReferenceTracker_1 = require("./changes/ReferenceTracker");
const DecodeOperation_1 = require("./changes/DecodeOperation");
class Decoder {
    constructor(root, context) {
        this.currentRefId = 0;
        this.setRoot(root);
        this.context = context || new annotations_1.TypeContext(root.constructor);
        // console.log(">>>>>>>>>>>>>>>> Decoder types");
        // this.context.schemas.forEach((id, schema) => {
        //     console.log("type:", id, schema.name, Object.keys(schema[Symbol.metadata]));
        // });
    }
    setRoot(root) {
        this.root = root;
        this.refs = new ReferenceTracker_1.ReferenceTracker();
        this.refs.addRef(0, root);
    }
    decode(bytes, it = { offset: 0 }, ref = this.root) {
        // console.log("------------------- DECODE -------------------");
        const allChanges = [];
        const $root = this.refs;
        const totalBytes = bytes.length;
        this.currentRefId = 0;
        while (it.offset < totalBytes) {
            //
            // Peek ahead, check if it's a switch to a different structure
            //
            if (bytes[it.offset] == spec_1.SWITCH_TO_STRUCTURE) {
                it.offset++;
                this.currentRefId = decode.number(bytes, it);
                const nextRef = $root.refs.get(this.currentRefId);
                //
                // Trying to access a reference that haven't been decoded yet.
                //
                if (!nextRef) {
                    throw new Error(`"refId" not found: ${this.currentRefId}`);
                }
                ref = nextRef;
                continue;
            }
            const decoder = ref['constructor'][consts_1.$decoder];
            const result = decoder(this, bytes, it, ref, allChanges);
            if (result === DecodeOperation_1.DecodeState.DEFINITION_MISMATCH) {
                console.warn("@colyseus/schema: definition mismatch");
                //
                // keep skipping next bytes until reaches a known structure
                // by local decoder.
                //
                const nextIterator = { offset: it.offset };
                while (it.offset < totalBytes) {
                    if (decode.switchStructureCheck(bytes, it)) {
                        nextIterator.offset = it.offset + 1;
                        if ($root.refs.has(decode.number(bytes, nextIterator))) {
                            break;
                        }
                    }
                    it.offset++;
                }
                continue;
            }
        }
        // FIXME: trigger callbacks
        // this._triggerChanges(allChanges);
        // drop references of unused schemas
        $root.garbageCollectDeletedRefs();
        return allChanges;
    }
    /*
    private _triggerChanges(changes: DataChange[]) {
        const uniqueRefIds = new Set<number>();
        const $refs = this.refs.refs;

        for (let i = 0; i < changes.length; i++) {
            const change = changes[i];
            const refId = change.refId;
            const ref = $refs.get(refId);
            const $callbacks: Schema['$callbacks'] | SchemaDecoderCallbacks['$callbacks'] = ref['$callbacks'];

            //
            // trigger onRemove on child structure.
            //
            if (
                (change.op & OPERATION.DELETE) === OPERATION.DELETE &&
                change.previousValue instanceof Schema
            ) {
                change.previousValue['$callbacks']?.[OPERATION.DELETE]?.forEach(callback => callback());
            }

            // no callbacks defined, skip this structure!
            if (!$callbacks) { continue; }

            if (ref instanceof Schema) {
                if (!uniqueRefIds.has(refId)) {
                    try {
                        // trigger onChange
                        ($callbacks as Schema['$callbacks'])?.[OPERATION.REPLACE]?.forEach(callback =>
                            callback());

                    } catch (e) {
                        Schema.onError(e);
                    }
                }

                try {
                    if ($callbacks.hasOwnProperty(change.field)) {
                        $callbacks[change.field]?.forEach((callback) =>
                            callback(change.value, change.previousValue));
                    }

                } catch (e) {
                    Schema.onError(e);
                }

            } else {
                // is a collection of items

                if (change.op === OPERATION.ADD && change.previousValue === undefined) {
                    // triger onAdd
                    $callbacks[OPERATION.ADD]?.forEach(callback =>
                        callback(change.value, change.dynamicIndex ?? change.field));

                } else if (change.op === OPERATION.DELETE) {
                    //
                    // FIXME: `previousValue` should always be available.
                    // ADD + DELETE operations are still encoding DELETE operation.
                    //
                    if (change.previousValue !== undefined) {
                        // triger onRemove
                        $callbacks[OPERATION.DELETE]?.forEach(callback =>
                            callback(change.previousValue, change.dynamicIndex ?? change.field));
                    }

                } else if (change.op === OPERATION.DELETE_AND_ADD) {
                    // triger onRemove
                    if (change.previousValue !== undefined) {
                        $callbacks[OPERATION.DELETE]?.forEach(callback =>
                            callback(change.previousValue, change.dynamicIndex ?? change.field));
                    }

                    // triger onAdd
                    $callbacks[OPERATION.ADD]?.forEach(callback =>
                        callback(change.value, change.dynamicIndex ?? change.field));
                }

                // trigger onChange
                if (change.value !== change.previousValue) {
                    $callbacks[OPERATION.REPLACE]?.forEach(callback =>
                        callback(change.value, change.dynamicIndex ?? change.field));
                }
            }

            uniqueRefIds.add(refId);
        }

    }
    */
    getInstanceType(bytes, it, defaultType) {
        let type;
        if (bytes[it.offset] === spec_1.TYPE_ID) {
            it.offset++;
            const type_id = decode.number(bytes, it);
            type = this.context.get(type_id);
        }
        return type || defaultType;
    }
    createInstanceOfType(type) {
        // let instance: Schema = new (type as any)();
        // // assign root on $changes
        // instance[$changes].root = this.root[$changes].root;
        // return instance;
        return new type();
    }
}
exports.Decoder = Decoder;
//# sourceMappingURL=Decoder.js.map