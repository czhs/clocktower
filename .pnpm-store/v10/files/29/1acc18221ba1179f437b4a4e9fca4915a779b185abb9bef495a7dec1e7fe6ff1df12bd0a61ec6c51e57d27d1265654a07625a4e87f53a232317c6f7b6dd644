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
var WebhookReceiver_exports = {};
__export(WebhookReceiver_exports, {
  WebhookEvent: () => WebhookEvent,
  WebhookReceiver: () => WebhookReceiver,
  authorizeHeader: () => authorizeHeader
});
module.exports = __toCommonJS(WebhookReceiver_exports);
var import_protocol = require("@livekit/protocol");
var import_AccessToken = require("./AccessToken.cjs");
var import_digest = require("./crypto/digest.cjs");
const authorizeHeader = "Authorize";
class WebhookEvent extends import_protocol.WebhookEvent {
  constructor() {
    super(...arguments);
    this.event = "";
  }
  static fromBinary(bytes, options) {
    return new WebhookEvent().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new WebhookEvent().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new WebhookEvent().fromJsonString(jsonString, options);
  }
}
class WebhookReceiver {
  constructor(apiKey, apiSecret) {
    this.verifier = new import_AccessToken.TokenVerifier(apiKey, apiSecret);
  }
  /**
   * @param body - string of the posted body
   * @param authHeader - `Authorization` header from the request
   * @param skipAuth - true to skip auth validation
   * @param clockTolerance - How much tolerance to allow for checks against the auth header to be skewed from the claims
   * @returns The processed webhook event
   */
  async receive(body, authHeader, skipAuth = false, clockTolerance) {
    if (!skipAuth) {
      if (!authHeader) {
        throw new Error("authorization header is empty");
      }
      const claims = await this.verifier.verify(authHeader, clockTolerance);
      const hash = await (0, import_digest.digest)(body);
      const hashDecoded = btoa(
        Array.from(new Uint8Array(hash)).map((v) => String.fromCharCode(v)).join("")
      );
      if (claims.sha256 !== hashDecoded) {
        throw new Error("sha256 checksum of body does not match");
      }
    }
    return WebhookEvent.fromJson(JSON.parse(body), { ignoreUnknownFields: true });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WebhookEvent,
  WebhookReceiver,
  authorizeHeader
});
//# sourceMappingURL=WebhookReceiver.cjs.map