import { AgentDispatchClient } from "./AgentDispatchClient.js";
import { ConnectorClient } from "./ConnectorClient.js";
import { EgressClient } from "./EgressClient.js";
import { IngressClient } from "./IngressClient.js";
import { RoomServiceClient } from "./RoomServiceClient.js";
import { SipClient } from "./SipClient.js";
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
    this._room = new RoomServiceClient(host, apiKey, secret, clientOptions);
    this._egress = new EgressClient(host, apiKey, secret, clientOptions);
    this._ingress = new IngressClient(host, apiKey, secret, clientOptions);
    this._sip = new SipClient(host, apiKey, secret, clientOptions);
    this._agentDispatch = new AgentDispatchClient(host, apiKey, secret, clientOptions);
    this._connector = new ConnectorClient(host, apiKey, secret, clientOptions);
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
export {
  LiveKitAPI
};
//# sourceMappingURL=LiveKitAPI.js.map