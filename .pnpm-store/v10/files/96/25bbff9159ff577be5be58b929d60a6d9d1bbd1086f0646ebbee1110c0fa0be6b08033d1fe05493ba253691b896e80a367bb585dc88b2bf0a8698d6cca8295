"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeArray = exports.decodeKeyValueOperation = exports.decodeSchemaOperation = exports.DEFINITION_MISMATCH = void 0;
exports.decodeValue = decodeValue;
const spec_1 = require("../encoding/spec");
const Schema_1 = require("../Schema");
const decode_1 = require("../encoding/decode");
const symbols_1 = require("../types/symbols");
const registry_1 = require("../types/registry");
exports.DEFINITION_MISMATCH = -1;
function decodeValue(decoder, operation, ref, index, type, bytes, it, allChanges) {
    const $root = decoder.root;
    const previousValue = ref[symbols_1.$getByIndex](index);
    let value;
    if ((operation & spec_1.OPERATION.DELETE) === spec_1.OPERATION.DELETE) {
        // Flag `refId` for garbage collection.
        const previousRefId = $root.refIds.get(previousValue);
        if (previousRefId !== undefined) {
            $root.removeRef(previousRefId);
        }
        //
        // Delete operations
        //
        if (operation !== spec_1.OPERATION.DELETE_AND_ADD) {
            ref[symbols_1.$deleteByIndex](index);
        }
        value = undefined;
    }
    if (operation === spec_1.OPERATION.DELETE) {
        //
        // Don't do anything
        //
    }
    else if (Schema_1.Schema.is(type)) {
        const refId = decode_1.decode.number(bytes, it);
        value = $root.refs.get(refId);
        if ((operation & spec_1.OPERATION.ADD) === spec_1.OPERATION.ADD) {
            const childType = decoder.getInstanceType(bytes, it, type);
            if (!value) {
                value = decoder.createInstanceOfType(childType);
            }
            $root.addRef(refId, value, (value !== previousValue || // increment ref count if value has changed
                (operation === spec_1.OPERATION.DELETE_AND_ADD && value === previousValue) // increment ref count if the same instance is being added again
            ));
        }
    }
    else if (typeof (type) === "string") {
        //
        // primitive value (number, string, boolean, etc)
        //
        value = decode_1.decode[type](bytes, it);
    }
    else {
        const typeDef = (0, registry_1.getType)(Object.keys(type)[0]);
        const refId = decode_1.decode.number(bytes, it);
        const valueRef = ($root.refs.has(refId))
            ? previousValue || $root.refs.get(refId)
            : new typeDef.constructor();
        value = valueRef.clone(true);
        value[symbols_1.$childType] = Object.values(type)[0]; // cache childType for ArraySchema and MapSchema
        if (previousValue) {
            let previousRefId = $root.refIds.get(previousValue);
            if (previousRefId !== undefined && refId !== previousRefId) {
                //
                // enqueue onRemove if structure has been replaced.
                //
                const entries = previousValue.entries();
                let iter;
                while ((iter = entries.next()) && !iter.done) {
                    const [key, value] = iter.value;
                    // if value is a schema, remove its reference
                    if (typeof (value) === "object") {
                        previousRefId = $root.refIds.get(value);
                        $root.removeRef(previousRefId);
                    }
                    allChanges.push({
                        ref: previousValue,
                        refId: previousRefId,
                        op: spec_1.OPERATION.DELETE,
                        field: key,
                        value: undefined,
                        previousValue: value,
                    });
                }
            }
        }
        $root.addRef(refId, value, (valueRef !== previousValue ||
            (operation === spec_1.OPERATION.DELETE_AND_ADD && valueRef === previousValue)));
    }
    return { value, previousValue };
}
const decodeSchemaOperation = function (decoder, bytes, it, ref, allChanges) {
    const first_byte = bytes[it.offset++];
    const metadata = ref.constructor[Symbol.metadata];
    // "compressed" index + operation
    const operation = (first_byte >> 6) << 6;
    const index = first_byte % (operation || 255);
    // skip early if field is not defined
    const field = metadata[index];
    if (field === undefined) {
        console.warn("@colyseus/schema: field not defined at", { index, ref: ref.constructor.name, metadata });
        return exports.DEFINITION_MISMATCH;
    }
    const { value, previousValue } = decodeValue(decoder, operation, ref, index, field.type, bytes, it, allChanges);
    if (value !== null && value !== undefined) {
        ref[field.name] = value;
    }
    // add change
    if (previousValue !== value) {
        allChanges.push({
            ref,
            refId: decoder.currentRefId,
            op: operation,
            field: field.name,
            value,
            previousValue,
        });
    }
};
exports.decodeSchemaOperation = decodeSchemaOperation;
const decodeKeyValueOperation = function (decoder, bytes, it, ref, allChanges) {
    // "uncompressed" index + operation (array/map items)
    const operation = bytes[it.offset++];
    if (operation === spec_1.OPERATION.CLEAR) {
        //
        // When decoding:
        // - enqueue items for DELETE callback.
        // - flag child items for garbage collection.
        //
        decoder.removeChildRefs(ref, allChanges);
        ref.clear();
        return;
    }
    const index = decode_1.decode.number(bytes, it);
    const type = ref[symbols_1.$childType];
    let dynamicIndex;
    if ((operation & spec_1.OPERATION.ADD) === spec_1.OPERATION.ADD) { // ADD or DELETE_AND_ADD
        if (typeof (ref['set']) === "function") {
            dynamicIndex = decode_1.decode.string(bytes, it); // MapSchema
            ref['setIndex'](index, dynamicIndex);
        }
        else {
            dynamicIndex = index; // ArraySchema
        }
    }
    else {
        // get dynamic index from "ref"
        dynamicIndex = ref['getIndex'](index);
    }
    const { value, previousValue } = decodeValue(decoder, operation, ref, index, type, bytes, it, allChanges);
    if (value !== null && value !== undefined) {
        if (typeof (ref['set']) === "function") {
            // MapSchema
            ref['$items'].set(dynamicIndex, value);
        }
        else if (typeof (ref['$setAt']) === "function") {
            // ArraySchema
            ref['$setAt'](index, value, operation);
        }
        else if (typeof (ref['add']) === "function") {
            // CollectionSchema && SetSchema
            const index = ref.add(value);
            if (typeof (index) === "number") {
                ref['setIndex'](index, index);
            }
        }
    }
    // add change
    if (previousValue !== value) {
        allChanges.push({
            ref,
            refId: decoder.currentRefId,
            op: operation,
            field: "", // FIXME: remove this
            dynamicIndex,
            value,
            previousValue,
        });
    }
};
exports.decodeKeyValueOperation = decodeKeyValueOperation;
const decodeArray = function (decoder, bytes, it, ref, allChanges) {
    // "uncompressed" index + operation (array/map items)
    let operation = bytes[it.offset++];
    let index;
    if (operation === spec_1.OPERATION.CLEAR) {
        //
        // When decoding:
        // - enqueue items for DELETE callback.
        // - flag child items for garbage collection.
        //
        decoder.removeChildRefs(ref, allChanges);
        ref.clear();
        return;
    }
    else if (operation === spec_1.OPERATION.REVERSE) {
        ref.reverse();
        return;
    }
    else if (operation === spec_1.OPERATION.DELETE_BY_REFID) {
        // TODO: refactor here, try to follow same flow as below
        const refId = decode_1.decode.number(bytes, it);
        const previousValue = decoder.root.refs.get(refId);
        index = ref.findIndex((value) => value === previousValue);
        ref[symbols_1.$deleteByIndex](index);
        allChanges.push({
            ref,
            refId: decoder.currentRefId,
            op: spec_1.OPERATION.DELETE,
            field: "", // FIXME: remove this
            dynamicIndex: index,
            value: undefined,
            previousValue,
        });
        return;
    }
    else if (operation === spec_1.OPERATION.ADD_BY_REFID) {
        const refId = decode_1.decode.number(bytes, it);
        const itemByRefId = decoder.root.refs.get(refId);
        // if item already exists, use existing index
        if (itemByRefId) {
            index = ref.findIndex((value) => value === itemByRefId);
        }
        // fallback to use last index
        if (index === -1 || index === undefined) {
            index = ref.length;
        }
    }
    else {
        index = decode_1.decode.number(bytes, it);
    }
    const type = ref[symbols_1.$childType];
    let dynamicIndex = index;
    const { value, previousValue } = decodeValue(decoder, operation, ref, index, type, bytes, it, allChanges);
    if (value !== null && value !== undefined &&
        value !== previousValue // avoid setting same value twice (if index === 0 it will result in a "unshift" for ArraySchema)
    ) {
        // ArraySchema
        ref['$setAt'](index, value, operation);
    }
    // add change
    if (previousValue !== value) {
        allChanges.push({
            ref,
            refId: decoder.currentRefId,
            op: operation,
            field: "", // FIXME: remove this
            dynamicIndex,
            value,
            previousValue,
        });
    }
};
exports.decodeArray = decodeArray;
//# sourceMappingURL=DecodeOperation.js.map