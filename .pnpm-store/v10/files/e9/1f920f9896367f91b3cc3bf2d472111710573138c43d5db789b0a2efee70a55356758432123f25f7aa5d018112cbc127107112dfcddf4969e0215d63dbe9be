"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeKeyValueOperation = exports.encodeSchemaOperation = exports.encodeValue = exports.encodePrimitiveType = void 0;
const spec_1 = require("../spec");
const consts_1 = require("./consts");
const typeRegistry_1 = require("../types/typeRegistry");
const encode = require("../encoding/encode");
const assert_1 = require("../encoding/assert");
const MapSchema_1 = require("../types/MapSchema");
function encodePrimitiveType(type, bytes, value, klass, field) {
    (0, assert_1.assertType)(value, type, klass, field);
    const encodeFunc = encode[type];
    if (encodeFunc) {
        encodeFunc(bytes, value);
    }
    else {
        throw new assert_1.EncodeSchemaError(`a '${type}' was expected, but ${value} was provided in ${klass.constructor.name}#${field}`);
    }
}
exports.encodePrimitiveType = encodePrimitiveType;
function encodeValue(encoder, bytes, ref, type, value, field, operation) {
    if (type[Symbol.metadata] !== undefined) {
        (0, assert_1.assertInstanceType)(value, type, ref, field);
        //
        // Encode refId for this instance.
        // The actual instance is going to be encoded on next `changeTree` iteration.
        //
        encode.number(bytes, value[consts_1.$changes].refId);
        // Try to encode inherited TYPE_ID if it's an ADD operation.
        if ((operation & spec_1.OPERATION.ADD) === spec_1.OPERATION.ADD) {
            encoder.tryEncodeTypeId(bytes, type, value.constructor);
        }
    }
    else if (typeof (type) === "string") {
        //
        // Primitive values
        //
        encodePrimitiveType(type, bytes, value, ref, field);
    }
    else {
        //
        // Custom type (MapSchema, ArraySchema, etc)
        //
        const definition = (0, typeRegistry_1.getType)(Object.keys(type)[0]);
        //
        // ensure a ArraySchema has been provided
        //
        (0, assert_1.assertInstanceType)(ref[field], definition.constructor, ref, field);
        //
        // Encode refId for this instance.
        // The actual instance is going to be encoded on next `changeTree` iteration.
        //
        encode.number(bytes, value[consts_1.$changes].refId);
    }
}
exports.encodeValue = encodeValue;
/**
 * Used for Schema instances.
 * @private
 */
const encodeSchemaOperation = function (encoder, bytes, changeTree, index, operation) {
    const ref = changeTree.ref;
    const metadata = ref['constructor'][Symbol.metadata];
    const field = metadata[index];
    const type = metadata[field].type;
    const value = ref[field];
    // "compress" field index + operation
    encode.uint8(bytes, (index | operation));
    // ensure refId for the value
    if (value && value[consts_1.$changes]) {
        value[consts_1.$changes].ensureRefId();
    }
    if (operation === spec_1.OPERATION.TOUCH) {
        return;
    }
    // TODO: inline this function call small performance gain
    encodeValue(encoder, bytes, ref, type, value, field, operation);
};
exports.encodeSchemaOperation = encodeSchemaOperation;
/**
 * Used for collections (MapSchema, ArraySchema, etc.)
 * @private
 */
const encodeKeyValueOperation = function (encoder, bytes, changeTree, field, operation) {
    const ref = changeTree.ref;
    // encode field index + operation
    if (operation !== spec_1.OPERATION.TOUCH) {
        encode.uint8(bytes, operation);
        // custom operations
        if (operation === spec_1.OPERATION.CLEAR) {
            return;
        }
        // indexed operations
        encode.number(bytes, field);
    }
    //
    // encode "alias" for dynamic fields (maps)
    //
    if ((operation & spec_1.OPERATION.ADD) == spec_1.OPERATION.ADD) { // ADD or DELETE_AND_ADD
        if (ref instanceof MapSchema_1.MapSchema) {
            //
            // MapSchema dynamic key
            //
            const dynamicIndex = changeTree.ref['$indexes'].get(field);
            encode.string(bytes, dynamicIndex);
        }
    }
    if (operation === spec_1.OPERATION.DELETE) {
        //
        // TODO: delete from filter cache data.
        //
        // if (useFilters) {
        //     delete changeTree.caches[fieldIndex];
        // }
        return;
    }
    const type = changeTree.getType(field);
    const value = changeTree.getValue(field);
    // ensure refId for the value
    if (value && value[consts_1.$changes]) {
        value[consts_1.$changes].ensureRefId();
    }
    if (operation === spec_1.OPERATION.TOUCH) {
        return;
    }
    // TODO: inline this function call small performance gain
    encodeValue(encoder, bytes, ref, type, value, field, operation);
};
exports.encodeKeyValueOperation = encodeKeyValueOperation;
//# sourceMappingURL=EncodeOperation.js.map