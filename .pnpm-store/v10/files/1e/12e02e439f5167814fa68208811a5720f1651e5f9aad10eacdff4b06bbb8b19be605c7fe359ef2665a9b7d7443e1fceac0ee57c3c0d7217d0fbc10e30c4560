"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeKeyValueOperation = exports.decodeSchemaOperation = exports.decodeValue = exports.DecodeState = void 0;
const spec_1 = require("../spec");
const Schema_1 = require("../Schema");
const decode = require("../encoding/decode");
const typeRegistry_1 = require("../types/typeRegistry");
const consts_1 = require("./consts");
const __1 = require("..");
var DecodeState;
(function (DecodeState) {
    DecodeState[DecodeState["DEFINITION_MISMATCH"] = 0] = "DEFINITION_MISMATCH";
})(DecodeState || (exports.DecodeState = DecodeState = {}));
function decodeValue(decoder, operation, ref, index, type, bytes, it, allChanges) {
    const $root = decoder.refs;
    const previousValue = ref[consts_1.$getByIndex](index);
    let value;
    if ((operation & spec_1.OPERATION.DELETE) === spec_1.OPERATION.DELETE) {
        //
        // Delete operations
        //
        if (operation !== spec_1.OPERATION.DELETE_AND_ADD) {
            ref[consts_1.$deleteByIndex](index);
        }
        // Flag `refId` for garbage collection.
        const previousRefId = $root.refIds.get(previousValue);
        if (previousRefId) {
            $root.removeRef(previousRefId);
        }
        value = null;
    }
    else if (Schema_1.Schema.is(type)) {
        const refId = decode.number(bytes, it);
        value = $root.refs.get(refId);
        if (operation !== spec_1.OPERATION.REPLACE) {
            const childType = decoder.getInstanceType(bytes, it, type);
            if (!value) {
                value = decoder.createInstanceOfType(childType);
                if (previousValue) {
                    // value.$callbacks = previousValue.$callbacks;
                    // value.$listeners = previousValue.$listeners;
                    const previousRefId = $root.refIds.get(previousValue);
                    if (previousRefId && refId !== previousRefId) {
                        $root.removeRef(previousRefId);
                    }
                }
            }
            // console.log("ADD REF!", refId, value, ", TYPE =>", Metadata.getFor(childType));
            $root.addRef(refId, value, (value !== previousValue));
        }
    }
    else if (typeof (type) === "string") {
        //
        // primitive value (number, string, boolean, etc)
        //
        value = decode[type](bytes, it);
    }
    else {
        const typeDef = (0, typeRegistry_1.getType)(Object.keys(type)[0]);
        const refId = decode.number(bytes, it);
        const valueRef = ($root.refs.has(refId))
            ? previousValue || $root.refs.get(refId)
            : new typeDef.constructor();
        value = valueRef.clone(true);
        value[consts_1.$childType] = Object.values(type)[0]; // cache childType for ArraySchema and MapSchema
        // preserve schema callbacks
        if (previousValue) {
            // value['$callbacks'] = previousValue['$callbacks'];
            const previousRefId = $root.refIds.get(previousValue);
            if (previousRefId && refId !== previousRefId) {
                $root.removeRef(previousRefId);
                //
                // Trigger onRemove if structure has been replaced.
                //
                const entries = previousValue.entries();
                let iter;
                while ((iter = entries.next()) && !iter.done) {
                    const [key, value] = iter.value;
                    allChanges.push({
                        refId,
                        op: spec_1.OPERATION.DELETE,
                        field: key,
                        value: undefined,
                        previousValue: value,
                    });
                }
            }
        }
        // console.log("ADD REF!", { refId, value });
        $root.addRef(refId, value, (valueRef !== previousValue));
    }
    return { value, previousValue };
}
exports.decodeValue = decodeValue;
const decodeSchemaOperation = function (decoder, bytes, it, ref, allChanges) {
    const first_byte = bytes[it.offset++];
    const metadata = ref['constructor'][Symbol.metadata];
    // "compressed" index + operation
    const operation = (first_byte >> 6) << 6;
    const index = first_byte % (operation || 255);
    // skip early if field is not defined
    const field = metadata[index];
    if (field === undefined) {
        return DecodeState.DEFINITION_MISMATCH;
    }
    const { value, previousValue } = decodeValue(decoder, operation, ref, index, metadata[field].type, bytes, it, allChanges);
    if (value !== null && value !== undefined) {
        ref[field] = value;
    }
    // add change
    if (previousValue !== value) {
        allChanges.push({
            refId: decoder.currentRefId,
            op: operation,
            field: field,
            value,
            previousValue,
        });
    }
};
exports.decodeSchemaOperation = decodeSchemaOperation;
const decodeKeyValueOperation = function (decoder, bytes, it, ref, allChanges) {
    const first_byte = bytes[it.offset++];
    // "uncompressed" index + operation (array/map items)
    const operation = first_byte;
    if (operation === spec_1.OPERATION.CLEAR) {
        //
        // TODO: refactor me!
        // The `.clear()` method is calling `$root.removeRef(refId)` for
        // each item inside this collection
        //
        ref.clear(allChanges);
        return;
    }
    const index = decode.number(bytes, it);
    const type = ref[consts_1.$childType];
    let dynamicIndex;
    if ((operation & spec_1.OPERATION.ADD) === spec_1.OPERATION.ADD) { // ADD or DELETE_AND_ADD
        dynamicIndex = (ref instanceof __1.MapSchema)
            ? decode.string(bytes, it)
            : index;
        ref['setIndex'](index, dynamicIndex);
    }
    else {
        // here
        dynamicIndex = ref['getIndex'](index);
    }
    const { value, previousValue } = decodeValue(decoder, operation, ref, dynamicIndex, type, bytes, it, allChanges);
    if (value !== null && value !== undefined) {
        if (ref instanceof __1.MapSchema) {
            // const key = ref['$indexes'].get(field);
            const key = dynamicIndex;
            // ref.set(key, value);
            ref['$items'].set(key, value);
        }
        else if (ref instanceof __1.ArraySchema) {
            // const key = ref['$indexes'][field];
            // console.log("SETTING FOR ArraySchema =>", { field, key, value });
            // ref[key] = value;
            ref.setAt(index, value);
        }
        else if (ref instanceof __1.CollectionSchema) {
            const index = ref.add(value);
            ref['setIndex'](index, index);
        }
        else if (ref instanceof __1.SetSchema) {
            const index = ref.add(value);
            if (index !== false) {
                ref['setIndex'](index, index);
            }
        }
    }
    // add change
    if (previousValue !== value) {
        allChanges.push({
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
//# sourceMappingURL=DecodeOperation.js.map