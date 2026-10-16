"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectionSchema = void 0;
const symbols_1 = require("../symbols");
const ChangeTree_1 = require("../../encoder/ChangeTree");
const spec_1 = require("../../encoding/spec");
const registry_1 = require("../registry");
const DecodeOperation_1 = require("../../decoder/DecodeOperation");
const EncodeOperation_1 = require("../../encoder/EncodeOperation");
class CollectionSchema {
    static { this[_a] = EncodeOperation_1.encodeKeyValueOperation; }
    static { this[_b] = DecodeOperation_1.decodeKeyValueOperation; }
    /**
     * Determine if a property must be filtered.
     * - If returns false, the property is NOT going to be encoded.
     * - If returns true, the property is going to be encoded.
     *
     * Encoding with "filters" happens in two steps:
     * - First, the encoder iterates over all "not owned" properties and encodes them.
     * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
     */
    static [(_a = symbols_1.$encoder, _b = symbols_1.$decoder, symbols_1.$filter)](ref, index, view) {
        return (!view ||
            typeof (ref[symbols_1.$childType]) === "string" ||
            view.isChangeTreeVisible((ref[symbols_1.$getByIndex](index) ?? ref.deletedItems[index])[symbols_1.$changes]));
    }
    static is(type) {
        return type['collection'] !== undefined;
    }
    constructor(initialValues) {
        this.$items = new Map();
        this.$indexes = new Map();
        this.deletedItems = {};
        this.$refId = 0;
        this[symbols_1.$changes] = new ChangeTree_1.ChangeTree(this);
        this[symbols_1.$changes].indexes = {};
        if (initialValues) {
            initialValues.forEach((v) => this.add(v));
        }
        Object.defineProperty(this, symbols_1.$childType, {
            value: undefined,
            enumerable: false,
            writable: true,
            configurable: true,
        });
    }
    add(value) {
        // set "index" for reference.
        const index = this.$refId++;
        const isRef = (value[symbols_1.$changes]) !== undefined;
        if (isRef) {
            value[symbols_1.$changes].setParent(this, this[symbols_1.$changes].root, index);
        }
        this[symbols_1.$changes].indexes[index] = index;
        this.$indexes.set(index, index);
        this.$items.set(index, value);
        this[symbols_1.$changes].change(index);
        return index;
    }
    at(index) {
        const key = Array.from(this.$items.keys())[index];
        return this.$items.get(key);
    }
    entries() {
        return this.$items.entries();
    }
    delete(item) {
        const entries = this.$items.entries();
        let index;
        let entry;
        while (entry = entries.next()) {
            if (entry.done) {
                break;
            }
            if (item === entry.value[1]) {
                index = entry.value[0];
                break;
            }
        }
        if (index === undefined) {
            return false;
        }
        this.deletedItems[index] = this[symbols_1.$changes].delete(index);
        this.$indexes.delete(index);
        return this.$items.delete(index);
    }
    clear() {
        const changeTree = this[symbols_1.$changes];
        // discard previous operations.
        changeTree.discard(true);
        changeTree.indexes = {};
        // remove children references
        changeTree.forEachChild((childChangeTree, _) => {
            changeTree.root?.remove(childChangeTree);
        });
        // clear previous indexes
        this.$indexes.clear();
        // clear items
        this.$items.clear();
        changeTree.operation(spec_1.OPERATION.CLEAR);
    }
    has(value) {
        return Array.from(this.$items.values()).some((v) => v === value);
    }
    forEach(callbackfn) {
        this.$items.forEach((value, key, _) => callbackfn(value, key, this));
    }
    values() {
        return this.$items.values();
    }
    get size() {
        return this.$items.size;
    }
    /** Iterator */
    [Symbol.iterator]() {
        return this.$items.values();
    }
    setIndex(index, key) {
        this.$indexes.set(index, key);
    }
    getIndex(index) {
        return this.$indexes.get(index);
    }
    [symbols_1.$getByIndex](index) {
        return this.$items.get(this.$indexes.get(index));
    }
    [symbols_1.$deleteByIndex](index) {
        const key = this.$indexes.get(index);
        this.$items.delete(key);
        this.$indexes.delete(index);
    }
    [symbols_1.$onEncodeEnd]() {
        this.deletedItems = {};
    }
    toArray() {
        return Array.from(this.$items.values());
    }
    toJSON() {
        const values = [];
        this.forEach((value, key) => {
            values.push((typeof (value['toJSON']) === "function")
                ? value['toJSON']()
                : value);
        });
        return values;
    }
    //
    // Decoding utilities
    //
    clone(isDecoding) {
        let cloned;
        if (isDecoding) {
            // client-side
            cloned = Object.assign(new CollectionSchema(), this);
        }
        else {
            // server-side
            cloned = new CollectionSchema();
            this.forEach((value) => {
                if (value[symbols_1.$changes]) {
                    cloned.add(value['clone']());
                }
                else {
                    cloned.add(value);
                }
            });
        }
        return cloned;
    }
}
exports.CollectionSchema = CollectionSchema;
(0, registry_1.registerType)("collection", { constructor: CollectionSchema, });
//# sourceMappingURL=CollectionSchema.js.map