"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapSchema = void 0;
const symbols_1 = require("../symbols");
const ChangeTree_1 = require("../../encoder/ChangeTree");
const spec_1 = require("../../encoding/spec");
const registry_1 = require("../registry");
const DecodeOperation_1 = require("../../decoder/DecodeOperation");
const EncodeOperation_1 = require("../../encoder/EncodeOperation");
const assert_1 = require("../../encoding/assert");
class MapSchema {
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
        return type['map'] !== undefined;
    }
    constructor(initialValues) {
        this.$items = new Map();
        this.$indexes = new Map();
        this.deletedItems = {};
        const changeTree = new ChangeTree_1.ChangeTree(this);
        changeTree.indexes = {};
        Object.defineProperty(this, symbols_1.$changes, {
            value: changeTree,
            enumerable: false,
            writable: true,
        });
        if (initialValues) {
            if (initialValues instanceof Map ||
                initialValues instanceof MapSchema) {
                initialValues.forEach((v, k) => this.set(k, v));
            }
            else {
                for (const k in initialValues) {
                    this.set(k, initialValues[k]);
                }
            }
        }
        Object.defineProperty(this, symbols_1.$childType, {
            value: undefined,
            enumerable: false,
            writable: true,
            configurable: true,
        });
    }
    /** Iterator */
    [Symbol.iterator]() { return this.$items[Symbol.iterator](); }
    get [Symbol.toStringTag]() { return this.$items[Symbol.toStringTag]; }
    static get [Symbol.species]() { return MapSchema; }
    set(key, value) {
        if (value === undefined || value === null) {
            throw new Error(`MapSchema#set('${key}', ${value}): trying to set ${value} value on '${key}'.`);
        }
        else if (typeof (value) === "object" && this[symbols_1.$childType]) {
            (0, assert_1.assertInstanceType)(value, this[symbols_1.$childType], this, key);
        }
        // Force "key" as string
        // See: https://github.com/colyseus/colyseus/issues/561#issuecomment-1646733468
        key = key.toString();
        const changeTree = this[symbols_1.$changes];
        const isRef = (value[symbols_1.$changes]) !== undefined;
        let index;
        let operation;
        // IS REPLACE?
        if (typeof (changeTree.indexes[key]) !== "undefined") {
            index = changeTree.indexes[key];
            operation = spec_1.OPERATION.REPLACE;
            const previousValue = this.$items.get(key);
            if (previousValue === value) {
                // if value is the same, avoid re-encoding it.
                return;
            }
            else if (isRef) {
                // if is schema, force ADD operation if value differ from previous one.
                operation = spec_1.OPERATION.DELETE_AND_ADD;
                // remove reference from previous value
                if (previousValue !== undefined) {
                    previousValue[symbols_1.$changes].root?.remove(previousValue[symbols_1.$changes]);
                }
            }
            if (this.deletedItems[index]) {
                delete this.deletedItems[index];
            }
        }
        else {
            index = changeTree.indexes[symbols_1.$numFields] ?? 0;
            operation = spec_1.OPERATION.ADD;
            this.$indexes.set(index, key);
            changeTree.indexes[key] = index;
            changeTree.indexes[symbols_1.$numFields] = index + 1;
        }
        this.$items.set(key, value);
        changeTree.change(index, operation);
        //
        // set value's parent after the value is set
        // (to avoid encoding "refId" operations before parent's "ADD" operation)
        //
        if (isRef) {
            value[symbols_1.$changes].setParent(this, changeTree.root, index);
        }
        return this;
    }
    get(key) {
        return this.$items.get(key);
    }
    delete(key) {
        if (!this.$items.has(key)) {
            return false;
        }
        const index = this[symbols_1.$changes].indexes[key];
        this.deletedItems[index] = this[symbols_1.$changes].delete(index);
        return this.$items.delete(key);
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
    has(key) {
        return this.$items.has(key);
    }
    forEach(callbackfn) {
        this.$items.forEach(callbackfn);
    }
    entries() {
        return this.$items.entries();
    }
    keys() {
        return this.$items.keys();
    }
    values() {
        return this.$items.values();
    }
    get size() {
        return this.$items.size;
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
        const changeTree = this[symbols_1.$changes];
        // - cleanup changeTree.indexes
        // - cleanup $indexes
        for (const indexStr in this.deletedItems) {
            const index = parseInt(indexStr);
            const key = this.$indexes.get(index);
            // TODO: refactor this.
            // it shouldn't be necessary to keep track of indexes both on changeTree and on $indexes
            delete changeTree.indexes[key];
            this.$indexes.delete(index);
        }
        this.deletedItems = {};
    }
    toJSON() {
        const map = {};
        this.forEach((value, key) => {
            map[key] = (typeof (value['toJSON']) === "function")
                ? value['toJSON']()
                : value;
        });
        return map;
    }
    //
    // Decoding utilities
    //
    // @ts-ignore
    clone(isDecoding) {
        let cloned;
        if (isDecoding) {
            // client-side
            cloned = Object.assign(new MapSchema(), this);
        }
        else {
            // server-side
            cloned = new MapSchema();
            this.forEach((value, key) => {
                if (value[symbols_1.$changes]) {
                    cloned.set(key, value['clone']());
                }
                else {
                    cloned.set(key, value);
                }
            });
        }
        return cloned;
    }
}
exports.MapSchema = MapSchema;
(0, registry_1.registerType)("map", { constructor: MapSchema });
//# sourceMappingURL=MapSchema.js.map