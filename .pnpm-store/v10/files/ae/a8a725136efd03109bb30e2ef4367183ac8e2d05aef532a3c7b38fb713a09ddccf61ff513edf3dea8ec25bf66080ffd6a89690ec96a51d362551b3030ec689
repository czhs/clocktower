const DEFAULT_RINGING_TIMEOUT_SECONDS = 30;
const RINGING_TIMEOUT_MARGIN_SECONDS = 2;
function dialRequestTimeout(timeout, ringingTimeout) {
  const ring = ringingTimeout ?? DEFAULT_RINGING_TIMEOUT_SECONDS;
  const floor = ring + RINGING_TIMEOUT_MARGIN_SECONDS;
  return Math.max(timeout ?? floor, floor);
}
export {
  DEFAULT_RINGING_TIMEOUT_SECONDS,
  RINGING_TIMEOUT_MARGIN_SECONDS,
  dialRequestTimeout
};
//# sourceMappingURL=dialTimeout.js.map