import { TrackSource } from "@livekit/protocol";
function trackSourceToString(source) {
  switch (source) {
    case TrackSource.CAMERA:
      return "camera";
    case TrackSource.MICROPHONE:
      return "microphone";
    case TrackSource.SCREEN_SHARE:
      return "screen_share";
    case TrackSource.SCREEN_SHARE_AUDIO:
      return "screen_share_audio";
    default:
      throw new TypeError(`Cannot convert TrackSource ${source} to string`);
  }
}
function claimsToJwtPayload(grant) {
  var _a;
  const claim = { ...grant };
  if (Array.isArray((_a = claim.video) == null ? void 0 : _a.canPublishSources)) {
    claim.video.canPublishSources = claim.video.canPublishSources.map(trackSourceToString);
  }
  return claim;
}
export {
  claimsToJwtPayload,
  trackSourceToString
};
//# sourceMappingURL=grants.js.map