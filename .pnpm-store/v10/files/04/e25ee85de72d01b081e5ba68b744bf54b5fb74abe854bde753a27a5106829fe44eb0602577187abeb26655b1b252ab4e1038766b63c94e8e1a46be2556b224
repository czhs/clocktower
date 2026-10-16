import { WebhookEvent as ProtoWebhookEvent } from "@livekit/protocol";
import { TokenVerifier } from "./AccessToken.js";
import { digest } from "./crypto/digest.js";
const authorizeHeader = "Authorize";
class WebhookEvent extends ProtoWebhookEvent {
  constructor() {
    super(...arguments);
    this.event = "";
  }
  static fromBinary(bytes, options) {
    return new WebhookEvent().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new WebhookEvent().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new WebhookEvent().fromJsonString(jsonString, options);
  }
}
class WebhookReceiver {
  constructor(apiKey, apiSecret) {
    this.verifier = new TokenVerifier(apiKey, apiSecret);
  }
  /**
   * @param body - string of the posted body
   * @param authHeader - `Authorization` header from the request
   * @param skipAuth - true to skip auth validation
   * @param clockTolerance - How much tolerance to allow for checks against the auth header to be skewed from the claims
   * @returns The processed webhook event
   */
  async receive(body, authHeader, skipAuth = false, clockTolerance) {
    if (!skipAuth) {
      if (!authHeader) {
        throw new Error("authorization header is empty");
      }
      const claims = await this.verifier.verify(authHeader, clockTolerance);
      const hash = await digest(body);
      const hashDecoded = btoa(
        Array.from(new Uint8Array(hash)).map((v) => String.fromCharCode(v)).join("")
      );
      if (claims.sha256 !== hashDecoded) {
        throw new Error("sha256 checksum of body does not match");
      }
    }
    return WebhookEvent.fromJson(JSON.parse(body), { ignoreUnknownFields: true });
  }
}
export {
  WebhookEvent,
  WebhookReceiver,
  authorizeHeader
};
//# sourceMappingURL=WebhookReceiver.js.map