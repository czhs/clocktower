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
var IngressClient_exports = {};
__export(IngressClient_exports, {
  IngressClient: () => IngressClient
});
module.exports = __toCommonJS(IngressClient_exports);
var import_protocol = require("@livekit/protocol");
var import_ServiceBase = require("./ServiceBase.cjs");
var import_TwirpRPC = require("./TwirpRPC.cjs");
const svc = "Ingress";
class IngressClient extends import_ServiceBase.ServiceBase {
  /**
   * @param host - hostname including protocol. i.e. 'https://<project>.livekit.cloud'
   * @param apiKey - API Key, can be set in env var LIVEKIT_API_KEY
   * @param secret - API Secret, can be set in env var LIVEKIT_API_SECRET
   * @param options - client options
   */
  constructor(host, apiKey, secret, options) {
    super({ apiKey, secret, token: options == null ? void 0 : options.token });
    this.rpc = new import_TwirpRPC.TwirpRpc(host, import_TwirpRPC.livekitPackage, {
      requestTimeout: options == null ? void 0 : options.requestTimeout,
      failover: options == null ? void 0 : options.failover
    });
  }
  /**
   * @param inputType - protocol for the ingress
   * @param opts - CreateIngressOptions
   */
  async createIngress(inputType, opts) {
    let name = "";
    let participantName = "";
    let participantIdentity = "";
    let bypassTranscoding = false;
    let url = "";
    if (opts == null) {
      throw new Error("options dictionary is required");
    }
    const roomName = opts.roomName;
    const enableTranscoding = opts.enableTranscoding;
    const enabled = opts.enabled;
    const audio = opts.audio;
    const video = opts.video;
    const participantMetadata = opts.participantMetadata;
    name = opts.name || "";
    participantName = opts.participantName || "";
    participantIdentity = opts.participantIdentity || "";
    bypassTranscoding = opts.bypassTranscoding || false;
    url = opts.url || "";
    if (typeof roomName == "undefined") {
      throw new Error("required roomName option not provided");
    }
    if (participantIdentity == "") {
      throw new Error("required participantIdentity option not provided");
    }
    const req = new import_protocol.CreateIngressRequest({
      inputType,
      name,
      roomName,
      participantIdentity,
      participantMetadata,
      participantName,
      bypassTranscoding,
      enableTranscoding,
      url,
      enabled,
      audio,
      video
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "CreateIngress",
      req,
      await this.authHeader({ ingressAdmin: true })
    );
    return import_protocol.IngressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * @param ingressId - ID of the ingress to update
   * @param opts - UpdateIngressOptions
   */
  async updateIngress(ingressId, opts) {
    const name = opts.name || "";
    const roomName = opts.roomName || "";
    const participantName = opts.participantName || "";
    const participantIdentity = opts.participantIdentity || "";
    const { participantMetadata } = opts;
    const { audio, video, bypassTranscoding, enableTranscoding, enabled } = opts;
    const req = new import_protocol.UpdateIngressRequest({
      ingressId,
      name,
      roomName,
      participantIdentity,
      participantName,
      participantMetadata,
      bypassTranscoding,
      enableTranscoding,
      enabled,
      audio,
      video
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "UpdateIngress",
      req,
      await this.authHeader({ ingressAdmin: true })
    );
    return import_protocol.IngressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * @param arg - list room name or options
   */
  async listIngress(arg) {
    let req = {};
    if (typeof arg === "string") {
      req.roomName = arg;
    } else if (arg) {
      req = arg;
    }
    const data = await this.rpc.request(
      svc,
      "ListIngress",
      new import_protocol.ListIngressRequest(req).toJson(),
      await this.authHeader({ ingressAdmin: true })
    );
    return import_protocol.ListIngressResponse.fromJson(data, { ignoreUnknownFields: true }).items ?? [];
  }
  /**
   * @param ingressId - ingress to delete
   */
  async deleteIngress(ingressId) {
    const data = await this.rpc.request(
      svc,
      "DeleteIngress",
      new import_protocol.DeleteIngressRequest({ ingressId }).toJson(),
      await this.authHeader({ ingressAdmin: true })
    );
    return import_protocol.IngressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IngressClient
});
//# sourceMappingURL=IngressClient.cjs.map