async function digest(data) {
  var _a;
  if (!((_a = globalThis.crypto) == null ? void 0 : _a.subtle)) {
    throw new Error("Web Crypto API is required (globalThis.crypto.subtle)");
  }
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(data));
}
export {
  digest
};
//# sourceMappingURL=digest.js.map