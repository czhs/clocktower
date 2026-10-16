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
var dialTimeout_exports = {};
__export(dialTimeout_exports, {
  DEFAULT_RINGING_TIMEOUT_SECONDS: () => DEFAULT_RINGING_TIMEOUT_SECONDS,
  RINGING_TIMEOUT_MARGIN_SECONDS: () => RINGING_TIMEOUT_MARGIN_SECONDS,
  dialRequestTimeout: () => dialRequestTimeout
});
module.exports = __toCommonJS(dialTimeout_exports);
const DEFAULT_RINGING_TIMEOUT_SECONDS = 30;
const RINGING_TIMEOUT_MARGIN_SECONDS = 2;
function dialRequestTimeout(timeout, ringingTimeout) {
  const ring = ringingTimeout ?? DEFAULT_RINGING_TIMEOUT_SECONDS;
  const floor = ring + RINGING_TIMEOUT_MARGIN_SECONDS;
  return Math.max(timeout ?? floor, floor);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_RINGING_TIMEOUT_SECONDS,
  RINGING_TIMEOUT_MARGIN_SECONDS,
  dialRequestTimeout
});
//# sourceMappingURL=dialTimeout.cjs.map