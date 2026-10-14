// In-process server bootstrap used by the integration tests. Delegates to the lead's app.ts so
// tests run the exact production HTTP/WS stack (minus static SPA serving).
export { startAppServer, type RunningServer, type AppServerOptions } from '../app.js';
