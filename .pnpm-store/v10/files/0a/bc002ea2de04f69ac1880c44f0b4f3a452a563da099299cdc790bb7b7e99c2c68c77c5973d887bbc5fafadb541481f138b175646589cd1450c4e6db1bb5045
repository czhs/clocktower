"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registeredTypes = void 0;
exports.registerType = registerType;
exports.getIdentifier = getIdentifier;
exports.getType = getType;
exports.defineCustomTypes = defineCustomTypes;
const annotations_1 = require("../annotations");
const encode_1 = require("../encoding/encode");
const decode_1 = require("../encoding/decode");
exports.registeredTypes = {};
const identifiers = new Map();
function registerType(identifier, definition) {
    if (definition.constructor) {
        identifiers.set(definition.constructor, identifier);
        exports.registeredTypes[identifier] = definition;
    }
    if (definition.encode) {
        encode_1.encode[identifier] = definition.encode;
    }
    if (definition.decode) {
        decode_1.decode[identifier] = definition.decode;
    }
}
function getIdentifier(klass) {
    return identifiers.get(klass);
}
function getType(identifier) {
    return exports.registeredTypes[identifier];
}
function defineCustomTypes(types) {
    for (const identifier in types) {
        registerType(identifier, types[identifier]);
    }
    return (t) => (0, annotations_1.type)(t);
}
//# sourceMappingURL=registry.js.map