// `?url` asset imports (src/runtime.ts) for this package's own typecheck; the client gets the same
// declaration from vite/client.
declare module '*?url' {
  const url: string;
  export default url;
}
