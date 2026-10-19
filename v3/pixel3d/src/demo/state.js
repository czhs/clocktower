// The ONE shared demo state (owner: demo lead; docs/DEMO.md §3). Import `store` from here, never make another one.
//   import { store } from './state.js';
//   store.state.timeOfDay; store.set({ phase: 'vote', nominee: 6 }, 'ui'); store.on('phase', ({ value }) => ...);
// The store implementation, defaults and validation live in api.js (createStore, DEFAULT_STATE).
import { createStore, DEFAULT_STATE } from './api.js';

export const store = createStore(DEFAULT_STATE);
export default store;
