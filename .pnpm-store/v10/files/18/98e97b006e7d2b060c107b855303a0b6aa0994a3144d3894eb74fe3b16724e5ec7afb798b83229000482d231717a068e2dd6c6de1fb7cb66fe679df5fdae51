"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeContext = void 0;
const Metadata_1 = require("../Metadata");
const Schema_1 = require("../Schema");
const symbols_1 = require("./symbols");
class TypeContext {
    /**
     * For inheritance support
     * Keeps track of which classes extends which. (parent -> children)
     */
    static { this.inheritedTypes = new Map(); }
    static { this.cachedContexts = new Map(); }
    static register(target) {
        const parent = Object.getPrototypeOf(target);
        if (parent !== Schema_1.Schema) {
            let inherits = TypeContext.inheritedTypes.get(parent);
            if (!inherits) {
                inherits = new Set();
                TypeContext.inheritedTypes.set(parent, inherits);
            }
            inherits.add(target);
        }
    }
    static cache(rootClass) {
        let context = TypeContext.cachedContexts.get(rootClass);
        if (!context) {
            context = new TypeContext(rootClass);
            TypeContext.cachedContexts.set(rootClass, context);
        }
        return context;
    }
    constructor(rootClass) {
        this.types = {};
        this.schemas = new Map();
        this.hasFilters = false;
        this.parentFiltered = {};
        if (rootClass) {
            this.discoverTypes(rootClass);
        }
    }
    has(schema) {
        return this.schemas.has(schema);
    }
    get(typeid) {
        return this.types[typeid];
    }
    add(schema, typeid = this.schemas.size) {
        // skip if already registered
        if (this.schemas.has(schema)) {
            return false;
        }
        this.types[typeid] = schema;
        //
        // Workaround to allow using an empty Schema (with no `@type()` fields)
        //
        if (schema[Symbol.metadata] === undefined) {
            Metadata_1.Metadata.initialize(schema);
        }
        this.schemas.set(schema, typeid);
        return true;
    }
    getTypeId(klass) {
        return this.schemas.get(klass);
    }
    discoverTypes(klass, parentType, parentIndex, parentHasViewTag) {
        if (parentHasViewTag) {
            this.registerFilteredByParent(klass, parentType, parentIndex);
        }
        // skip if already registered
        if (!this.add(klass)) {
            return;
        }
        // add classes inherited from this base class
        TypeContext.inheritedTypes.get(klass)?.forEach((child) => {
            this.discoverTypes(child, parentType, parentIndex, parentHasViewTag);
        });
        // add parent classes
        let parent = klass;
        while ((parent = Object.getPrototypeOf(parent)) &&
            parent !== Schema_1.Schema && // stop at root (Schema)
            parent !== Function.prototype // stop at root (non-Schema)
        ) {
            this.discoverTypes(parent);
        }
        const metadata = (klass[Symbol.metadata] ??= {});
        // if any schema/field has filters, mark "context" as having filters.
        if (metadata[symbols_1.$viewFieldIndexes]) {
            this.hasFilters = true;
        }
        for (const fieldIndex in metadata) {
            const index = fieldIndex;
            const fieldType = metadata[index].type;
            const fieldHasViewTag = (metadata[index].tag !== undefined);
            if (typeof (fieldType) === "string") {
                continue;
            }
            if (typeof (fieldType) === "function") {
                this.discoverTypes(fieldType, klass, index, parentHasViewTag || fieldHasViewTag);
            }
            else {
                const type = Object.values(fieldType)[0];
                // skip primitive types
                if (typeof (type) === "string") {
                    continue;
                }
                this.discoverTypes(type, klass, index, parentHasViewTag || fieldHasViewTag);
            }
        }
    }
    /**
     * Keep track of which classes have filters applied.
     * Format: `${typeid}-${parentTypeid}-${parentIndex}`
     */
    registerFilteredByParent(schema, parentType, parentIndex) {
        const typeid = this.schemas.get(schema) ?? this.schemas.size;
        let key = `${typeid}`;
        if (parentType) {
            key += `-${this.schemas.get(parentType)}`;
        }
        key += `-${parentIndex}`;
        this.parentFiltered[key] = true;
    }
    debug() {
        let parentFiltered = "";
        for (const key in this.parentFiltered) {
            const keys = key.split("-").map(Number);
            const fieldIndex = keys.pop();
            parentFiltered += `\n\t\t`;
            parentFiltered += `${key}: ${keys.reverse().map((id, i) => {
                const klass = this.types[id];
                const metadata = klass[Symbol.metadata];
                let txt = klass.name;
                if (i === 0) {
                    txt += `[${metadata[fieldIndex].name}]`;
                }
                return `${txt}`;
            }).join(" -> ")}`;
        }
        return `TypeContext ->\n` +
            `\tSchema types: ${this.schemas.size}\n` +
            `\thasFilters: ${this.hasFilters}\n` +
            `\tparentFiltered:${parentFiltered}`;
    }
}
exports.TypeContext = TypeContext;
//# sourceMappingURL=TypeContext.js.map