import { AccessToken } from "./AccessToken.js";
class ServiceBase {
  constructor(apiKeyOrOptions, secret, ttl) {
    const options = typeof apiKeyOrOptions === "object" ? apiKeyOrOptions : { apiKey: apiKeyOrOptions, secret, ttl };
    this.apiKey = options.apiKey;
    this.secret = options.secret;
    this.ttl = options.ttl || "10m";
    this.token = options.token;
  }
  async authHeader(grant, sip) {
    if (this.token) {
      return { Authorization: `Bearer ${this.token}` };
    }
    const at = new AccessToken(this.apiKey, this.secret, { ttl: this.ttl });
    if (grant) {
      at.addGrant(grant);
    }
    if (sip) {
      at.addSIPGrant(sip);
    }
    return {
      Authorization: `Bearer ${await at.toJwt()}`
    };
  }
}
export {
  ServiceBase
};
//# sourceMappingURL=ServiceBase.js.map