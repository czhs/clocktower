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
var StandardSchema_exports = {};
__export(StandardSchema_exports, {
  standardValidate: () => standardValidate
});
module.exports = __toCommonJS(StandardSchema_exports);
function standardValidate(schema, input) {
  let result = schema["~standard"].validate(input);
  if (result instanceof Promise) {
    throw new Error("Schema validation must be synchronous");
  }
  if (result.issues) {
    throw new Error(JSON.stringify(result.issues, null, 2));
  }
  return result.value;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  standardValidate
});
