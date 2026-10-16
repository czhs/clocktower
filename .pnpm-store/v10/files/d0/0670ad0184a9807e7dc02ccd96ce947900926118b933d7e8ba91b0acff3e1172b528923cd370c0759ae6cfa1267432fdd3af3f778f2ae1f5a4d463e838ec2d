"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Reflection = exports.ReflectionType = exports.ReflectionField = void 0;
const annotations_1 = require("./annotations");
const TypeContext_1 = require("./types/TypeContext");
const Metadata_1 = require("./Metadata");
const ArraySchema_1 = require("./types/custom/ArraySchema");
const Encoder_1 = require("./encoder/Encoder");
const Decoder_1 = require("./decoder/Decoder");
const Schema_1 = require("./Schema");
/**
 * Reflection
 */
class ReflectionField extends Schema_1.Schema {
}
exports.ReflectionField = ReflectionField;
__decorate([
    (0, annotations_1.type)("string")
], ReflectionField.prototype, "name", void 0);
__decorate([
    (0, annotations_1.type)("string")
], ReflectionField.prototype, "type", void 0);
__decorate([
    (0, annotations_1.type)("number")
], ReflectionField.prototype, "referencedType", void 0);
class ReflectionType extends Schema_1.Schema {
    constructor() {
        super(...arguments);
        this.fields = new ArraySchema_1.ArraySchema();
    }
}
exports.ReflectionType = ReflectionType;
__decorate([
    (0, annotations_1.type)("number")
], ReflectionType.prototype, "id", void 0);
__decorate([
    (0, annotations_1.type)("number")
], ReflectionType.prototype, "extendsId", void 0);
__decorate([
    (0, annotations_1.type)([ReflectionField])
], ReflectionType.prototype, "fields", void 0);
class Reflection extends Schema_1.Schema {
    constructor() {
        super(...arguments);
        this.types = new ArraySchema_1.ArraySchema();
    }
    /**
     * Encodes the TypeContext of an Encoder into a buffer.
     *
     * @param encoder Encoder instance
     * @param it
     * @returns
     */
    static encode(encoder, it = { offset: 0 }) {
        const context = encoder.context;
        const reflection = new Reflection();
        const reflectionEncoder = new Encoder_1.Encoder(reflection);
        // rootType is usually the first schema passed to the Encoder
        // (unless it inherits from another schema)
        const rootType = context.schemas.get(encoder.state.constructor);
        if (rootType > 0) {
            reflection.rootType = rootType;
        }
        const includedTypeIds = new Set();
        const pendingReflectionTypes = {};
        // add type to reflection in a way that respects inheritance
        // (parent types should be added before their children)
        const addType = (type) => {
            if (type.extendsId === undefined || includedTypeIds.has(type.extendsId)) {
                includedTypeIds.add(type.id);
                reflection.types.push(type);
                const deps = pendingReflectionTypes[type.id];
                if (deps !== undefined) {
                    delete pendingReflectionTypes[type.id];
                    deps.forEach((childType) => addType(childType));
                }
            }
            else {
                if (pendingReflectionTypes[type.extendsId] === undefined) {
                    pendingReflectionTypes[type.extendsId] = [];
                }
                pendingReflectionTypes[type.extendsId].push(type);
            }
        };
        context.schemas.forEach((typeid, klass) => {
            const type = new ReflectionType();
            type.id = Number(typeid);
            // support inheritance
            const inheritFrom = Object.getPrototypeOf(klass);
            if (inheritFrom !== Schema_1.Schema) {
                type.extendsId = context.schemas.get(inheritFrom);
            }
            const metadata = klass[Symbol.metadata];
            //
            // FIXME: this is a workaround for inherited types without additional fields
            // if metadata is the same reference as the parent class - it means the class has no own metadata
            //
            if (metadata !== inheritFrom[Symbol.metadata]) {
                for (const fieldIndex in metadata) {
                    const index = Number(fieldIndex);
                    const fieldName = metadata[index].name;
                    // skip fields from parent classes
                    if (!Object.prototype.hasOwnProperty.call(metadata, fieldName)) {
                        continue;
                    }
                    const reflectionField = new ReflectionField();
                    reflectionField.name = fieldName;
                    let fieldType;
                    const field = metadata[index];
                    if (typeof (field.type) === "string") {
                        fieldType = field.type;
                    }
                    else {
                        let childTypeSchema;
                        //
                        // TODO: refactor below.
                        //
                        if (Schema_1.Schema.is(field.type)) {
                            fieldType = "ref";
                            childTypeSchema = field.type;
                        }
                        else {
                            fieldType = Object.keys(field.type)[0];
                            if (typeof (field.type[fieldType]) === "string") {
                                fieldType += ":" + field.type[fieldType]; // array:string
                            }
                            else {
                                childTypeSchema = field.type[fieldType];
                            }
                        }
                        reflectionField.referencedType = (childTypeSchema)
                            ? context.getTypeId(childTypeSchema)
                            : -1;
                    }
                    reflectionField.type = fieldType;
                    type.fields.push(reflectionField);
                }
            }
            addType(type);
        });
        // in case there are types that were not added due to inheritance
        for (const typeid in pendingReflectionTypes) {
            pendingReflectionTypes[typeid].forEach((type) => reflection.types.push(type));
        }
        const buf = reflectionEncoder.encodeAll(it);
        return buf.slice(0, it.offset);
        // return Buffer.from(buf, 0, it.offset);
    }
    /**
     * Decodes the TypeContext from a buffer into a Decoder instance.
     *
     * @param bytes Reflection.encode() output
     * @param it
     * @returns Decoder instance
     */
    static decode(bytes, it) {
        const reflection = new Reflection();
        const reflectionDecoder = new Decoder_1.Decoder(reflection);
        reflectionDecoder.decode(bytes, it);
        const typeContext = new TypeContext_1.TypeContext();
        // 1st pass, initialize metadata + inheritance
        reflection.types.forEach((reflectionType) => {
            const parentClass = typeContext.get(reflectionType.extendsId) ?? Schema_1.Schema;
            const schema = class _ extends parentClass {
            };
            // register for inheritance support
            TypeContext_1.TypeContext.register(schema);
            // // for inheritance support
            // Metadata.initialize(schema);
            typeContext.add(schema, reflectionType.id);
        }, {});
        // define fields
        const addFields = (metadata, reflectionType, parentFieldIndex) => {
            reflectionType.fields.forEach((field, i) => {
                const fieldIndex = parentFieldIndex + i;
                if (field.referencedType !== undefined) {
                    let fieldType = field.type;
                    let refType = typeContext.get(field.referencedType);
                    // map or array of primitive type (-1)
                    if (!refType) {
                        const typeInfo = field.type.split(":");
                        fieldType = typeInfo[0];
                        refType = typeInfo[1]; // string
                    }
                    if (fieldType === "ref") {
                        Metadata_1.Metadata.addField(metadata, fieldIndex, field.name, refType);
                    }
                    else {
                        Metadata_1.Metadata.addField(metadata, fieldIndex, field.name, { [fieldType]: refType });
                    }
                }
                else {
                    Metadata_1.Metadata.addField(metadata, fieldIndex, field.name, field.type);
                }
            });
        };
        // 2nd pass, set fields
        reflection.types.forEach((reflectionType) => {
            const schema = typeContext.get(reflectionType.id);
            // for inheritance support
            const metadata = Metadata_1.Metadata.initialize(schema);
            const inheritedTypes = [];
            let parentType = reflectionType;
            do {
                inheritedTypes.push(parentType);
                parentType = reflection.types.find((t) => t.id === parentType.extendsId);
            } while (parentType);
            let parentFieldIndex = 0;
            inheritedTypes.reverse().forEach((reflectionType) => {
                // add fields from all inherited classes
                // TODO: refactor this to avoid adding fields from parent classes
                addFields(metadata, reflectionType, parentFieldIndex);
                parentFieldIndex += reflectionType.fields.length;
            });
        });
        const state = new (typeContext.get(reflection.rootType || 0))();
        return new Decoder_1.Decoder(state, typeContext);
    }
}
exports.Reflection = Reflection;
__decorate([
    (0, annotations_1.type)([ReflectionType])
], Reflection.prototype, "types", void 0);
__decorate([
    (0, annotations_1.type)("number")
], Reflection.prototype, "rootType", void 0);
//# sourceMappingURL=Reflection.js.map