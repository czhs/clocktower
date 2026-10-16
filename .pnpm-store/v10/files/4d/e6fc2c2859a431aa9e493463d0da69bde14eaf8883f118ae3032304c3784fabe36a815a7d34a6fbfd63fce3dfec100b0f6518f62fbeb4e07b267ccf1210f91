"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Encoder = void 0;
const annotations_1 = require("./annotations");
const consts_1 = require("./changes/consts");
const encode = require("./encoding/encode");
const spec_1 = require("./spec");
const ChangeTree_1 = require("./changes/ChangeTree");
class Encoder {
    constructor(root) {
        this.setRoot(root);
        //
        // TODO: cache and restore "Context" based on root schema
        // (to avoid creating a new context for each new room)
        //
        this.context = new annotations_1.TypeContext(root.constructor);
        // console.log(">>>>>>>>>>>>>>>> Encoder types");
        // this.context.schemas.forEach((id, schema) => {
        //     console.log("type:", id, schema.name, Object.keys(schema[Symbol.metadata]));
        // });
    }
    setRoot(root) {
        this.$root = new ChangeTree_1.Root();
        this.root = root;
        root[consts_1.$changes].setRoot(this.$root);
    }
    encode(encodeAll = false, bytes = [], useFilters = false) {
        const rootChangeTree = this.root[consts_1.$changes];
        // const changeTrees: ChangeTracker[] = Array.from(this.$root['currentQueue']);
        const changeTrees = this.$root.changes;
        const numChangeTrees = changeTrees.length;
        // let numChangeTrees = 1;
        // console.log("--------------------- ENCODE ----------------");
        // console.log("Encode order:", changeTrees.map((c) => c.ref['constructor'].name));
        for (let i = 0; i < numChangeTrees; i++) {
            const changeTree = changeTrees[i];
            const ref = changeTree.ref;
            // Generate unique refId for the ChangeTree.
            changeTree.ensureRefId();
            // root `refId` is skipped.
            if (changeTree !== rootChangeTree &&
                (changeTree.changed || encodeAll)) {
                encode.uint8(bytes, spec_1.SWITCH_TO_STRUCTURE);
                encode.number(bytes, changeTree.refId);
            }
            const changes = (encodeAll)
                ? changeTree.allChanges.values()
                : changeTree.changes.values();
            let change;
            while (!(change = changes.next()).done) {
                const operation = (encodeAll)
                    ? spec_1.OPERATION.ADD
                    : change.value.op;
                const fieldIndex = (encodeAll)
                    ? change.value
                    : change.value.index;
                const encoder = ref['constructor'][consts_1.$encoder];
                encoder(this, bytes, changeTree, fieldIndex, operation);
            }
            if (!encodeAll && !useFilters) {
                changeTree.discard();
            }
        }
        return bytes;
    }
    encodeAll(useFilters) {
        return this.encode(true, [], useFilters);
    }
    tryEncodeTypeId(bytes, baseType, targetType) {
        const baseTypeId = this.context.getTypeId(baseType);
        const targetTypeId = this.context.getTypeId(targetType);
        if (baseTypeId !== targetTypeId) {
            encode.uint8(bytes, spec_1.TYPE_ID);
            encode.number(bytes, targetTypeId);
        }
    }
}
exports.Encoder = Encoder;
//# sourceMappingURL=Encoder.js.map