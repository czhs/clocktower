async function getRandomBytes(size = 16) {
  var _a;
  if (!((_a = globalThis.crypto) == null ? void 0 : _a.getRandomValues)) {
    throw new Error("Web Crypto API is required (globalThis.crypto.getRandomValues)");
  }
  return crypto.getRandomValues(new Uint8Array(size));
}
async function randomUUID() {
  var _a;
  if (typeof ((_a = globalThis.crypto) == null ? void 0 : _a.randomUUID) === "function") {
    return crypto.randomUUID();
  }
  const bytes = await getRandomBytes(16);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}
export {
  getRandomBytes,
  randomUUID
};
//# sourceMappingURL=uuid.js.map