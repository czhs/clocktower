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
var digest_exports = {};
__export(digest_exports, {
  digest: () => digest
});
module.exports = __toCommonJS(digest_exports);
async function digest(data) {
  var _a;
  if (!((_a = globalThis.crypto) == null ? void 0 : _a.subtle)) {
    throw new Error("Web Crypto API is required (globalThis.crypto.subtle)");
  }
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(data));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  digest
});
//# sourceMappingURL=digest.cjs.map