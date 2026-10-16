import { Duration } from "@bufbuild/protobuf";
import {
  CreateSIPDispatchRuleRequest,
  CreateSIPInboundTrunkRequest,
  CreateSIPOutboundTrunkRequest,
  CreateSIPParticipantRequest,
  CreateSIPTrunkRequest,
  DeleteSIPDispatchRuleRequest,
  DeleteSIPTrunkRequest,
  ListSIPDispatchRuleRequest,
  ListSIPDispatchRuleResponse,
  ListSIPInboundTrunkRequest,
  ListSIPInboundTrunkResponse,
  ListSIPOutboundTrunkRequest,
  ListSIPOutboundTrunkResponse,
  ListSIPTrunkRequest,
  ListSIPTrunkResponse,
  SIPDispatchRule,
  SIPDispatchRuleCallee,
  SIPDispatchRuleDirect,
  SIPDispatchRuleIndividual,
  SIPDispatchRuleInfo,
  SIPInboundTrunkInfo,
  SIPOutboundTrunkInfo,
  SIPParticipantInfo,
  SIPTransport,
  SIPTrunkInfo,
  TransferSIPParticipantRequest,
  UpdateSIPDispatchRuleRequest,
  UpdateSIPInboundTrunkRequest,
  UpdateSIPOutboundTrunkRequest
} from "@livekit/protocol";
import { ServiceBase } from "./ServiceBase.js";
import { ServerError, SipCallError, TwirpRpc, livekitPackage } from "./TwirpRPC.js";
import { DEFAULT_RINGING_TIMEOUT_SECONDS, dialRequestTimeout } from "./dialTimeout.js";
function asSipCallError(e) {
  if (e instanceof ServerError && e.metadata && "sip_status_code" in e.metadata) {
    return SipCallError.fromServerError(e);
  }
  return e;
}
const svc = "SIP";
class SipClient extends ServiceBase {
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
   * @param number - phone number of the trunk
   * @param opts - CreateSipTrunkOptions
   * @deprecated use `createSipInboundTrunk` or `createSipOutboundTrunk`
   */
  async createSipTrunk(number, opts) {
    let inboundAddresses;
    let inboundNumbers;
    let inboundUsername = "";
    let inboundPassword = "";
    let outboundAddress = "";
    let outboundUsername = "";
    let outboundPassword = "";
    let name = "";
    let metadata = "";
    if (opts !== void 0) {
      inboundAddresses = opts.inbound_addresses;
      inboundNumbers = opts.inbound_numbers;
      inboundUsername = opts.inbound_username || "";
      inboundPassword = opts.inbound_password || "";
      outboundAddress = opts.outbound_address || "";
      outboundUsername = opts.outbound_username || "";
      outboundPassword = opts.outbound_password || "";
      name = opts.name || "";
      metadata = opts.metadata || "";
    }
    const req = new CreateSIPTrunkRequest({
      name,
      metadata,
      inboundAddresses,
      inboundNumbers,
      inboundUsername,
      inboundPassword,
      outboundNumber: number,
      outboundAddress,
      outboundUsername,
      outboundPassword
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "CreateSIPTrunk",
      req,
      await this.authHeader({}, { admin: true })
    );
    return SIPTrunkInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Create a new SIP inbound trunk.
   *
   * @param name - human-readable name of the trunk
   * @param numbers - phone numbers of the trunk
   * @param opts - CreateSipTrunkOptions
   * @returns Created SIP inbound trunk
   */
  async createSipInboundTrunk(name, numbers, opts) {
    if (opts === void 0) {
      opts = {};
    }
    const req = new CreateSIPInboundTrunkRequest({
      trunk: new SIPInboundTrunkInfo({
        name,
        numbers,
        metadata: opts == null ? void 0 : opts.metadata,
        allowedAddresses: opts.allowedAddresses ?? opts.allowed_addresses,
        allowedNumbers: opts.allowedNumbers ?? opts.allowed_numbers,
        authUsername: opts.authUsername ?? opts.auth_username,
        authPassword: opts.authPassword ?? opts.auth_password,
        headers: opts.headers,
        headersToAttributes: opts.headersToAttributes,
        includeHeaders: opts.includeHeaders,
        krispEnabled: opts.krispEnabled,
        mediaEncryption: opts.mediaEncryption,
        media: opts.media,
        ringingTimeout: opts.ringingTimeout ? new Duration({ seconds: BigInt(opts.ringingTimeout) }) : void 0
      })
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "CreateSIPInboundTrunk",
      req,
      await this.authHeader({}, { admin: true })
    );
    return SIPInboundTrunkInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Create a new SIP outbound trunk.
   *
   * @param name - human-readable name of the trunk
   * @param address - hostname and port of the SIP server to dial
   * @param numbers - phone numbers of the trunk
   * @param opts - CreateSipTrunkOptions
   * @returns Created SIP outbound trunk
   */
  async createSipOutboundTrunk(name, address, numbers, opts) {
    if (opts === void 0) {
      opts = {
        transport: SIPTransport.SIP_TRANSPORT_AUTO
      };
    }
    const req = new CreateSIPOutboundTrunkRequest({
      trunk: new SIPOutboundTrunkInfo({
        name,
        address,
        numbers,
        metadata: opts.metadata,
        transport: opts.transport,
        authUsername: opts.authUsername ?? opts.auth_username,
        authPassword: opts.authPassword ?? opts.auth_password,
        headers: opts.headers,
        headersToAttributes: opts.headersToAttributes,
        includeHeaders: opts.includeHeaders,
        destinationCountry: opts.destinationCountry,
        mediaEncryption: opts.mediaEncryption,
        media: opts.media
      })
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "CreateSIPOutboundTrunk",
      req,
      await this.authHeader({}, { admin: true })
    );
    return SIPOutboundTrunkInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * @deprecated use `listSipInboundTrunk` or `listSipOutboundTrunk`
   */
  async listSipTrunk() {
    const req = {};
    const data = await this.rpc.request(
      svc,
      "ListSIPTrunk",
      new ListSIPTrunkRequest(req).toJson(),
      await this.authHeader({}, { admin: true })
    );
    return ListSIPTrunkResponse.fromJson(data, { ignoreUnknownFields: true }).items ?? [];
  }
  /**
   * List SIP inbound trunks with optional filtering.
   *
   * @param list - Request with optional filtering parameters
   * @returns Response containing list of SIP inbound trunks
   */
  async listSipInboundTrunk(list = {}) {
    const req = new ListSIPInboundTrunkRequest(list).toJson();
    const data = await this.rpc.request(
      svc,
      "ListSIPInboundTrunk",
      req,
      await this.authHeader({}, { admin: true })
    );
    return ListSIPInboundTrunkResponse.fromJson(data, { ignoreUnknownFields: true }).items ?? [];
  }
  /**
   * List SIP outbound trunks with optional filtering.
   *
   * @param list - Request with optional filtering parameters
   * @returns Response containing list of SIP outbound trunks
   */
  async listSipOutboundTrunk(list = {}) {
    const req = new ListSIPOutboundTrunkRequest(list).toJson();
    const data = await this.rpc.request(
      svc,
      "ListSIPOutboundTrunk",
      req,
      await this.authHeader({}, { admin: true })
    );
    return ListSIPOutboundTrunkResponse.fromJson(data, { ignoreUnknownFields: true }).items ?? [];
  }
  /**
   * Delete a SIP trunk.
   *
   * @param sipTrunkId - ID of the SIP trunk to delete
   * @returns Deleted trunk information
   */
  async deleteSipTrunk(sipTrunkId) {
    const data = await this.rpc.request(
      svc,
      "DeleteSIPTrunk",
      new DeleteSIPTrunkRequest({ sipTrunkId }).toJson(),
      await this.authHeader({}, { admin: true })
    );
    return SIPTrunkInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Create a new SIP dispatch rule.
   *
   * @param rule - SIP dispatch rule to create
   * @param opts - CreateSipDispatchRuleOptions
   * @returns Created SIP dispatch rule
   */
  async createSipDispatchRule(rule, opts) {
    if (opts === void 0) {
      opts = {};
    }
    let ruleProto = void 0;
    if (rule.type == "direct") {
      ruleProto = new SIPDispatchRule({
        rule: {
          case: "dispatchRuleDirect",
          value: new SIPDispatchRuleDirect({
            roomName: rule.roomName,
            pin: rule.pin || ""
          })
        }
      });
    } else if (rule.type == "individual") {
      ruleProto = new SIPDispatchRule({
        rule: {
          case: "dispatchRuleIndividual",
          value: new SIPDispatchRuleIndividual({
            roomPrefix: rule.roomPrefix,
            pin: rule.pin || ""
          })
        }
      });
    } else if (rule.type == "callee") {
      ruleProto = new SIPDispatchRule({
        rule: {
          case: "dispatchRuleCallee",
          value: new SIPDispatchRuleCallee({
            roomPrefix: rule.roomPrefix,
            pin: rule.pin || "",
            randomize: rule.randomize || false
          })
        }
      });
    }
    const req = new CreateSIPDispatchRuleRequest({
      rule: ruleProto,
      trunkIds: opts.trunkIds,
      hidePhoneNumber: opts.hidePhoneNumber,
      name: opts.name,
      metadata: opts.metadata,
      attributes: opts.attributes,
      roomPreset: opts.roomPreset,
      roomConfig: opts.roomConfig
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "CreateSIPDispatchRule",
      req,
      await this.authHeader({}, { admin: true })
    );
    return SIPDispatchRuleInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Updates an existing SIP dispatch rule by replacing it entirely.
   *
   * @param sipDispatchRuleId - ID of the SIP dispatch rule to update
   * @param rule - new SIP dispatch rule
   * @returns Updated SIP dispatch rule
   */
  async updateSipDispatchRule(sipDispatchRuleId, rule) {
    const req = new UpdateSIPDispatchRuleRequest({
      sipDispatchRuleId,
      action: {
        case: "replace",
        value: rule
      }
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "UpdateSIPDispatchRule",
      req,
      await this.authHeader({}, { admin: true })
    );
    return SIPDispatchRuleInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Updates specific fields of an existing SIP dispatch rule.
   * Only provided fields will be updated.
   *
   * @param sipDispatchRuleId - ID of the SIP dispatch rule to update
   * @param fields - Fields of the dispatch rule to update
   * @returns Updated SIP dispatch rule
   */
  async updateSipDispatchRuleFields(sipDispatchRuleId, fields = {}) {
    const req = new UpdateSIPDispatchRuleRequest({
      sipDispatchRuleId,
      action: {
        case: "update",
        value: fields
      }
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "UpdateSIPDispatchRule",
      req,
      await this.authHeader({}, { admin: true })
    );
    return SIPDispatchRuleInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Updates an existing SIP inbound trunk by replacing it entirely.
   *
   * @param sipTrunkId - ID of the SIP inbound trunk to update
   * @param trunk - SIP inbound trunk to update with
   * @returns Updated SIP inbound trunk
   */
  async updateSipInboundTrunk(sipTrunkId, trunk) {
    const req = new UpdateSIPInboundTrunkRequest({
      sipTrunkId,
      action: {
        case: "replace",
        value: trunk
      }
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "UpdateSIPInboundTrunk",
      req,
      await this.authHeader({}, { admin: true })
    );
    return SIPInboundTrunkInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Updates specific fields of an existing SIP inbound trunk.
   * Only provided fields will be updated.
   *
   * @param sipTrunkId - ID of the SIP inbound trunk to update
   * @param fields - Fields of the inbound trunk to update
   * @returns Updated SIP inbound trunk
   */
  async updateSipInboundTrunkFields(sipTrunkId, fields) {
    const req = new UpdateSIPInboundTrunkRequest({
      sipTrunkId,
      action: {
        case: "update",
        value: fields
      }
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "UpdateSIPInboundTrunk",
      req,
      await this.authHeader({}, { admin: true })
    );
    return SIPInboundTrunkInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Updates an existing SIP outbound trunk by replacing it entirely.
   *
   * @param sipTrunkId - ID of the SIP outbound trunk to update
   * @param trunk - SIP outbound trunk to update with
   * @returns Updated SIP outbound trunk
   */
  async updateSipOutboundTrunk(sipTrunkId, trunk) {
    const req = new UpdateSIPOutboundTrunkRequest({
      sipTrunkId,
      action: {
        case: "replace",
        value: trunk
      }
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "UpdateSIPOutboundTrunk",
      req,
      await this.authHeader({}, { admin: true })
    );
    return SIPOutboundTrunkInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Updates specific fields of an existing SIP outbound trunk.
   * Only provided fields will be updated.
   *
   * @param sipTrunkId - ID of the SIP outbound trunk to update
   * @param fields - Fields of the outbound trunk to update
   * @returns Updated SIP outbound trunk
   */
  async updateSipOutboundTrunkFields(sipTrunkId, fields) {
    const req = new UpdateSIPOutboundTrunkRequest({
      sipTrunkId,
      action: {
        case: "update",
        value: fields
      }
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "UpdateSIPOutboundTrunk",
      req,
      await this.authHeader({}, { admin: true })
    );
    return SIPOutboundTrunkInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * List SIP dispatch rules with optional filtering.
   *
   * @param list - Request with optional filtering parameters
   * @returns Response containing list of SIP dispatch rules
   */
  async listSipDispatchRule(list = {}) {
    const req = new ListSIPDispatchRuleRequest(list).toJson();
    const data = await this.rpc.request(
      svc,
      "ListSIPDispatchRule",
      req,
      await this.authHeader({}, { admin: true })
    );
    return ListSIPDispatchRuleResponse.fromJson(data, { ignoreUnknownFields: true }).items ?? [];
  }
  /**
   * Delete a SIP dispatch rule.
   *
   * @param sipDispatchRuleId - ID of the SIP dispatch rule to delete
   * @returns Deleted rule information
   */
  async deleteSipDispatchRule(sipDispatchRuleId) {
    const data = await this.rpc.request(
      svc,
      "DeleteSIPDispatchRule",
      new DeleteSIPDispatchRuleRequest({ sipDispatchRuleId }).toJson(),
      await this.authHeader({}, { admin: true })
    );
    return SIPDispatchRuleInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Create a new SIP participant.
   *
   * @param sipTrunkId - sip trunk to use for the call
   * @param number - number to dial
   * @param roomName - room to attach the call to
   * @param opts - CreateSipParticipantOptions
   * @param outboundTrunkConfig - Optional outbound trunk configuration for sip participant.
   * @returns Created SIP participant
   */
  async createSipParticipant(sipTrunkId, number, roomName, opts, outboundTrunkConfig) {
    if (opts === void 0) {
      opts = {};
    }
    if (opts.waitUntilAnswered) {
      opts.ringingTimeout ??= DEFAULT_RINGING_TIMEOUT_SECONDS;
      opts.timeout = dialRequestTimeout(opts.timeout, opts.ringingTimeout);
    }
    const req = new CreateSIPParticipantRequest({
      sipTrunkId,
      trunk: outboundTrunkConfig,
      sipCallTo: number,
      sipNumber: opts.fromNumber,
      roomName,
      participantIdentity: opts.participantIdentity || "sip-participant",
      participantName: opts.participantName,
      displayName: opts.displayName,
      participantMetadata: opts.participantMetadata,
      participantAttributes: opts.participantAttributes,
      dtmf: opts.dtmf,
      playDialtone: opts.playDialtone ?? opts.playRingtone,
      headers: opts.headers,
      hidePhoneNumber: opts.hidePhoneNumber,
      includeHeaders: opts.includeHeaders,
      ringingTimeout: opts.ringingTimeout ? new Duration({ seconds: BigInt(opts.ringingTimeout) }) : void 0,
      maxCallDuration: opts.maxCallDuration ? new Duration({ seconds: BigInt(opts.maxCallDuration) }) : void 0,
      krispEnabled: opts.krispEnabled,
      waitUntilAnswered: opts.waitUntilAnswered,
      media: opts.media
    }).toJson();
    try {
      const data = await this.rpc.request(
        svc,
        "CreateSIPParticipant",
        req,
        await this.authHeader({}, { call: true }),
        opts.timeout
      );
      return SIPParticipantInfo.fromJson(data, { ignoreUnknownFields: true });
    } catch (e) {
      throw asSipCallError(e);
    }
  }
  /**
   * Transfer a SIP participant to a different room.
   *
   * @param roomName - room the SIP participant to transfer is connectd to
   * @param participantIdentity - identity of the SIP participant to transfer
   * @param transferTo - SIP URL to transfer the participant to
   * @param opts - TransferSipParticipantOptions
   */
  async transferSipParticipant(roomName, participantIdentity, transferTo, opts) {
    if (opts === void 0) {
      opts = {};
    }
    opts.ringingTimeout ??= DEFAULT_RINGING_TIMEOUT_SECONDS;
    opts.timeout = dialRequestTimeout(opts.timeout, opts.ringingTimeout);
    const req = new TransferSIPParticipantRequest({
      participantIdentity,
      roomName,
      transferTo,
      playDialtone: opts.playDialtone,
      headers: opts.headers,
      ringingTimeout: opts.ringingTimeout ? new Duration({ seconds: BigInt(opts.ringingTimeout) }) : void 0
    }).toJson();
    try {
      await this.rpc.request(
        svc,
        "TransferSIPParticipant",
        req,
        await this.authHeader({ roomAdmin: true, room: roomName }, { call: true }),
        opts.timeout
      );
    } catch (e) {
      throw asSipCallError(e);
    }
  }
}
export {
  SipClient
};
//# sourceMappingURL=SipClient.js.map