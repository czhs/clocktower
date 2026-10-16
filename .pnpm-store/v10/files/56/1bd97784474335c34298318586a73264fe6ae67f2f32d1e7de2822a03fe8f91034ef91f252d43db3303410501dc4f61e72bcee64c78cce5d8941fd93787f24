"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Metadata = void 0;
exports.getNormalizedType = getNormalizedType;
const annotations_1 = require("./annotations");
const Schema_1 = require("./Schema");
const registry_1 = require("./types/registry");
const symbols_1 = require("./types/symbols");
const TypeContext_1 = require("./types/TypeContext");
function getNormalizedType(type) {
    if (Array.isArray(type)) {
        return { array: getNormalizedType(type[0]) };
    }
    else if (typeof (type['type']) !== "undefined") {
        return type['type'];
    }
    else if (isTSEnum(type)) {
        // Detect TS Enum type (either string or number)
        return Object.keys(type).every(key => typeof type[key] === "string")
            ? "string"
            : "number";
    }
    else if (typeof type === "object" && type !== null) {
        // Handle collection types
        const collectionType = Object.keys(type).find(k => registry_1.registeredTypes[k] !== undefined);
        if (collectionType) {
            type[collectionType] = getNormalizedType(type[collectionType]);
            return type;
        }
    }
    return type;
}
function isTSEnum(_enum) {
    if (typeof _enum === 'function' && _enum[Symbol.metadata]) {
        return false;
    }
    const keys = Object.keys(_enum);
    const numericFields = keys.filter(k => /\d+/.test(k));
    // Check for number enum (has numeric keys and reverse mapping)
    if (numericFields.length > 0 && numericFields.length === (keys.length / 2) && _enum[_enum[numericFields[0]]] == numericFields[0]) {
        return true;
    }
    // Check for string enum (all values are strings and keys match values)
    if (keys.length > 0 && keys.every(key => typeof _enum[key] === 'string' && _enum[key] === key)) {
        return true;
    }
    return false;
}
exports.Metadata = {
    addField(metadata, index, name, type, descriptor) {
        if (index > 64) {
            throw new Error(`Can't define field '${name}'.\nSchema instances may only have up to 64 fields.`);
        }
        metadata[index] = Object.assign(metadata[index] || {}, // avoid overwriting previous field metadata (@owned / @deprecated)
        {
            type: getNormalizedType(type),
            index,
            name,
        });
        // create "descriptors" map
        Object.defineProperty(metadata, symbols_1.$descriptors, {
            value: metadata[symbols_1.$descriptors] || {},
            enumerable: false,
            configurable: true,
        });
        if (descriptor) {
            // for encoder
            metadata[symbols_1.$descriptors][name] = descriptor;
            metadata[symbols_1.$descriptors][`_${name}`] = {
                value: undefined,
                writable: true,
                enumerable: false,
                configurable: true,
            };
        }
        else {
            // for decoder
            metadata[symbols_1.$descriptors][name] = {
                value: undefined,
                writable: true,
                enumerable: true,
                configurable: true,
            };
        }
        // map -1 as last field index
        Object.defineProperty(metadata, symbols_1.$numFields, {
            value: index,
            enumerable: false,
            configurable: true
        });
        // map field name => index (non enumerable)
        Object.defineProperty(metadata, name, {
            value: index,
            enumerable: false,
            configurable: true,
        });
        // if child Ref/complex type, add to -4
        if (typeof (metadata[index].type) !== "string") {
            if (metadata[symbols_1.$refTypeFieldIndexes] === undefined) {
                Object.defineProperty(metadata, symbols_1.$refTypeFieldIndexes, {
                    value: [],
                    enumerable: false,
                    configurable: true,
                });
            }
            metadata[symbols_1.$refTypeFieldIndexes].push(index);
        }
    },
    setTag(metadata, fieldName, tag) {
        const index = metadata[fieldName];
        const field = metadata[index];
        // add 'tag' to the field
        field.tag = tag;
        if (!metadata[symbols_1.$viewFieldIndexes]) {
            // -2: all field indexes with "view" tag
            Object.defineProperty(metadata, symbols_1.$viewFieldIndexes, {
                value: [],
                enumerable: false,
                configurable: true
            });
            // -3: field indexes by "view" tag
            Object.defineProperty(metadata, symbols_1.$fieldIndexesByViewTag, {
                value: {},
                enumerable: false,
                configurable: true
            });
        }
        metadata[symbols_1.$viewFieldIndexes].push(index);
        if (!metadata[symbols_1.$fieldIndexesByViewTag][tag]) {
            metadata[symbols_1.$fieldIndexesByViewTag][tag] = [];
        }
        metadata[symbols_1.$fieldIndexesByViewTag][tag].push(index);
    },
    setFields(target, fields) {
        // for inheritance support
        const constructor = target.prototype.constructor;
        TypeContext_1.TypeContext.register(constructor);
        const parentClass = Object.getPrototypeOf(constructor);
        const parentMetadata = parentClass && parentClass[Symbol.metadata];
        const metadata = exports.Metadata.initialize(constructor);
        // Use Schema's methods if not defined in the class
        if (!constructor[symbols_1.$track]) {
            constructor[symbols_1.$track] = Schema_1.Schema[symbols_1.$track];
        }
        if (!constructor[symbols_1.$encoder]) {
            constructor[symbols_1.$encoder] = Schema_1.Schema[symbols_1.$encoder];
        }
        if (!constructor[symbols_1.$decoder]) {
            constructor[symbols_1.$decoder] = Schema_1.Schema[symbols_1.$decoder];
        }
        if (!constructor.prototype.toJSON) {
            constructor.prototype.toJSON = Schema_1.Schema.prototype.toJSON;
        }
        //
        // detect index for this field, considering inheritance
        //
        let fieldIndex = metadata[symbols_1.$numFields] // current structure already has fields defined
            ?? (parentMetadata && parentMetadata[symbols_1.$numFields]) // parent structure has fields defined
            ?? -1; // no fields defined
        fieldIndex++;
        for (const field in fields) {
            const type = getNormalizedType(fields[field]);
            // FIXME: this code is duplicated from @type() annotation
            const complexTypeKlass = typeof (Object.keys(type)[0]) === "string" && (0, registry_1.getType)(Object.keys(type)[0]);
            const childType = (complexTypeKlass)
                ? Object.values(type)[0]
                : type;
            exports.Metadata.addField(metadata, fieldIndex, field, type, (0, annotations_1.getPropertyDescriptor)(`_${field}`, fieldIndex, childType, complexTypeKlass));
            fieldIndex++;
        }
        return target;
    },
    isDeprecated(metadata, field) {
        return metadata[field].deprecated === true;
    },
    init(klass) {
        //
        // Used only to initialize an empty Schema (Encoder#constructor)
        // TODO: remove/refactor this...
        //
        const metadata = {};
        klass[Symbol.metadata] = metadata;
        Object.defineProperty(metadata, symbols_1.$numFields, {
            value: 0,
            enumerable: false,
            configurable: true,
        });
    },
    initialize(constructor) {
        const parentClass = Object.getPrototypeOf(constructor);
        const parentMetadata = parentClass[Symbol.metadata];
        let metadata = constructor[Symbol.metadata] ?? Object.create(null);
        // make sure inherited classes have their own metadata object.
        if (parentClass !== Schema_1.Schema && metadata === parentMetadata) {
            metadata = Object.create(null);
            if (parentMetadata) {
                //
                // assign parent metadata to current
                //
                Object.setPrototypeOf(metadata, parentMetadata);
                // $numFields
                Object.defineProperty(metadata, symbols_1.$numFields, {
                    value: parentMetadata[symbols_1.$numFields],
                    enumerable: false,
                    configurable: true,
                    writable: true,
                });
                // $viewFieldIndexes / $fieldIndexesByViewTag
                if (parentMetadata[symbols_1.$viewFieldIndexes] !== undefined) {
                    Object.defineProperty(metadata, symbols_1.$viewFieldIndexes, {
                        value: [...parentMetadata[symbols_1.$viewFieldIndexes]],
                        enumerable: false,
                        configurable: true,
                        writable: true,
                    });
                    Object.defineProperty(metadata, symbols_1.$fieldIndexesByViewTag, {
                        value: { ...parentMetadata[symbols_1.$fieldIndexesByViewTag] },
                        enumerable: false,
                        configurable: true,
                        writable: true,
                    });
                }
                // $refTypeFieldIndexes
                if (parentMetadata[symbols_1.$refTypeFieldIndexes] !== undefined) {
                    Object.defineProperty(metadata, symbols_1.$refTypeFieldIndexes, {
                        value: [...parentMetadata[symbols_1.$refTypeFieldIndexes]],
                        enumerable: false,
                        configurable: true,
                        writable: true,
                    });
                }
                // $descriptors
                Object.defineProperty(metadata, symbols_1.$descriptors, {
                    value: { ...parentMetadata[symbols_1.$descriptors] },
                    enumerable: false,
                    configurable: true,
                    writable: true,
                });
            }
        }
        Object.defineProperty(constructor, Symbol.metadata, {
            value: metadata,
            writable: false,
            configurable: true
        });
        return metadata;
    },
    isValidInstance(klass) {
        return (klass.constructor[Symbol.metadata] &&
            Object.prototype.hasOwnProperty.call(klass.constructor[Symbol.metadata], symbols_1.$numFields));
    },
    getFields(klass) {
        const metadata = klass[Symbol.metadata];
        const fields = {};
        for (let i = 0; i <= metadata[symbols_1.$numFields]; i++) {
            fields[metadata[i].name] = metadata[i].type;
        }
        return fields;
    },
    hasViewTagAtIndex(metadata, index) {
        return metadata?.[symbols_1.$viewFieldIndexes]?.includes(index);
    }
};
//# sourceMappingURL=Metadata.js.map