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
var EgressClient_exports = {};
__export(EgressClient_exports, {
  EgressClient: () => EgressClient
});
module.exports = __toCommonJS(EgressClient_exports);
var import_protocol = require("@livekit/protocol");
var import_ServiceBase = require("./ServiceBase.cjs");
var import_TwirpRPC = require("./TwirpRPC.cjs");
const svc = "Egress";
class EgressClient extends import_ServiceBase.ServiceBase {
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
  async startRoomCompositeEgress(roomName, output, optsOrLayout, options, audioOnly, videoOnly, customBaseUrl, audioMixing) {
    let layout;
    let webhooks;
    if (optsOrLayout !== void 0) {
      if (typeof optsOrLayout === "string") {
        layout = optsOrLayout;
      } else {
        const opts = optsOrLayout;
        layout = opts.layout;
        options = opts.encodingOptions;
        audioOnly = opts.audioOnly;
        videoOnly = opts.videoOnly;
        customBaseUrl = opts.customBaseUrl;
        audioMixing = opts.audioMixing;
        webhooks = opts.webhooks;
      }
    }
    layout ??= "";
    audioOnly ??= false;
    videoOnly ??= false;
    customBaseUrl ??= "";
    audioMixing ??= import_protocol.AudioMixing.DEFAULT_MIXING;
    const {
      output: legacyOutput,
      options: egressOptions,
      fileOutputs,
      streamOutputs,
      segmentOutputs,
      imageOutputs
    } = this.getOutputParams(output, options);
    const req = new import_protocol.RoomCompositeEgressRequest({
      roomName,
      layout,
      audioOnly,
      audioMixing,
      videoOnly,
      customBaseUrl,
      output: legacyOutput,
      options: egressOptions,
      fileOutputs,
      streamOutputs,
      segmentOutputs,
      imageOutputs,
      webhooks
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "StartRoomCompositeEgress",
      req,
      await this.authHeader({ roomRecord: true })
    );
    return import_protocol.EgressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * @param url - url
   * @param output - file or stream output
   * @param opts - WebOptions
   */
  async startWebEgress(url, output, opts) {
    const audioOnly = (opts == null ? void 0 : opts.audioOnly) || false;
    const videoOnly = (opts == null ? void 0 : opts.videoOnly) || false;
    const awaitStartSignal = (opts == null ? void 0 : opts.awaitStartSignal) || false;
    const webhooks = (opts == null ? void 0 : opts.webhooks) || [];
    const {
      output: legacyOutput,
      options,
      fileOutputs,
      streamOutputs,
      segmentOutputs,
      imageOutputs
    } = this.getOutputParams(output, opts == null ? void 0 : opts.encodingOptions);
    const req = new import_protocol.WebEgressRequest({
      url,
      audioOnly,
      videoOnly,
      awaitStartSignal,
      output: legacyOutput,
      options,
      fileOutputs,
      streamOutputs,
      segmentOutputs,
      imageOutputs,
      webhooks
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "StartWebEgress",
      req,
      await this.authHeader({ roomRecord: true })
    );
    return import_protocol.EgressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Export a participant's audio and video tracks,
   *
   * @param roomName - room name
   * @param output - one or more outputs
   * @param opts - ParticipantEgressOptions
   */
  async startParticipantEgress(roomName, identity, output, opts) {
    const webhooks = (opts == null ? void 0 : opts.webhooks) || [];
    const { options, fileOutputs, streamOutputs, segmentOutputs, imageOutputs } = this.getOutputParams(output, opts == null ? void 0 : opts.encodingOptions);
    const req = new import_protocol.ParticipantEgressRequest({
      roomName,
      identity,
      screenShare: (opts == null ? void 0 : opts.screenShare) ?? false,
      options,
      fileOutputs,
      streamOutputs,
      segmentOutputs,
      imageOutputs,
      webhooks
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "StartParticipantEgress",
      req,
      await this.authHeader({ roomRecord: true })
    );
    return import_protocol.EgressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  async startTrackCompositeEgress(roomName, output, optsOrAudioTrackId, videoTrackId, options) {
    let audioTrackId;
    let webhooks;
    if (optsOrAudioTrackId !== void 0) {
      if (typeof optsOrAudioTrackId === "string") {
        audioTrackId = optsOrAudioTrackId;
      } else {
        const opts = optsOrAudioTrackId;
        audioTrackId = opts.audioTrackId;
        videoTrackId = opts.videoTrackId;
        options = opts.encodingOptions;
        webhooks = opts.webhooks;
      }
    }
    audioTrackId ??= "";
    videoTrackId ??= "";
    const {
      output: legacyOutput,
      options: egressOptions,
      fileOutputs,
      streamOutputs,
      segmentOutputs,
      imageOutputs
    } = this.getOutputParams(output, options);
    const req = new import_protocol.TrackCompositeEgressRequest({
      roomName,
      audioTrackId,
      videoTrackId,
      output: legacyOutput,
      options: egressOptions,
      fileOutputs,
      streamOutputs,
      segmentOutputs,
      imageOutputs,
      webhooks
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "StartTrackCompositeEgress",
      req,
      await this.authHeader({ roomRecord: true })
    );
    return import_protocol.EgressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isEncodedOutputs(output) {
    return output.file !== void 0 || output.stream !== void 0 || output.segments !== void 0 || output.images !== void 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isEncodedFileOutput(output) {
    return output.filepath !== void 0 || output.fileType !== void 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isSegmentedFileOutput(output) {
    return output.filenamePrefix !== void 0 || output.playlistName !== void 0 || output.filenameSuffix !== void 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isStreamOutput(output) {
    return output.protocol !== void 0 || output.urls !== void 0;
  }
  getOutputParams(output, opts) {
    let file;
    let fileOutputs;
    let stream;
    let streamOutputs;
    let segments;
    let segmentOutputs;
    let imageOutputs;
    if (this.isEncodedOutputs(output)) {
      if (output.file !== void 0) {
        fileOutputs = [output.file];
      }
      if (output.stream !== void 0) {
        streamOutputs = [output.stream];
      }
      if (output.segments !== void 0) {
        segmentOutputs = [output.segments];
      }
      if (output.images !== void 0) {
        imageOutputs = [output.images];
      }
    } else if (this.isEncodedFileOutput(output)) {
      file = output;
      fileOutputs = [file];
    } else if (this.isSegmentedFileOutput(output)) {
      segments = output;
      segmentOutputs = [segments];
    } else if (this.isStreamOutput(output)) {
      stream = output;
      streamOutputs = [stream];
    }
    let legacyOutput;
    if (file) {
      legacyOutput = {
        case: "file",
        value: file
      };
    } else if (stream) {
      legacyOutput = {
        case: "stream",
        value: stream
      };
    } else if (segments) {
      legacyOutput = {
        case: "segments",
        value: segments
      };
    }
    let egressOptions;
    if (opts) {
      if (typeof opts === "number") {
        egressOptions = {
          case: "preset",
          value: opts
        };
      } else {
        egressOptions = {
          case: "advanced",
          value: opts
        };
      }
    }
    return {
      output: legacyOutput,
      options: egressOptions,
      fileOutputs,
      streamOutputs,
      segmentOutputs,
      imageOutputs
    };
  }
  /**
   * @param roomName - room name
   * @param output - file or websocket output
   * @param trackId - track Id
   */
  async startTrackEgress(roomName, output, trackId, webhooks) {
    let legacyOutput;
    if (typeof output === "string") {
      legacyOutput = {
        case: "websocketUrl",
        value: output
      };
    } else {
      legacyOutput = {
        case: "file",
        value: output
      };
    }
    const req = new import_protocol.TrackEgressRequest({
      roomName,
      trackId,
      output: legacyOutput,
      webhooks
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "StartTrackEgress",
      req,
      await this.authHeader({ roomRecord: true })
    );
    return import_protocol.EgressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Starts an egress using the unified v2 request.
   *
   * @param request - the egress request
   */
  async startEgress(request) {
    const data = await this.rpc.request(
      svc,
      "StartEgress",
      request.toJson(),
      await this.authHeader({ roomRecord: true })
    );
    return import_protocol.EgressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * @param egressId -
   * @param layout -
   */
  async updateLayout(egressId, layout) {
    const data = await this.rpc.request(
      svc,
      "UpdateLayout",
      new import_protocol.UpdateLayoutRequest({ egressId, layout }).toJson(),
      await this.authHeader({ roomRecord: true })
    );
    return import_protocol.EgressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * @param egressId -
   * @param addOutputUrls -
   * @param removeOutputUrls -
   */
  async updateStream(egressId, addOutputUrls, removeOutputUrls) {
    addOutputUrls ??= [];
    removeOutputUrls ??= [];
    const data = await this.rpc.request(
      svc,
      "UpdateStream",
      new import_protocol.UpdateStreamRequest({ egressId, addOutputUrls, removeOutputUrls }).toJson(),
      await this.authHeader({ roomRecord: true })
    );
    return import_protocol.EgressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * @param roomName - list egress for one room only
   */
  async listEgress(options) {
    let req = {};
    if (typeof options === "string") {
      req.roomName = options;
    } else if (options !== void 0) {
      req = options;
    }
    const data = await this.rpc.request(
      svc,
      "ListEgress",
      new import_protocol.ListEgressRequest(req).toJson(),
      await this.authHeader({ roomRecord: true })
    );
    return import_protocol.ListEgressResponse.fromJson(data, { ignoreUnknownFields: true }).items ?? [];
  }
  /**
   * @param egressId -
   */
  async stopEgress(egressId) {
    const data = await this.rpc.request(
      svc,
      "StopEgress",
      new import_protocol.StopEgressRequest({ egressId }).toJson(),
      await this.authHeader({ roomRecord: true })
    );
    return import_protocol.EgressInfo.fromJson(data, { ignoreUnknownFields: true });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EgressClient
});
//# sourceMappingURL=EgressClient.cjs.map