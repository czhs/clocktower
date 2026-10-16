import {
  CreateIngressRequest,
  DeleteIngressRequest,
  IngressInfo,
  ListIngressRequest,
  ListIngressResponse,
  UpdateIngressRequest
} from "@livekit/protocol";
import { ServiceBase } from "./ServiceBase.js";
import { TwirpRpc, livekitPackage } from "./TwirpRPC.js";
const svc = "Ingress";
class IngressClient extends ServiceBase {
  /**
   * @param host - hostname including protocol. i.e. 'https://<project>.livekit.cloud'
   * @param apiKey - API Key, can be set in env var LIVEKIT_API_KEY
   * @param secret - API Secret, can be set in env var LIVEKIT_API_SECRET
   * @param options - client options
   */
  constructor(host, apiKey, secret, options) {
    super({ apiKey, secret, token: options == null ? void 0 : options.token });
    this.rpc = new TwirpRpc(host, livekitPackage, {
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
    const req = new CreateIngressRequest({
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
    return IngressInfo.fromJson(data, { ignoreUnknownFields: true });
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
    const req = new UpdateIngressRequest({
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
    return IngressInfo.fromJson(data, { ignoreUnknownFields: true });
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
      new ListIngressRequest(req).toJson(),
      await this.authHeader({ ingressAdmin: true })
    );
    return ListIngressResponse.fromJson(data, { ignoreUnknownFields: true }).items ?? [];
  }
  /**
   * @param ingressId - ingress to delete
   */
  async deleteIngress(ingressId) {
    const data = await this.rpc.request(
      svc,
      "DeleteIngress",
      new DeleteIngressRequest({ ingressId }).toJson(),
      await this.authHeader({ ingressAdmin: true })
    );
    return IngressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
}
export {
  IngressClient
};
//# sourceMappingURL=IngressClient.js.map