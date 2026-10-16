"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Decoder = void 0;
const TypeContext_1 = require("../types/TypeContext");
const symbols_1 = require("../types/symbols");
const decode_1 = require("../encoding/decode");
const spec_1 = require("../encoding/spec");
const ReferenceTracker_1 = require("./ReferenceTracker");
const DecodeOperation_1 = require("./DecodeOperation");
class Decoder {
    constructor(root, context) {
        this.currentRefId = 0;
        this.setState(root);
        this.context = context || new TypeContext_1.TypeContext(root.constructor);
        // console.log(">>>>>>>>>>>>>>>> Decoder types");
        // this.context.schemas.forEach((id, schema) => {
        //     console.log("type:", id, schema.name, Object.keys(schema[Symbol.metadata]));
        // });
    }
    setState(root) {
        this.state = root;
        this.root = new ReferenceTracker_1.ReferenceTracker();
        this.root.addRef(0, root);
    }
    decode(bytes, it = { offset: 0 }, ref = this.state) {
        const allChanges = [];
        const $root = this.root;
        const totalBytes = bytes.byteLength;
        let decoder = ref['constructor'][symbols_1.$decoder];
        this.currentRefId = 0;
        while (it.offset < totalBytes) {
            //
            // Peek ahead, check if it's a switch to a different structure
            //
            if (bytes[it.offset] == spec_1.SWITCH_TO_STRUCTURE) {
                it.offset++;
                ref[symbols_1.$onDecodeEnd]?.();
                const nextRefId = decode_1.decode.number(bytes, it);
                const nextRef = $root.refs.get(nextRefId);
                //
                // Trying to access a reference that haven't been decoded yet.
                //
                if (!nextRef) {
                    // throw new Error(`"refId" not found: ${nextRefId}`);
                    console.error(`"refId" not found: ${nextRefId}`, { previousRef: ref, previousRefId: this.currentRefId });
                    console.warn("Please report this issue to the developers.");
                    this.skipCurrentStructure(bytes, it, totalBytes);
                }
                else {
                    ref = nextRef;
                    decoder = ref.constructor[symbols_1.$decoder];
                    this.currentRefId = nextRefId;
                }
                continue;
            }
            const result = decoder(this, bytes, it, ref, allChanges);
            if (result === DecodeOperation_1.DEFINITION_MISMATCH) {
                console.warn("@colyseus/schema: definition mismatch");
                this.skipCurrentStructure(bytes, it, totalBytes);
                continue;
            }
        }
        // FIXME: DRY with SWITCH_TO_STRUCTURE block.
        ref[symbols_1.$onDecodeEnd]?.();
        // trigger changes
        this.triggerChanges?.(allChanges);
        // drop references of unused schemas
        $root.garbageCollectDeletedRefs();
        return allChanges;
    }
    skipCurrentStructure(bytes, it, totalBytes) {
        //
        // keep skipping next bytes until reaches a known structure
        // by local decoder.
        //
        const nextIterator = { offset: it.offset };
        while (it.offset < totalBytes) {
            if (bytes[it.offset] === spec_1.SWITCH_TO_STRUCTURE) {
                nextIterator.offset = it.offset + 1;
                if (this.root.refs.has(decode_1.decode.number(bytes, nextIterator))) {
                    break;
                }
            }
            it.offset++;
        }
    }
    getInstanceType(bytes, it, defaultType) {
        let type;
        if (bytes[it.offset] === spec_1.TYPE_ID) {
            it.offset++;
            const type_id = decode_1.decode.number(bytes, it);
            type = this.context.get(type_id);
        }
        return type || defaultType;
    }
    createInstanceOfType(type) {
        return new type();
    }
    removeChildRefs(ref, allChanges) {
        const needRemoveRef = typeof (ref[symbols_1.$childType]) !== "string";
        const refId = this.root.refIds.get(ref);
        ref.forEach((value, key) => {
            allChanges.push({
                ref: ref,
                refId,
                op: spec_1.OPERATION.DELETE,
                field: key,
                value: undefined,
                previousValue: value
            });
            if (needRemoveRef) {
                this.root.removeRef(this.root.refIds.get(value));
            }
        });
    }
}
exports.Decoder = Decoder;
//# sourceMappingURL=Decoder.js.map