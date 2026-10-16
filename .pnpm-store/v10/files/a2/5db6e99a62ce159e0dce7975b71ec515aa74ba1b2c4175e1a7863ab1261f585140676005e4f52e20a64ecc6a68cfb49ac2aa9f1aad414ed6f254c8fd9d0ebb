"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_VIEW_TAG = void 0;
exports.entity = entity;
exports.view = view;
exports.unreliable = unreliable;
exports.type = type;
exports.getPropertyDescriptor = getPropertyDescriptor;
exports.deprecated = deprecated;
exports.defineTypes = defineTypes;
exports.schema = schema;
require("./symbol.shim");
const Schema_1 = require("./Schema");
const ArraySchema_1 = require("./types/custom/ArraySchema");
const MapSchema_1 = require("./types/custom/MapSchema");
const Metadata_1 = require("./Metadata");
const symbols_1 = require("./types/symbols");
const registry_1 = require("./types/registry");
const spec_1 = require("./encoding/spec");
const TypeContext_1 = require("./types/TypeContext");
const assert_1 = require("./encoding/assert");
const CollectionSchema_1 = require("./types/custom/CollectionSchema");
const SetSchema_1 = require("./types/custom/SetSchema");
exports.DEFAULT_VIEW_TAG = -1;
function entity(constructor) {
    TypeContext_1.TypeContext.register(constructor);
    return constructor;
}
/**
 * [See documentation](https://docs.colyseus.io/state/schema/)
 *
 * Annotate a Schema property to be serializeable.
 * \@type()'d fields are automatically flagged as "dirty" for the next patch.
 *
 * @example Standard usage, with automatic change tracking.
 * ```
 * \@type("string") propertyName: string;
 * ```
 *
 * @example You can provide the "manual" option if you'd like to manually control your patches via .setDirty().
 * ```
 * \@type("string", { manual: true })
 * ```
 */
// export function type(type: DefinitionType, options?: TypeOptions) {
//     return function ({ get, set }, context: ClassAccessorDecoratorContext): ClassAccessorDecoratorResult<Schema, any> {
//         if (context.kind !== "accessor") {
//             throw new Error("@type() is only supported for class accessor properties");
//         }
//         const field = context.name.toString();
//         //
//         // detect index for this field, considering inheritance
//         //
//         const parent = Object.getPrototypeOf(context.metadata);
//         let fieldIndex: number = context.metadata[$numFields] // current structure already has fields defined
//             ?? (parent && parent[$numFields]) // parent structure has fields defined
//             ?? -1; // no fields defined
//         fieldIndex++;
//         if (
//             !parent && // the parent already initializes the `$changes` property
//             !Metadata.hasFields(context.metadata)
//         ) {
//             context.addInitializer(function (this: Ref) {
//                 Object.defineProperty(this, $changes, {
//                     value: new ChangeTree(this),
//                     enumerable: false,
//                     writable: true
//                 });
//             });
//         }
//         Metadata.addField(context.metadata, fieldIndex, field, type);
//         const isArray = ArraySchema.is(type);
//         const isMap = !isArray && MapSchema.is(type);
//         // if (options && options.manual) {
//         //     // do not declare getter/setter descriptor
//         //     definition.descriptors[field] = {
//         //         enumerable: true,
//         //         configurable: true,
//         //         writable: true,
//         //     };
//         //     return;
//         // }
//         return {
//             init(value) {
//                 // TODO: may need to convert ArraySchema/MapSchema here
//                 // do not flag change if value is undefined.
//                 if (value !== undefined) {
//                     this[$changes].change(fieldIndex);
//                     // automaticallty transform Array into ArraySchema
//                     if (isArray) {
//                         if (!(value instanceof ArraySchema)) {
//                             value = new ArraySchema(...value);
//                         }
//                         value[$childType] = Object.values(type)[0];
//                     }
//                     // automaticallty transform Map into MapSchema
//                     if (isMap) {
//                         if (!(value instanceof MapSchema)) {
//                             value = new MapSchema(value);
//                         }
//                         value[$childType] = Object.values(type)[0];
//                     }
//                     // try to turn provided structure into a Proxy
//                     if (value['$proxy'] === undefined) {
//                         if (isMap) {
//                             value = getMapProxy(value);
//                         }
//                     }
//                 }
//                 return value;
//             },
//             get() {
//                 return get.call(this);
//             },
//             set(value: any) {
//                 /**
//                  * Create Proxy for array or map items
//                  */
//                 // skip if value is the same as cached.
//                 if (value === get.call(this)) {
//                     return;
//                 }
//                 if (
//                     value !== undefined &&
//                     value !== null
//                 ) {
//                     // automaticallty transform Array into ArraySchema
//                     if (isArray) {
//                         if (!(value instanceof ArraySchema)) {
//                             value = new ArraySchema(...value);
//                         }
//                         value[$childType] = Object.values(type)[0];
//                     }
//                     // automaticallty transform Map into MapSchema
//                     if (isMap) {
//                         if (!(value instanceof MapSchema)) {
//                             value = new MapSchema(value);
//                         }
//                         value[$childType] = Object.values(type)[0];
//                     }
//                     // try to turn provided structure into a Proxy
//                     if (value['$proxy'] === undefined) {
//                         if (isMap) {
//                             value = getMapProxy(value);
//                         }
//                     }
//                     // flag the change for encoding.
//                     this[$changes].change(fieldIndex);
//                     //
//                     // call setParent() recursively for this and its child
//                     // structures.
//                     //
//                     if (value[$changes]) {
//                         value[$changes].setParent(
//                             this,
//                             this[$changes].root,
//                             Metadata.getIndex(context.metadata, field),
//                         );
//                     }
//                 } else if (get.call(this)) {
//                     //
//                     // Setting a field to `null` or `undefined` will delete it.
//                     //
//                     this[$changes].delete(field);
//                 }
//                 set.call(this, value);
//             },
//         };
//     }
// }
function view(tag = exports.DEFAULT_VIEW_TAG) {
    return function (target, fieldName) {
        const constructor = target.constructor;
        const parentClass = Object.getPrototypeOf(constructor);
        const parentMetadata = parentClass[Symbol.metadata];
        // TODO: use Metadata.initialize()
        const metadata = (constructor[Symbol.metadata] ??= Object.assign({}, constructor[Symbol.metadata], parentMetadata ?? Object.create(null)));
        // const fieldIndex = metadata[fieldName];
        // if (!metadata[fieldIndex]) {
        //     //
        //     // detect index for this field, considering inheritance
        //     //
        //     metadata[fieldIndex] = {
        //         type: undefined,
        //         index: (metadata[$numFields] // current structure already has fields defined
        //             ?? (parentMetadata && parentMetadata[$numFields]) // parent structure has fields defined
        //             ?? -1) + 1 // no fields defined
        //     }
        // }
        Metadata_1.Metadata.setTag(metadata, fieldName, tag);
    };
}
function unreliable(target, field) {
    //
    // FIXME: the following block of code is repeated across `@type()`, `@deprecated()` and `@unreliable()` decorators.
    //
    const constructor = target.constructor;
    const parentClass = Object.getPrototypeOf(constructor);
    const parentMetadata = parentClass[Symbol.metadata];
    // TODO: use Metadata.initialize()
    const metadata = (constructor[Symbol.metadata] ??= Object.assign({}, constructor[Symbol.metadata], parentMetadata ?? Object.create(null)));
    // if (!metadata[field]) {
    //     //
    //     // detect index for this field, considering inheritance
    //     //
    //     metadata[field] = {
    //         type: undefined,
    //         index: (metadata[$numFields] // current structure already has fields defined
    //             ?? (parentMetadata && parentMetadata[$numFields]) // parent structure has fields defined
    //             ?? -1) + 1 // no fields defined
    //     }
    // }
    // add owned flag to the field
    metadata[metadata[field]].unreliable = true;
}
function type(type, options) {
    return function (target, field) {
        const constructor = target.constructor;
        if (!type) {
            throw new Error(`${constructor.name}: @type() reference provided for "${field}" is undefined. Make sure you don't have any circular dependencies.`);
        }
        // Normalize type (enum/collection/etc)
        type = (0, Metadata_1.getNormalizedType)(type);
        // for inheritance support
        TypeContext_1.TypeContext.register(constructor);
        const parentClass = Object.getPrototypeOf(constructor);
        const parentMetadata = parentClass[Symbol.metadata];
        const metadata = Metadata_1.Metadata.initialize(constructor);
        let fieldIndex = metadata[field];
        /**
         * skip if descriptor already exists for this field (`@deprecated()`)
         */
        if (metadata[fieldIndex] !== undefined) {
            if (metadata[fieldIndex].deprecated) {
                // do not create accessors for deprecated properties.
                return;
            }
            else if (metadata[fieldIndex].type !== undefined) {
                // trying to define same property multiple times across inheritance.
                // https://github.com/colyseus/colyseus-unity3d/issues/131#issuecomment-814308572
                try {
                    throw new Error(`@colyseus/schema: Duplicate '${field}' definition on '${constructor.name}'.\nCheck @type() annotation`);
                }
                catch (e) {
                    const definitionAtLine = e.stack.split("\n")[4].trim();
                    throw new Error(`${e.message} ${definitionAtLine}`);
                }
            }
        }
        else {
            //
            // detect index for this field, considering inheritance
            //
            fieldIndex = metadata[symbols_1.$numFields] // current structure already has fields defined
                ?? (parentMetadata && parentMetadata[symbols_1.$numFields]) // parent structure has fields defined
                ?? -1; // no fields defined
            fieldIndex++;
        }
        if (options && options.manual) {
            Metadata_1.Metadata.addField(metadata, fieldIndex, field, type, {
                // do not declare getter/setter descriptor
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
        else {
            const complexTypeKlass = typeof (Object.keys(type)[0]) === "string" && (0, registry_1.getType)(Object.keys(type)[0]);
            const childType = (complexTypeKlass)
                ? Object.values(type)[0]
                : type;
            Metadata_1.Metadata.addField(metadata, fieldIndex, field, type, getPropertyDescriptor(`_${field}`, fieldIndex, childType, complexTypeKlass));
        }
    };
}
function getPropertyDescriptor(fieldCached, fieldIndex, type, complexTypeKlass) {
    return {
        get: function () { return this[fieldCached]; },
        set: function (value) {
            const previousValue = this[fieldCached] ?? undefined;
            // skip if value is the same as cached.
            if (value === previousValue) {
                return;
            }
            if (value !== undefined &&
                value !== null) {
                if (complexTypeKlass) {
                    // automaticallty transform Array into ArraySchema
                    if (complexTypeKlass.constructor === ArraySchema_1.ArraySchema && !(value instanceof ArraySchema_1.ArraySchema)) {
                        value = new ArraySchema_1.ArraySchema(...value);
                    }
                    // automaticallty transform Map into MapSchema
                    if (complexTypeKlass.constructor === MapSchema_1.MapSchema && !(value instanceof MapSchema_1.MapSchema)) {
                        value = new MapSchema_1.MapSchema(value);
                    }
                    // // automaticallty transform Array into SetSchema
                    // if (complexTypeKlass.constructor === SetSchema && !(value instanceof SetSchema)) {
                    //     value = new SetSchema(value);
                    // }
                    value[symbols_1.$childType] = type;
                }
                else if (typeof (type) !== "string") {
                    (0, assert_1.assertInstanceType)(value, type, this, fieldCached.substring(1));
                }
                else {
                    (0, assert_1.assertType)(value, type, this, fieldCached.substring(1));
                }
                const changeTree = this[symbols_1.$changes];
                //
                // Replacing existing "ref", remove it from root.
                //
                if (previousValue !== undefined && previousValue[symbols_1.$changes]) {
                    changeTree.root?.remove(previousValue[symbols_1.$changes]);
                    this.constructor[symbols_1.$track](changeTree, fieldIndex, spec_1.OPERATION.DELETE_AND_ADD);
                }
                else {
                    this.constructor[symbols_1.$track](changeTree, fieldIndex, spec_1.OPERATION.ADD);
                }
                //
                // call setParent() recursively for this and its child
                // structures.
                //
                value[symbols_1.$changes]?.setParent(this, changeTree.root, fieldIndex);
            }
            else if (previousValue !== undefined) {
                //
                // Setting a field to `null` or `undefined` will delete it.
                //
                this[symbols_1.$changes].delete(fieldIndex);
            }
            this[fieldCached] = value;
        },
        enumerable: true,
        configurable: true
    };
}
/**
 * `@deprecated()` flag a field as deprecated.
 * The previous `@type()` annotation should remain along with this one.
 */
function deprecated(throws = true) {
    return function (klass, field) {
        //
        // FIXME: the following block of code is repeated across `@type()`, `@deprecated()` and `@unreliable()` decorators.
        //
        const constructor = klass.constructor;
        const parentClass = Object.getPrototypeOf(constructor);
        const parentMetadata = parentClass[Symbol.metadata];
        const metadata = (constructor[Symbol.metadata] ??= Object.assign({}, constructor[Symbol.metadata], parentMetadata ?? Object.create(null)));
        const fieldIndex = metadata[field];
        // if (!metadata[field]) {
        //     //
        //     // detect index for this field, considering inheritance
        //     //
        //     metadata[field] = {
        //         type: undefined,
        //         index: (metadata[$numFields] // current structure already has fields defined
        //             ?? (parentMetadata && parentMetadata[$numFields]) // parent structure has fields defined
        //             ?? -1) + 1 // no fields defined
        //     }
        // }
        metadata[fieldIndex].deprecated = true;
        if (throws) {
            metadata[symbols_1.$descriptors] ??= {};
            metadata[symbols_1.$descriptors][field] = {
                get: function () { throw new Error(`${field} is deprecated.`); },
                set: function (value) { },
                enumerable: false,
                configurable: true
            };
        }
        // flag metadata[field] as non-enumerable
        Object.defineProperty(metadata, fieldIndex, {
            value: metadata[fieldIndex],
            enumerable: false,
            configurable: true
        });
    };
}
function defineTypes(target, fields, options) {
    for (let field in fields) {
        type(fields[field], options)(target.prototype, field);
    }
    return target;
}
function schema(fieldsAndMethods, name, inherits = Schema_1.Schema) {
    const fields = {};
    const methods = {};
    const defaultValues = {};
    const viewTagFields = {};
    for (let fieldName in fieldsAndMethods) {
        const value = fieldsAndMethods[fieldName];
        if (typeof (value) === "object") {
            if (value['view'] !== undefined) {
                viewTagFields[fieldName] = (typeof (value['view']) === "boolean")
                    ? exports.DEFAULT_VIEW_TAG
                    : value['view'];
            }
            fields[fieldName] = (0, Metadata_1.getNormalizedType)(value);
            // If no explicit default provided, handle automatic instantiation for collection types
            if (!Object.prototype.hasOwnProperty.call(value, 'default')) {
                // TODO: remove Array.isArray() check. Use ['array'] !== undefined only.
                if (Array.isArray(value) || value['array'] !== undefined) {
                    // Collection: Array → new ArraySchema()
                    defaultValues[fieldName] = new ArraySchema_1.ArraySchema();
                }
                else if (value['map'] !== undefined) {
                    // Collection: Map → new MapSchema()
                    defaultValues[fieldName] = new MapSchema_1.MapSchema();
                }
                else if (value['collection'] !== undefined) {
                    // Collection: Collection → new CollectionSchema()
                    defaultValues[fieldName] = new CollectionSchema_1.CollectionSchema();
                }
                else if (value['set'] !== undefined) {
                    // Collection: Set → new SetSchema()
                    defaultValues[fieldName] = new SetSchema_1.SetSchema();
                }
                else if (value['type'] !== undefined && Schema_1.Schema.is(value['type'])) {
                    // Direct Schema type: Type → new Type()
                    if (!value['type'].prototype.initialize || value['type'].prototype.initialize.length === 0) {
                        // only auto-initialize Schema instances if:
                        // - they don't have an initialize method
                        // - or initialize method doesn't accept any parameters
                        defaultValues[fieldName] = new value['type']();
                    }
                }
            }
            else {
                defaultValues[fieldName] = value['default'];
            }
        }
        else if (typeof (value) === "function") {
            if (Schema_1.Schema.is(value)) {
                // Direct Schema type: Type → new Type()
                if (!value.prototype.initialize || value.prototype.initialize.length === 0) {
                    // only auto-initialize Schema instances if:
                    // - they don't have an initialize method
                    // - or initialize method doesn't accept any parameters
                    defaultValues[fieldName] = new value();
                }
                fields[fieldName] = (0, Metadata_1.getNormalizedType)(value);
            }
            else {
                methods[fieldName] = value;
            }
        }
        else {
            fields[fieldName] = (0, Metadata_1.getNormalizedType)(value);
        }
    }
    const getDefaultValues = () => {
        const defaults = {};
        // use current class default values
        for (const fieldName in defaultValues) {
            const defaultValue = defaultValues[fieldName];
            if (defaultValue && typeof defaultValue.clone === 'function') {
                // complex, cloneable values, e.g. Schema, ArraySchema, MapSchema, CollectionSchema, SetSchema
                defaults[fieldName] = defaultValue.clone();
            }
            else {
                // primitives and non-cloneable values
                defaults[fieldName] = defaultValue;
            }
        }
        return defaults;
    };
    const getParentProps = (props) => {
        const fieldNames = Object.keys(fields);
        const parentProps = {};
        for (const key in props) {
            if (!fieldNames.includes(key)) {
                parentProps[key] = props[key];
            }
        }
        return parentProps;
    };
    /** @codegen-ignore */
    const klass = Metadata_1.Metadata.setFields(class extends inherits {
        constructor(...args) {
            // call initialize method
            if (methods.initialize && typeof methods.initialize === 'function') {
                super(Object.assign({}, getDefaultValues(), getParentProps(args[0] || {})));
                /**
                 * only call initialize() in the current class, not the parent ones.
                 * see "should not call initialize automatically when creating an instance of inherited Schema"
                 */
                if (new.target === klass) {
                    methods.initialize.apply(this, args);
                }
            }
            else {
                super(Object.assign({}, getDefaultValues(), args[0] || {}));
            }
        }
    }, fields);
    // Store the getDefaultValues function on the class for inheritance
    klass._getDefaultValues = getDefaultValues;
    // Add methods to the prototype
    Object.assign(klass.prototype, methods);
    for (let fieldName in viewTagFields) {
        view(viewTagFields[fieldName])(klass.prototype, fieldName);
    }
    if (name) {
        Object.defineProperty(klass, "name", { value: name });
    }
    klass.extends = (fields, name) => schema(fields, name, klass);
    return klass;
}
//# sourceMappingURL=annotations.js.map