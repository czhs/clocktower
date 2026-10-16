"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var AccessToken_exports = {};
__export(AccessToken_exports, {
  AccessToken: () => AccessToken,
  TokenVerifier: () => TokenVerifier
});
module.exports = __toCommonJS(AccessToken_exports);
var jose = __toESM(require("jose"), 1);
var import_grants = require("./grants.cjs");
const defaultTTL = `6h`;
const defaultClockToleranceSeconds = 10;
class AccessToken {
  /**
   * Creates a new AccessToken
   * @param apiKey - API Key, can be set in env LIVEKIT_API_KEY
   * @param apiSecret - Secret, can be set in env LIVEKIT_API_SECRET
   */
  constructor(apiKey, apiSecret, options) {
    if (!apiKey) {
      apiKey = process.env.LIVEKIT_API_KEY;
    }
    if (!apiSecret) {
      apiSecret = process.env.LIVEKIT_API_SECRET;
    }
    if (!apiKey || !apiSecret) {
      throw Error("api-key and api-secret must be set");
    } else if (typeof document !== "undefined") {
      console.error(
        "You should not include your API secret in your web client bundle.\n\nYour web client should request a token from your backend server which should then use the API secret to generate a token. See https://docs.livekit.io/client/connect/"
      );
    }
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.grants = {};
    this.identity = options == null ? void 0 : options.identity;
    this.ttl = (options == null ? void 0 : options.ttl) || defaultTTL;
    if (typeof this.ttl === "number") {
      this.ttl = `${this.ttl}s`;
    }
    if (options == null ? void 0 : options.metadata) {
      this.metadata = options.metadata;
    }
    if (options == null ? void 0 : options.attributes) {
      this.attributes = options.attributes;
    }
    if (options == null ? void 0 : options.name) {
      this.name = options.name;
    }
  }
  /**
   * Adds a video grant to this token.
   * @param grant -
   */
  addGrant(grant) {
    this.grants.video = { ...this.grants.video ?? {}, ...grant };
  }
  /**
   * Adds an inference grant to this token.
   * @param grant -
   */
  addInferenceGrant(grant) {
    this.grants.inference = { ...this.grants.inference ?? {}, ...grant };
  }
  /**
   * Adds a SIP grant to this token.
   * @param grant -
   */
  addSIPGrant(grant) {
    this.grants.sip = { ...this.grants.sip ?? {}, ...grant };
  }
  /**
   * Adds an observability grant to this token.
   * @param grant -
   */
  addObservabilityGrant(grant) {
    this.grants.observability = { ...this.grants.observability ?? {}, ...grant };
  }
  get name() {
    return this.grants.name;
  }
  set name(name) {
    this.grants.name = name;
  }
  get metadata() {
    return this.grants.metadata;
  }
  /**
   * Set metadata to be passed to the Participant, used only when joining the room
   */
  set metadata(md) {
    this.grants.metadata = md;
  }
  get attributes() {
    return this.grants.attributes;
  }
  set attributes(attrs) {
    this.grants.attributes = attrs;
  }
  get kind() {
    return this.grants.kind;
  }
  set kind(kind) {
    this.grants.kind = kind;
  }
  get sha256() {
    return this.grants.sha256;
  }
  set sha256(sha) {
    this.grants.sha256 = sha;
  }
  get roomPreset() {
    return this.grants.roomPreset;
  }
  set roomPreset(preset) {
    this.grants.roomPreset = preset;
  }
  get roomConfig() {
    return this.grants.roomConfig;
  }
  set roomConfig(config) {
    this.grants.roomConfig = config;
  }
  /**
   * @returns JWT encoded token
   */
  async toJwt() {
    var _a;
    const secret = new TextEncoder().encode(this.apiSecret);
    const jwt = new jose.SignJWT((0, import_grants.claimsToJwtPayload)(this.grants)).setProtectedHeader({ alg: "HS256" }).setIssuer(this.apiKey).setExpirationTime(this.ttl).setNotBefore(/* @__PURE__ */ new Date());
    if (this.identity) {
      jwt.setSubject(this.identity);
    } else if ((_a = this.grants.video) == null ? void 0 : _a.roomJoin) {
      throw Error("identity is required for join but not set");
    }
    return jwt.sign(secret);
  }
}
class TokenVerifier {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }
  async verify(token, clockTolerance = defaultClockToleranceSeconds) {
    const secret = new TextEncoder().encode(this.apiSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      issuer: this.apiKey,
      clockTolerance,
      // First-party minters always set exp. Without this, a hand-rolled token
      // with a valid signature and no exp verifies forever (livekit/protocol#1706).
      requiredClaims: ["exp"]
    });
    if (!payload) {
      throw Error("invalid token");
    }
    return payload;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AccessToken,
  TokenVerifier
});
//# sourceMappingURL=AccessToken.cjs.map