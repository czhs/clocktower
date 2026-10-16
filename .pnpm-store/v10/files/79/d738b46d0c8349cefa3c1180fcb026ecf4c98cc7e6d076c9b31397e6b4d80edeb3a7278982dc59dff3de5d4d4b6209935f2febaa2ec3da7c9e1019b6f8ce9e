import { Duration } from "@bufbuild/protobuf";
import {
  AcceptWhatsAppCallRequest,
  AcceptWhatsAppCallResponse,
  ConnectTwilioCallRequest,
  ConnectTwilioCallResponse,
  ConnectWhatsAppCallRequest,
  ConnectWhatsAppCallResponse,
  DialWhatsAppCallRequest,
  DialWhatsAppCallResponse,
  DisconnectWhatsAppCallRequest,
  DisconnectWhatsAppCallResponse
} from "@livekit/protocol";
import { ServiceBase } from "./ServiceBase.js";
import { TwirpRpc, livekitPackage } from "./TwirpRPC.js";
import { DEFAULT_RINGING_TIMEOUT_SECONDS } from "./dialTimeout.js";
const svc = "Connector";
class ConnectorClient extends ServiceBase {
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
    const req = new DialWhatsAppCallRequest({
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
      ringingTimeout: options.ringingTimeout ? new Duration({ seconds: BigInt(options.ringingTimeout) }) : void 0
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "DialWhatsAppCall",
      req,
      await this.authHeader({ roomCreate: true })
    );
    return DialWhatsAppCallResponse.fromJson(data, { ignoreUnknownFields: true });
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
    const req = new AcceptWhatsAppCallRequest({
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
    const timeout = options.waitUntilAnswered ? options.timeout ?? DEFAULT_RINGING_TIMEOUT_SECONDS : options.timeout;
    const data = await this.rpc.request(
      svc,
      "AcceptWhatsAppCall",
      req,
      await this.authHeader({ roomCreate: true }),
      timeout
    );
    return AcceptWhatsAppCallResponse.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Connect an established WhatsApp call (used for business-initiated calls)
   *
   * @param whatsappCallId - Call ID sent by Meta
   * @param sdp - Session description from Meta
   */
  async connectWhatsAppCall(whatsappCallId, sdp) {
    const req = new ConnectWhatsAppCallRequest({
      whatsappCallId,
      sdp
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "ConnectWhatsAppCall",
      req,
      await this.authHeader({ roomCreate: true })
    );
    return ConnectWhatsAppCallResponse.fromJson(data, { ignoreUnknownFields: true });
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
    const req = new DisconnectWhatsAppCallRequest({
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
    return DisconnectWhatsAppCallResponse.fromJson(data, { ignoreUnknownFields: true });
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
    const req = new ConnectTwilioCallRequest({
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
    return ConnectTwilioCallResponse.fromJson(data, { ignoreUnknownFields: true });
  }
}
export {
  ConnectorClient
};
//# sourceMappingURL=ConnectorClient.js.map