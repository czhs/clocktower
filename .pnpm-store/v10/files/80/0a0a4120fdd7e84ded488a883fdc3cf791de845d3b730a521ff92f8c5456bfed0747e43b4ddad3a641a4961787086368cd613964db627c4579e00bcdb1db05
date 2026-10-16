"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferenceTracker = void 0;
const symbols_1 = require("../types/symbols");
const utils_1 = require("../types/utils");
const spec_1 = require("../encoding/spec");
class DecodingWarning extends Error {
    constructor(message) {
        super(message);
        this.name = "DecodingWarning";
    }
}
class ReferenceTracker {
    constructor() {
        //
        // Relation of refId => Schema structure
        // For direct access of structures during decoding time.
        //
        this.refs = new Map();
        this.refIds = new WeakMap();
        this.refCount = {};
        this.deletedRefs = new Set();
        this.callbacks = {};
        this.nextUniqueId = 0;
    }
    getNextUniqueId() {
        return this.nextUniqueId++;
    }
    // for decoding
    addRef(refId, ref, incrementCount = true) {
        this.refs.set(refId, ref);
        this.refIds.set(ref, refId);
        if (incrementCount) {
            this.refCount[refId] = (this.refCount[refId] || 0) + 1;
        }
        if (this.deletedRefs.has(refId)) {
            this.deletedRefs.delete(refId);
        }
    }
    // for decoding
    removeRef(refId) {
        const refCount = this.refCount[refId];
        if (refCount === undefined) {
            try {
                throw new DecodingWarning("trying to remove refId that doesn't exist: " + refId);
            }
            catch (e) {
                console.warn(e);
            }
            return;
        }
        if (refCount === 0) {
            try {
                const ref = this.refs.get(refId);
                throw new DecodingWarning(`trying to remove refId '${refId}' with 0 refCount (${ref.constructor.name}: ${JSON.stringify(ref)})`);
            }
            catch (e) {
                console.warn(e);
            }
            return;
        }
        if ((this.refCount[refId] = refCount - 1) <= 0) {
            this.deletedRefs.add(refId);
        }
    }
    clearRefs() {
        this.refs.clear();
        this.deletedRefs.clear();
        this.callbacks = {};
        this.refCount = {};
    }
    // for decoding
    garbageCollectDeletedRefs() {
        this.deletedRefs.forEach((refId) => {
            //
            // Skip active references.
            //
            if (this.refCount[refId] > 0) {
                return;
            }
            const ref = this.refs.get(refId);
            //
            // Ensure child schema instances have their references removed as well.
            //
            if (ref.constructor[Symbol.metadata] !== undefined) {
                const metadata = ref.constructor[Symbol.metadata];
                for (const index in metadata) {
                    const field = metadata[index].name;
                    const childRefId = typeof (ref[field]) === "object" && this.refIds.get(ref[field]);
                    if (childRefId && !this.deletedRefs.has(childRefId)) {
                        this.removeRef(childRefId);
                    }
                }
            }
            else {
                if (typeof (ref[symbols_1.$childType]) === "function") {
                    Array.from(ref.values())
                        .forEach((child) => {
                        const childRefId = this.refIds.get(child);
                        if (!this.deletedRefs.has(childRefId)) {
                            this.removeRef(childRefId);
                        }
                    });
                }
            }
            this.refs.delete(refId); // remove ref
            delete this.refCount[refId]; // remove ref count
            delete this.callbacks[refId]; // remove callbacks
        });
        // clear deleted refs.
        this.deletedRefs.clear();
    }
    addCallback(refId, fieldOrOperation, callback) {
        if (refId === undefined) {
            const name = (typeof (fieldOrOperation) === "number")
                ? spec_1.OPERATION[fieldOrOperation]
                : fieldOrOperation;
            throw new Error(`Can't addCallback on '${name}' (refId is undefined)`);
        }
        if (!this.callbacks[refId]) {
            this.callbacks[refId] = {};
        }
        if (!this.callbacks[refId][fieldOrOperation]) {
            this.callbacks[refId][fieldOrOperation] = [];
        }
        this.callbacks[refId][fieldOrOperation].push(callback);
        return () => this.removeCallback(refId, fieldOrOperation, callback);
    }
    removeCallback(refId, field, callback) {
        const index = this.callbacks?.[refId]?.[field]?.indexOf(callback);
        if (index !== undefined && index !== -1) {
            (0, utils_1.spliceOne)(this.callbacks[refId][field], index);
        }
    }
}
exports.ReferenceTracker = ReferenceTracker;
//# sourceMappingURL=ReferenceTracker.js.map