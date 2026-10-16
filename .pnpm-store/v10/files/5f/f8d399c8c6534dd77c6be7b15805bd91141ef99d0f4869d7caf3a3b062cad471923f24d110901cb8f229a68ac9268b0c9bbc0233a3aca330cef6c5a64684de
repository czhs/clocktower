"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var uuid_exports = {};
__export(uuid_exports, {
  getRandomBytes: () => getRandomBytes,
  randomUUID: () => randomUUID
});
module.exports = __toCommonJS(uuid_exports);
async function getRandomBytes(size = 16) {
  var _a;
  if (!((_a = globalThis.crypto) == null ? void 0 : _a.getRandomValues)) {
    throw new Error("Web Crypto API is required (globalThis.crypto.getRandomValues)");
  }
  return crypto.getRandomValues(new Uint8Array(size));
}
async function randomUUID() {
  var _a;
  if (typeof ((_a = globalThis.crypto) == null ? void 0 : _a.randomUUID) === "function") {
    return crypto.randomUUID();
  }
  const bytes = await getRandomBytes(16);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getRandomBytes,
  randomUUID
});
//# sourceMappingURL=uuid.cjs.map