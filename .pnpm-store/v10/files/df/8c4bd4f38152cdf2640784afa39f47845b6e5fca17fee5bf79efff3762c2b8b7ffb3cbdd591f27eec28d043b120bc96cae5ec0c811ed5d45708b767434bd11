"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeArray = exports.encodeKeyValueOperation = exports.encodeSchemaOperation = void 0;
exports.encodeValue = encodeValue;
const spec_1 = require("../encoding/spec");
const symbols_1 = require("../types/symbols");
const encode_1 = require("../encoding/encode");
function encodeValue(encoder, bytes, type, value, operation, it) {
    if (typeof (type) === "string") {
        encode_1.encode[type]?.(bytes, value, it);
    }
    else if (type[Symbol.metadata] !== undefined) {
        //
        // Encode refId for this instance.
        // The actual instance is going to be encoded on next `changeTree` iteration.
        //
        encode_1.encode.number(bytes, value[symbols_1.$changes].refId, it);
        // Try to encode inherited TYPE_ID if it's an ADD operation.
        if ((operation & spec_1.OPERATION.ADD) === spec_1.OPERATION.ADD) {
            encoder.tryEncodeTypeId(bytes, type, value.constructor, it);
        }
    }
    else {
        //
        // Encode refId for this instance.
        // The actual instance is going to be encoded on next `changeTree` iteration.
        //
        encode_1.encode.number(bytes, value[symbols_1.$changes].refId, it);
    }
}
/**
 * Used for Schema instances.
 * @private
 */
const encodeSchemaOperation = function (encoder, bytes, changeTree, index, operation, it, _, __, metadata) {
    // "compress" field index + operation
    bytes[it.offset++] = (index | operation) & 255;
    // Do not encode value for DELETE operations
    if (operation === spec_1.OPERATION.DELETE) {
        return;
    }
    const ref = changeTree.ref;
    const field = metadata[index];
    // TODO: inline this function call small performance gain
    encodeValue(encoder, bytes, metadata[index].type, ref[field.name], operation, it);
};
exports.encodeSchemaOperation = encodeSchemaOperation;
/**
 * Used for collections (MapSchema, CollectionSchema, SetSchema)
 * @private
 */
const encodeKeyValueOperation = function (encoder, bytes, changeTree, index, operation, it) {
    // encode operation
    bytes[it.offset++] = operation & 255;
    // encode index
    encode_1.encode.number(bytes, index, it);
    // Do not encode value for DELETE operations
    if (operation === spec_1.OPERATION.DELETE) {
        return;
    }
    const ref = changeTree.ref;
    //
    // encode "alias" for dynamic fields (maps)
    //
    if ((operation & spec_1.OPERATION.ADD) === spec_1.OPERATION.ADD) { // ADD or DELETE_AND_ADD
        if (typeof (ref['set']) === "function") {
            //
            // MapSchema dynamic key
            //
            const dynamicIndex = changeTree.ref['$indexes'].get(index);
            encode_1.encode.string(bytes, dynamicIndex, it);
        }
    }
    const type = ref[symbols_1.$childType];
    const value = ref[symbols_1.$getByIndex](index);
    // try { throw new Error(); } catch (e) {
    //     // only print if not coming from Reflection.ts
    //     if (!e.stack.includes("src/Reflection.ts")) {
    //         console.log("encodeKeyValueOperation -> ", {
    //             ref: changeTree.ref.constructor.name,
    //             field,
    //             operation: OPERATION[operation],
    //             value: value?.toJSON(),
    //             items: ref.toJSON(),
    //         });
    //     }
    // }
    // TODO: inline this function call small performance gain
    encodeValue(encoder, bytes, type, value, operation, it);
};
exports.encodeKeyValueOperation = encodeKeyValueOperation;
/**
 * Used for collections (MapSchema, ArraySchema, etc.)
 * @private
 */
const encodeArray = function (encoder, bytes, changeTree, field, operation, it, isEncodeAll, hasView) {
    const ref = changeTree.ref;
    const useOperationByRefId = hasView && changeTree.isFiltered && (typeof (changeTree.getType(field)) !== "string");
    let refOrIndex;
    if (useOperationByRefId) {
        const item = ref['tmpItems'][field];
        // Skip encoding if item is undefined (e.g. when clear() is called)
        if (!item) {
            return;
        }
        refOrIndex = item[symbols_1.$changes].refId;
        if (operation === spec_1.OPERATION.DELETE) {
            operation = spec_1.OPERATION.DELETE_BY_REFID;
        }
        else if (operation === spec_1.OPERATION.ADD) {
            operation = spec_1.OPERATION.ADD_BY_REFID;
        }
    }
    else {
        refOrIndex = field;
    }
    // encode operation
    bytes[it.offset++] = operation & 255;
    // encode index
    encode_1.encode.number(bytes, refOrIndex, it);
    // Do not encode value for DELETE operations
    if (operation === spec_1.OPERATION.DELETE || operation === spec_1.OPERATION.DELETE_BY_REFID) {
        return;
    }
    const type = changeTree.getType(field);
    const value = changeTree.getValue(field, isEncodeAll);
    // console.log({ type, field, value });
    // console.log("encodeArray -> ", {
    //     ref: changeTree.ref.constructor.name,
    //     field,
    //     operation: OPERATION[operation],
    //     value: value?.toJSON(),
    //     items: ref.toJSON(),
    // });
    // TODO: inline this function call small performance gain
    encodeValue(encoder, bytes, type, value, operation, it);
};
exports.encodeArray = encodeArray;
//# sourceMappingURL=EncodeOperation.js.map