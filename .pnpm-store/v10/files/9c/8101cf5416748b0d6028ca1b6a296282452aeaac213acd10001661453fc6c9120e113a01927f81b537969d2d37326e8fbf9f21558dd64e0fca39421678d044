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
var grants_exports = {};
__export(grants_exports, {
  claimsToJwtPayload: () => claimsToJwtPayload,
  trackSourceToString: () => trackSourceToString
});
module.exports = __toCommonJS(grants_exports);
var import_protocol = require("@livekit/protocol");
function trackSourceToString(source) {
  switch (source) {
    case import_protocol.TrackSource.CAMERA:
      return "camera";
    case import_protocol.TrackSource.MICROPHONE:
      return "microphone";
    case import_protocol.TrackSource.SCREEN_SHARE:
      return "screen_share";
    case import_protocol.TrackSource.SCREEN_SHARE_AUDIO:
      return "screen_share_audio";
    default:
      throw new TypeError(`Cannot convert TrackSource ${source} to string`);
  }
}
function claimsToJwtPayload(grant) {
  var _a;
  const claim = { ...grant };
  if (Array.isArray((_a = claim.video) == null ? void 0 : _a.canPublishSources)) {
    claim.video.canPublishSources = claim.video.canPublishSources.map(trackSourceToString);
  }
  return claim;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  claimsToJwtPayload,
  trackSourceToString
});
//# sourceMappingURL=grants.cjs.map