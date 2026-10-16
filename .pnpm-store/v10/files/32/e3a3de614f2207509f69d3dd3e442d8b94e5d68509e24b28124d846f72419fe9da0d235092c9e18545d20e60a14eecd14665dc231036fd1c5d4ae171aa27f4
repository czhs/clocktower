import {
  CreateRoomRequest,
  DeleteRoomRequest,
  ForwardParticipantRequest,
  ListParticipantsRequest,
  ListParticipantsResponse,
  ListRoomsRequest,
  ListRoomsResponse,
  MoveParticipantRequest,
  MuteRoomTrackRequest,
  MuteRoomTrackResponse,
  ParticipantInfo,
  ParticipantPermission,
  Room,
  RoomParticipantIdentity,
  SendDataRequest,
  UpdateParticipantRequest,
  UpdateRoomMetadataRequest,
  UpdateSubscriptionsRequest
} from "@livekit/protocol";
import { ServiceBase } from "./ServiceBase.js";
import { TwirpRpc, livekitPackage } from "./TwirpRPC.js";
import { getRandomBytes } from "./crypto/uuid.js";
const svc = "RoomService";
class RoomServiceClient extends ServiceBase {
  /**
   *
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
   * Creates a new room. Explicit room creation is not required, since rooms will
   * be automatically created when the first participant joins. This method can be
   * used to customize room settings.
   * @param options -
   */
  async createRoom(options) {
    const data = await this.rpc.request(
      svc,
      "CreateRoom",
      new CreateRoomRequest(options).toJson(),
      await this.authHeader({ roomCreate: true })
    );
    return Room.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * List active rooms
   * @param names - when undefined or empty, list all rooms.
   *                otherwise returns rooms with matching names
   * @returns
   */
  async listRooms(names) {
    const data = await this.rpc.request(
      svc,
      "ListRooms",
      new ListRoomsRequest({ names: names ?? [] }).toJson(),
      await this.authHeader({ roomList: true })
    );
    const res = ListRoomsResponse.fromJson(data, { ignoreUnknownFields: true });
    return res.rooms ?? [];
  }
  async deleteRoom(room) {
    await this.rpc.request(
      svc,
      "DeleteRoom",
      new DeleteRoomRequest({ room }).toJson(),
      await this.authHeader({ roomCreate: true })
    );
  }
  /**
   * Update metadata of a room
   * @param room - name of the room
   * @param metadata - the new metadata for the room
   */
  async updateRoomMetadata(room, metadata) {
    const data = await this.rpc.request(
      svc,
      "UpdateRoomMetadata",
      new UpdateRoomMetadataRequest({ room, metadata }).toJson(),
      await this.authHeader({ roomAdmin: true, room })
    );
    return Room.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * List participants in a room
   * @param room - name of the room
   */
  async listParticipants(room) {
    const data = await this.rpc.request(
      svc,
      "ListParticipants",
      new ListParticipantsRequest({ room }).toJson(),
      await this.authHeader({ roomAdmin: true, room })
    );
    const res = ListParticipantsResponse.fromJson(data, { ignoreUnknownFields: true });
    return res.participants ?? [];
  }
  /**
   * Get information on a specific participant, including the tracks that participant
   * has published
   * @param room - name of the room
   * @param identity - identity of the participant to return
   */
  async getParticipant(room, identity) {
    const data = await this.rpc.request(
      svc,
      "GetParticipant",
      new RoomParticipantIdentity({ room, identity }).toJson(),
      await this.authHeader({ roomAdmin: true, room })
    );
    return ParticipantInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Removes a participant in the room. This will disconnect the participant
   * and will emit a Disconnected event for that participant.
   * Even after being removed, the participant can still re-join the room.
   * @param room -
   * @param identity -
   * @param options - removal options
   */
  async removeParticipant(room, identity, options) {
    await this.rpc.request(
      svc,
      "RemoveParticipant",
      new RoomParticipantIdentity({
        room,
        identity,
        revokeTokenTs: options == null ? void 0 : options.revokeTokenTs
      }).toJson(),
      await this.authHeader({ roomAdmin: true, room })
    );
  }
  /**
   * Forwards a participant's track to another room. This will create a
   * participant to join the destination room that has same information
   * with the source participant except the kind to be `Forwarded`. All
   * changes to the source participant will be reflected to the forwarded
   * participant. When the source participant disconnects or the
   * `RemoveParticipant` method is called in the destination room, the
   * forwarding will be stopped.
   * @param room -
   * @param identity -
   * @param destinationRoom - the room to forward the participant to
   */
  async forwardParticipant(room, identity, destinationRoom) {
    await this.rpc.request(
      svc,
      "ForwardParticipant",
      new ForwardParticipantRequest({ room, identity, destinationRoom }).toJson(),
      await this.authHeader({ roomAdmin: true, room, destinationRoom })
    );
  }
  /**
   * Move a connected participant to a different room. Requires `roomAdmin` and `destinationRoom`.
   * The participant will be removed from the current room and added to the destination room.
   * From the other observers' perspective, the participant would've disconnected from the previous room and joined the new one.
   * @param room -
   * @param identity -
   * @param destinationRoom - the room to move the participant to
   */
  async moveParticipant(room, identity, destinationRoom) {
    await this.rpc.request(
      svc,
      "MoveParticipant",
      new MoveParticipantRequest({ room, identity, destinationRoom }).toJson(),
      await this.authHeader({ roomAdmin: true, room, destinationRoom })
    );
  }
  /**
   * Mutes a track that the participant has published.
   * @param room -
   * @param identity -
   * @param trackSid - sid of the track to be muted
   * @param muted - true to mute, false to unmute
   */
  async mutePublishedTrack(room, identity, trackSid, muted) {
    const req = new MuteRoomTrackRequest({
      room,
      identity,
      trackSid,
      muted
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "MutePublishedTrack",
      req,
      await this.authHeader({ roomAdmin: true, room })
    );
    const res = MuteRoomTrackResponse.fromJson(data, { ignoreUnknownFields: true });
    return res.track;
  }
  async updateParticipant(room, identity, metadataOrOptions, maybePermission, maybeName) {
    const hasOptions = typeof metadataOrOptions === "object";
    const metadata = hasOptions ? metadataOrOptions == null ? void 0 : metadataOrOptions.metadata : metadataOrOptions;
    const permission = hasOptions ? metadataOrOptions.permission : maybePermission;
    const name = hasOptions ? metadataOrOptions.name : maybeName;
    const attributes = hasOptions ? metadataOrOptions.attributes : {};
    const req = new UpdateParticipantRequest({
      room,
      identity,
      attributes,
      metadata,
      name
    });
    if (permission) {
      req.permission = new ParticipantPermission(permission);
    }
    const data = await this.rpc.request(
      svc,
      "UpdateParticipant",
      req.toJson(),
      await this.authHeader({ roomAdmin: true, room })
    );
    return ParticipantInfo.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Updates a participant's subscription to tracks
   * @param room -
   * @param identity -
   * @param trackSids -
   * @param subscribe - true to subscribe, false to unsubscribe
   */
  async updateSubscriptions(room, identity, trackSids, subscribe) {
    const req = new UpdateSubscriptionsRequest({
      room,
      identity,
      trackSids,
      subscribe,
      participantTracks: []
    }).toJson();
    await this.rpc.request(
      svc,
      "UpdateSubscriptions",
      req,
      await this.authHeader({ roomAdmin: true, room })
    );
  }
  async sendData(room, data, kind, options = {}) {
    const destinationSids = Array.isArray(options) ? options : options.destinationSids;
    const topic = Array.isArray(options) ? void 0 : options.topic;
    const req = new SendDataRequest({
      room,
      data,
      kind,
      destinationSids: destinationSids ?? [],
      topic
    });
    if (!Array.isArray(options) && options.destinationIdentities) {
      req.destinationIdentities = options.destinationIdentities;
    }
    req.nonce = await getRandomBytes(16);
    await this.rpc.request(
      svc,
      "SendData",
      req.toJson(),
      await this.authHeader({ roomAdmin: true, room })
    );
  }
}
export {
  RoomServiceClient
};
//# sourceMappingURL=RoomServiceClient.js.map