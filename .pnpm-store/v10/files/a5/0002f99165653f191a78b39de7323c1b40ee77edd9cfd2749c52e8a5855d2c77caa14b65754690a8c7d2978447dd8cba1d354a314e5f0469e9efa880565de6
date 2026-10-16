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
var LiveKitAPI_exports = {};
__export(LiveKitAPI_exports, {
  LiveKitAPI: () => LiveKitAPI
});
module.exports = __toCommonJS(LiveKitAPI_exports);
var import_AgentDispatchClient = require("./AgentDispatchClient.cjs");
var import_ConnectorClient = require("./ConnectorClient.cjs");
var import_EgressClient = require("./EgressClient.cjs");
var import_IngressClient = require("./IngressClient.cjs");
var import_RoomServiceClient = require("./RoomServiceClient.cjs");
var import_SipClient = require("./SipClient.cjs");
class LiveKitAPI {
  /**
   * @param options - server host, credentials, and client options; each value
   *   falls back to its environment variable when omitted.
   */
  constructor(options = {}) {
    const host = options.host || process.env.LIVEKIT_URL;
    if (!host) {
      throw new Error("host is required (pass it or set LIVEKIT_URL)");
    }
    const { apiKey, secret } = options;
    const token = options.token || (apiKey || secret ? void 0 : process.env.LIVEKIT_TOKEN);
    if (!token && !(apiKey ?? process.env.LIVEKIT_API_KEY)) {
      throw new Error("either a token or an API key and secret are required");
    }
    const clientOptions = {
      requestTimeout: options.requestTimeout,
      failover: options.failover,
      token
    };
    this._room = new import_RoomServiceClient.RoomServiceClient(host, apiKey, secret, clientOptions);
    this._egress = new import_EgressClient.EgressClient(host, apiKey, secret, clientOptions);
    this._ingress = new import_IngressClient.IngressClient(host, apiKey, secret, clientOptions);
    this._sip = new import_SipClient.SipClient(host, apiKey, secret, clientOptions);
    this._agentDispatch = new import_AgentDispatchClient.AgentDispatchClient(host, apiKey, secret, clientOptions);
    this._connector = new import_ConnectorClient.ConnectorClient(host, apiKey, secret, clientOptions);
  }
  get room() {
    return this._room;
  }
  get egress() {
    return this._egress;
  }
  get ingress() {
    return this._ingress;
  }
  get sip() {
    return this._sip;
  }
  get agentDispatch() {
    return this._agentDispatch;
  }
  get connector() {
    return this._connector;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LiveKitAPI
});
//# sourceMappingURL=LiveKitAPI.cjs.map