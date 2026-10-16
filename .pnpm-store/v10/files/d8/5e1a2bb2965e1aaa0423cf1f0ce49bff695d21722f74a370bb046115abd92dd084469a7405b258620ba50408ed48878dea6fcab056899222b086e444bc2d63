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
var ConnectorClient_exports = {};
__export(ConnectorClient_exports, {
  ConnectorClient: () => ConnectorClient
});
module.exports = __toCommonJS(ConnectorClient_exports);
var import_protobuf = require("@bufbuild/protobuf");
var import_protocol = require("@livekit/protocol");
var import_ServiceBase = require("./ServiceBase.cjs");
var import_TwirpRPC = require("./TwirpRPC.cjs");
var import_dialTimeout = require("./dialTimeout.cjs");
const svc = "Connector";
class ConnectorClient extends import_ServiceBase.ServiceBase {
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
   * Initiate an outbound WhatsApp call
   *
   * @param options - WhatsApp call options
   * @returns Promise containing the WhatsApp call ID and room name
   */
  async dialWhatsAppCall(options) {
    const whatsappBizOpaqueCallbackData = options.whatsappBizOpaqueCallbackData || "";
    const roomName = options.roomName || "";
    const participantIdentity = options.participantIdentity || "";
    const participantName = options.participantName || "";
    const participantMetadata = options.participantMetadata || "";
    const destinationCountry = options.destinationCountry || "";
    const req = new import_protocol.DialWhatsAppCallRequest({
      whatsappPhoneNumberId: options.whatsappPhoneNumberId,
      whatsappToPhoneNumber: options.whatsappToPhoneNumber,
      whatsappApiKey: options.whatsappApiKey,
      whatsappCloudApiVersion: options.whatsappCloudApiVersion,
      whatsappBizOpaqueCallbackData,
      roomName,
      agents: options.agents,
      participantIdentity,
      participantName,
      participantMetadata,
      participantAttributes: options.participantAttributes,
      destinationCountry,
      ringingTimeout: options.ringingTimeout ? new import_protobuf.Duration({ seconds: BigInt(options.ringingTimeout) }) : void 0
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "DialWhatsAppCall",
      req,
      await this.authHeader({ roomCreate: true })
    );
    return import_protocol.DialWhatsAppCallResponse.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Accept an inbound WhatsApp call
   *
   * @param options - WhatsApp call accept options
   * @returns Promise containing the room name
   */
  async acceptWhatsAppCall(options) {
    const whatsappBizOpaqueCallbackData = options.whatsappBizOpaqueCallbackData || "";
    const roomName = options.roomName || "";
    const participantIdentity = options.participantIdentity || "";
    const participantName = options.participantName || "";
    const participantMetadata = options.participantMetadata || "";
    const destinationCountry = options.destinationCountry || "";
    const req = new import_protocol.AcceptWhatsAppCallRequest({
      whatsappPhoneNumberId: options.whatsappPhoneNumberId,
      whatsappApiKey: options.whatsappApiKey,
      whatsappCloudApiVersion: options.whatsappCloudApiVersion,
      whatsappCallId: options.whatsappCallId,
      whatsappBizOpaqueCallbackData,
      sdp: options.sdp,
      roomName,
      agents: options.agents,
      participantIdentity,
      participantName,
      participantMetadata,
      participantAttributes: options.participantAttributes,
      destinationCountry,
      waitUntilAnswered: options.waitUntilAnswered
    }).toJson();
    const timeout = options.waitUntilAnswered ? options.timeout ?? import_dialTimeout.DEFAULT_RINGING_TIMEOUT_SECONDS : options.timeout;
    const data = await this.rpc.request(
      svc,
      "AcceptWhatsAppCall",
      req,
      await this.authHeader({ roomCreate: true }),
      timeout
    );
    return import_protocol.AcceptWhatsAppCallResponse.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Connect an established WhatsApp call (used for business-initiated calls)
   *
   * @param whatsappCallId - Call ID sent by Meta
   * @param sdp - Session description from Meta
   */
  async connectWhatsAppCall(whatsappCallId, sdp) {
    const req = new import_protocol.ConnectWhatsAppCallRequest({
      whatsappCallId,
      sdp
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "ConnectWhatsAppCall",
      req,
      await this.authHeader({ roomCreate: true })
    );
    return import_protocol.ConnectWhatsAppCallResponse.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Disconnect an active WhatsApp call
   *
   * @param whatsappCallId - Call ID sent by Meta
   * @param whatsappApiKey - The API key of the business that is disconnecting the call.
   *   Required when `disconnectReason` is BUSINESS_INITIATED, optional for USER_INITIATED.
   * @param disconnectReason - Optional reason for disconnecting the call. Defaults to BUSINESS_INITIATED.
   */
  async disconnectWhatsAppCall(whatsappCallId, whatsappApiKey, disconnectReason) {
    const req = new import_protocol.DisconnectWhatsAppCallRequest({
      whatsappCallId,
      whatsappApiKey,
      disconnectReason
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "DisconnectWhatsAppCall",
      req,
      await this.authHeader({ roomCreate: true })
    );
    return import_protocol.DisconnectWhatsAppCallResponse.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Connect a Twilio call to a LiveKit room
   *
   * @param options - Twilio call connection options
   * @returns Promise containing the WebSocket connect URL for Twilio media stream
   */
  async connectTwilioCall(options) {
    const participantIdentity = options.participantIdentity || "";
    const participantName = options.participantName || "";
    const participantMetadata = options.participantMetadata || "";
    const destinationCountry = options.destinationCountry || "";
    const req = new import_protocol.ConnectTwilioCallRequest({
      twilioCallDirection: options.twilioCallDirection,
      roomName: options.roomName,
      agents: options.agents,
      participantIdentity,
      participantName,
      participantMetadata,
      participantAttributes: options.participantAttributes,
      destinationCountry
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "ConnectTwilioCall",
      req,
      await this.authHeader({ roomCreate: true })
    );
    return import_protocol.ConnectTwilioCallResponse.fromJson(data, { ignoreUnknownFields: true });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ConnectorClient
});
//# sourceMappingURL=ConnectorClient.cjs.map