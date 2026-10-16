import {
  AgentDispatch,
  CreateAgentDispatchRequest,
  DeleteAgentDispatchRequest,
  ListAgentDispatchRequest,
  ListAgentDispatchResponse
} from "@livekit/protocol";
import { ServiceBase } from "./ServiceBase.js";
import { TwirpRpc, livekitPackage } from "./TwirpRPC.js";
const svc = "AgentDispatchService";
class AgentDispatchClient extends ServiceBase {
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
   * Create an explicit dispatch for an agent to join a room. To use explicit
   * dispatch, your agent must be registered with an `agentName`.
   * @param roomName - name of the room to dispatch to
   * @param agentName - name of the agent to dispatch
   * @param options - optional metadata to send along with the dispatch
   * @returns the dispatch that was created
   */
  async createDispatch(roomName, agentName, options) {
    const req = new CreateAgentDispatchRequest({
      room: roomName,
      agentName,
      metadata: options == null ? void 0 : options.metadata,
      restartPolicy: options == null ? void 0 : options.restartPolicy,
      deployment: options == null ? void 0 : options.deployment
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "CreateDispatch",
      req,
      await this.authHeader({ roomAdmin: true, room: roomName })
    );
    return AgentDispatch.fromJson(data, { ignoreUnknownFields: true });
  }
  /**
   * Delete an explicit dispatch for an agent in a room.
   * @param dispatchId - id of the dispatch to delete
   * @param roomName - name of the room the dispatch is for
   */
  async deleteDispatch(dispatchId, roomName) {
    const req = new DeleteAgentDispatchRequest({
      dispatchId,
      room: roomName
    }).toJson();
    await this.rpc.request(
      svc,
      "DeleteDispatch",
      req,
      await this.authHeader({ roomAdmin: true, room: roomName })
    );
  }
  /**
   * Get an Agent dispatch by ID
   * @param dispatchId - id of the dispatch to get
   * @param roomName - name of the room the dispatch is for
   * @returns the dispatch that was found, or undefined if not found
   */
  async getDispatch(dispatchId, roomName) {
    const req = new ListAgentDispatchRequest({
      dispatchId,
      room: roomName
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "ListDispatch",
      req,
      await this.authHeader({ roomAdmin: true, room: roomName })
    );
    const res = ListAgentDispatchResponse.fromJson(data, { ignoreUnknownFields: true });
    if (res.agentDispatches.length === 0) {
      return void 0;
    }
    return res.agentDispatches[0];
  }
  /**
   * List all agent dispatches for a room
   * @param roomName - name of the room to list dispatches for
   * @returns the list of dispatches
   */
  async listDispatch(roomName) {
    const req = new ListAgentDispatchRequest({
      room: roomName
    }).toJson();
    const data = await this.rpc.request(
      svc,
      "ListDispatch",
      req,
      await this.authHeader({ roomAdmin: true, room: roomName })
    );
    const res = ListAgentDispatchResponse.fromJson(data, { ignoreUnknownFields: true });
    return res.agentDispatches;
  }
}
export {
  AgentDispatchClient
};
//# sourceMappingURL=AgentDispatchClient.js.map