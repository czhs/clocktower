//#region src/emitter.ts
/**
* Minimal typed event emitter used internally by Fsm and BehavioralFsm.
*
* Two listener categories exist at runtime: named listeners (keyed by event
* name) and wildcard listeners (keyed as `"*"`). The wildcard fires on EVERY
* emit, regardless of event name, and its callback receives both the event
* name and the data. Named listeners receive only the data.
*
* @typeParam TEventMap - Record mapping event names to their payload types.
*   Constrains `on()` and `emit()` to matching event/payload pairs.
*/
var Emitter = class {
	listeners = /* @__PURE__ */ new Map();
	on(event, cb) {
		let set = this.listeners.get(event);
		if (!set) {
			set = /* @__PURE__ */ new Set();
			this.listeners.set(event, set);
		}
		set.add(cb);
		return { off: () => {
			set.delete(cb);
		} };
	}
	/**
	* Emit a named event, notifying wildcard listeners first, then named listeners.
	*
	* Wildcard listeners receive `(eventName, data)`; named listeners receive
	* only `data`. The firing order (wildcards before named) is intentional —
	* it lets relay listeners (like Fsm's bfsm proxy) observe all events
	* before specific subscribers react.
	*/
	emit(event, data) {
		const wildcards = this.listeners.get("*");
		if (wildcards) for (const cb of wildcards) cb(event, data);
		const named = this.listeners.get(event);
		if (named) for (const cb of named) cb(data);
	}
	/**
	* Remove all listeners (named and wildcard).
	*
	* Existing `Subscription` objects remain valid — their `off()` closures
	* hold a reference to the now-empty Set, so calling them is harmless.
	* Called by `dispose()` to prevent memory retention after an FSM shuts down.
	*/
	clear() {
		this.listeners.clear();
	}
};

//#endregion
//#region src/json-safe.ts
/**
* Thrown internally when the walk hits a value that can't survive a
* serialization boundary. Callers catch this to attach FSM/input context
* before re-throwing a fully descriptive error — see `path`/`label` below.
*/
var NonSerializableValueError = class extends Error {
	constructor(path, label) {
		super(`non-serializable value at ${path} (${label})`);
		this.path = path;
		this.label = label;
	}
};
/**
* Deep-clones `value`, throwing `NonSerializableValueError` the moment it
* finds anything that isn't `null`, a boolean, a finite number, a string, a
* plain array, or a plain object. `rootPath` seeds the path used in error
* messages — e.g. `"args"` so a nested failure reads as `args[1].onComplete`.
*
* Cloning (rather than just validating) is what keeps a returned snapshot
* from aliasing live FSM state: mutating the snapshot afterward — or the
* original value passed into a deferred `handle()` call — can't reach back
* into the FSM's internal deferred queue.
*/
const cloneJsonSafe = (value, rootPath) => {
	return cloneNode(value, rootPath, /* @__PURE__ */ new Set());
};
const cloneNode = (value, path, ancestors) => {
	if (value === null) return null;
	switch (typeof value) {
		case "string":
		case "boolean": return value;
		case "number":
			if (!Number.isFinite(value)) throw new NonSerializableValueError(path, describeNonFiniteNumber(value));
			return value;
		case "object": return cloneObject(value, path, ancestors);
		default: throw new NonSerializableValueError(path, typeof value);
	}
};
const cloneObject = (obj, path, ancestors) => {
	if (ancestors.has(obj)) throw new NonSerializableValueError(path, "circular reference");
	if (Array.isArray(obj)) {
		if (obj.length !== Object.keys(obj).length) throw new NonSerializableValueError(path, "sparse array or array with non-index properties");
		ancestors.add(obj);
		const cloned = obj.map((item, i) => cloneNode(item, `${path}[${i}]`, ancestors));
		ancestors.delete(obj);
		return cloned;
	}
	const proto = Object.getPrototypeOf(obj);
	if (proto !== Object.prototype && proto !== null) throw new NonSerializableValueError(path, obj.constructor?.name ?? "object");
	ancestors.add(obj);
	const cloned = {};
	for (const key of Object.keys(obj)) {
		const value = cloneNode(obj[key], `${path}.${key}`, ancestors);
		Object.defineProperty(cloned, key, {
			value,
			enumerable: true,
			writable: true,
			configurable: true
		});
	}
	ancestors.delete(obj);
	return cloned;
};
const describeNonFiniteNumber = (n) => {
	if (Number.isNaN(n)) return "NaN";
	return n > 0 ? "Infinity" : "-Infinity";
};
/**
* Deep-clones `value` WITHOUT validating it — unlike `cloneJsonSafe`, this
* never throws. Plain objects/arrays are cloned recursively (so a caller
* can't alias state back into whatever holds the result); anything else
* (functions, `Date`/`Map`/class instances, symbols, non-finite numbers,
* etc.) is passed through by reference as-is.
*
* This is `rehydrate()`'s side of the aliasing guarantee: `dehydrate()`
* validates-and-clones on the way OUT (via `cloneJsonSafe`), but `rehydrate()`
* trusts the snapshot it's given is already valid data — re-validating on
* the way IN would be a redundant, unwanted asymmetry (see the build plan's
* disclosed known gaps). We still need the clone so mutating the caller's
* snapshot object after `rehydrate()` returns can't reach into the live
* FSM's internal deferred queue.
*
* Cycle-safe: a value that contains itself is returned as-is (by reference)
* rather than cloned infinitely — there's no validation step here to make
* that throw, so silently keeping the shared reference is the only option
* that doesn't hang.
*/
const cloneDeep = (value, ancestors = /* @__PURE__ */ new Set()) => {
	if (value === null || typeof value !== "object") return value;
	if (ancestors.has(value)) return value;
	if (Array.isArray(value)) {
		ancestors.add(value);
		const cloned = value.map((item) => cloneDeep(item, ancestors));
		ancestors.delete(value);
		return cloned;
	}
	const proto = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null) return value;
	ancestors.add(value);
	const cloned = {};
	for (const key of Object.keys(value)) {
		const clonedValue = cloneDeep(value[key], ancestors);
		Object.defineProperty(cloned, key, {
			value: clonedValue,
			enumerable: true,
			writable: true,
			configurable: true
		});
	}
	ancestors.delete(value);
	return cloned;
};

//#endregion
//#region src/types.ts
/**
* Symbol used as a property key to identify machina FSM instances at runtime.
* Each class stamps itself with a MachinaType value so the ChildLink adapter
* can dispatch handle()/canHandle()/reset() correctly without circular imports.
*/
const MACHINA_TYPE = Symbol("machina.type");

//#endregion
//#region src/behavioral-fsm.ts
const MAX_TRANSITION_DEPTH = 20;
/**
* Defines FSM behavior (states + transitions) while tracking per-client state
* in a `WeakMap`. A single `BehavioralFsm` instance can drive any number of
* independent client objects simultaneously — each gets its own state,
* deferred queue, and lifecycle.
*
* Prefer `createBehavioralFsm()` over constructing this directly — the factory
* infers all generic parameters from the config object.
*
* All public methods silently no-op after `dispose()` is called.
*
* @typeParam TClient - The client object type. Must be an object (non-primitive)
*   so it can serve as a WeakMap key.
* @typeParam TStateNames - String literal union of valid state names.
* @typeParam TInputNames - String literal union of valid input names.
* @typeParam TBubbles - String literal union of inputs this FSM declares via
*   `bubbles`. Type-only — carried so `BubblesOfInstance` can extract it from
*   a constructed instance; nothing at runtime reads this generic.
*/
var BehavioralFsm = class {
	id;
	initialState;
	[MACHINA_TYPE] = "BehavioralFsm";
	states;
	emitter = new Emitter();
	clients = /* @__PURE__ */ new WeakMap();
	knownClients = /* @__PURE__ */ new Set();
	childSubscriptions = [];
	disposed = false;
	transitionDepth = 0;
	constructor(config) {
		this.id = config.id;
		this.initialState = config.initialState;
		this.states = config.states;
		this.wrapChildLinks();
		this.setupChildSubscriptions();
	}
	/**
	* Dispatch an input to the given client's current state handler.
	*
	* Delegation order: if the current state has a `_child` FSM that can
	* handle the input, it is dispatched there. If the child emits `nohandler`,
	* the input bubbles up to this FSM's local handler. If no handler exists
	* here either, `nohandler` is emitted on this FSM's emitter.
	*
	* No-ops silently when disposed.
	*/
	handle(client, inputName, ...args) {
		if (this.disposed) return;
		const meta = this.getOrCreateClientMeta(client);
		meta.currentActionArgs = args;
		const childLink = this.states[meta.state]?._child;
		if (childLink) {
			if (childLink.canHandle(client, inputName)) {
				try {
					childLink.handle(client, inputName, ...args);
				} finally {
					meta.currentActionArgs = void 0;
				}
				return;
			}
		}
		this.handleLocally(client, inputName, args, meta);
	}
	/**
	* Returns true if the client's current state has a handler for `inputName`
	* (or a catch-all `"*"` handler), or if the current state's `_child` chain
	* can handle it — the check recurses to the same depth `handle()`'s
	* delegation can actually reach, so a grandchild-only input answers true
	* from the root. Does NOT initialize the client — no `_onEnter`, no
	* events, no side effects. Unseen clients are treated as if they were
	* already in `initialState`. Returns false when disposed.
	*/
	canHandle(client, inputName) {
		if (this.disposed) return false;
		const state = this.clients.get(client)?.state ?? this.initialState;
		const stateObj = this.states[state];
		if (stateObj?.[inputName] ?? stateObj?.["*"]) return true;
		const childLink = stateObj?._child;
		return childLink ? childLink.canHandle(client, inputName) : false;
	}
	/**
	* Transition the client back to `initialState`, firing `_onEnter` and
	* lifecycle events as if entering it fresh. No-ops when disposed.
	*/
	reset(client) {
		if (this.disposed) return;
		this.transition(client, this.initialState);
	}
	/**
	* Returns the client's current state, or `undefined` if the client has
	* never been initialized (i.e. `handle()`, `transition()`, or `reset()`
	* have never been called for it). Does NOT trigger initialization.
	*/
	currentState(client) {
		return this.clients.get(client)?.state;
	}
	/**
	* Directly transition `client` to `toState`, running the full lifecycle:
	* `_onExit` for the current state → `transitioning` event → update state →
	* `_onEnter` for new state → `transitioned` event → child reset → deferred
	* queue replay → bounce (if `_onEnter` returned a state name).
	*
	* Same-state transitions are silently ignored. Transitions to unknown state
	* names emit `invalidstate` instead of throwing. Throws if the transition
	* depth exceeds `MAX_TRANSITION_DEPTH` (likely an `_onEnter` → transition loop).
	*
	* No-ops when disposed.
	*/
	transition(client, toState) {
		if (this.disposed) return;
		const meta = this.getOrCreateClientMeta(client);
		const fromState = meta.state;
		if (toState === fromState) return;
		if (!Object.hasOwn(this.states, toState)) {
			this.emitter.emit("invalidstate", {
				stateName: toState,
				client
			});
			return;
		}
		this.transitionDepth++;
		if (this.transitionDepth > MAX_TRANSITION_DEPTH) {
			this.transitionDepth = 0;
			throw new Error(`Max transition depth (${MAX_TRANSITION_DEPTH}) exceeded in FSM "${this.id}". Likely an infinite _onEnter → transition loop.`);
		}
		try {
			const curStateObj = this.states[fromState];
			const newStateObj = this.states[toState];
			if (curStateObj?._onExit && typeof curStateObj._onExit === "function") {
				const exitArgs = this.buildHandlerArgs(client, "", meta);
				curStateObj._onExit(exitArgs);
			}
			meta.state = toState;
			const payload = {
				fromState,
				toState,
				client
			};
			this.emitter.emit("transitioning", payload);
			let bounceTarget = void 0;
			if (newStateObj?._onEnter && typeof newStateObj._onEnter === "function") {
				const enterArgs = this.buildHandlerArgs(client, "", meta);
				bounceTarget = newStateObj._onEnter(enterArgs);
			}
			this.emitter.emit("transitioned", payload);
			const childLink = newStateObj?._child;
			if (childLink) childLink.reset(client);
			this.processQueue(client, meta);
			if (typeof bounceTarget === "string" && meta.state === toState) this.transition(client, bounceTarget);
		} finally {
			this.transitionDepth--;
		}
	}
	/**
	* Returns the client's state as a dot-delimited path including any active
	* child FSM states (e.g. `"active.connecting.retrying"`). Returns just the
	* current state name when no child is active. Returns `""` for clients that
	* have never been initialized (unlike `currentState()` which returns `undefined`).
	*/
	compositeState(client) {
		const meta = this.clients.get(client);
		if (!meta) return "";
		const childLink = this.states[meta.state]?._child;
		if (childLink) {
			const childComposite = childLink.compositeState(client);
			if (childComposite) return `${meta.state}.${childComposite}`;
		}
		return meta.state;
	}
	rehydrate(client, input) {
		if (this.disposed) return;
		if (typeof input === "string") {
			this.rehydrateCompositePath(client, input);
			return;
		}
		const writes = this.planSnapshotWrites(client, input);
		for (const write of writes) write();
	}
	/**
	* Snapshot everything machina tracks for `client`: current state, pending
	* deferred inputs, and — recursively — the same for every `_child` that has
	* ever seen this client, active or not. Feed the result to the object form
	* of `rehydrate()` to restore it later, deferrals included.
	*
	* Returns `undefined` for a client this FSM has never seen (mirrors
	* `currentState()`) — the call does NOT trigger initialization.
	*
	* Throws if any deferred input's args contain a non-serializable value
	* (function, undefined, symbol, bigint, non-finite number, Date/Map/class
	* instance, or a circular reference) — naming the input, its `until` target
	* if any, the FSM id, and the exact value path. Throws for an Fsm child
	* that's on `client`'s active path *relative to the true root* (consistent
	* with `rehydrate()`'s conditional throw) — an Fsm owns its own context, so
	* there's nothing per-client to snapshot. An Fsm child declared at a state
	* `client` never visited, OR nested under a `BehavioralFsm` child that is
	* itself off-path from the root, is skipped rather than throwing — neither
	* has any per-client state to lose, so one Fsm child anywhere in the
	* hierarchy doesn't disable `dehydrate()` for clients that never reach that
	* branch, no matter how deeply nested the Fsm child is.
	*
	* Meant for clients at rest between `handle()` calls — `currentActionArgs`
	* (the in-flight args mid-handler) has no meaning here and is excluded.
	*
	* @param isOnActivePath - @internal Whether this FSM itself is currently
	* reachable from the true root's active path. Defaults to `true` for the
	* public entry point (this FSM IS the root from its own perspective); the
	* `ChildLink` adapter passes `false` down when recursing into a nested
	* `BehavioralFsm` child that is itself off-path, so that child's own
	* Fsm-child checks don't recompute reachability from its dormant local
	* state alone.
	*/
	dehydrate(client, isOnActivePath = true) {
		const meta = this.clients.get(client);
		if (!meta) return;
		const snapshot = {
			state: meta.state,
			deferred: meta.deferredQueue.map((item) => this.snapshotDeferredInput(item))
		};
		const children = this.collectChildSnapshots(client, meta.state, isOnActivePath);
		if (children) snapshot.children = children;
		return snapshot;
	}
	/**
	* @internal
	* Validates `snapshot` against this level's state graph and recurses into
	* every declared child, returning write thunks to run only once the WHOLE
	* tree — every level — validates successfully. Nothing is written here.
	* Called by the object-form of `rehydrate()` and, recursively, by ChildLink
	* so a nested BehavioralFsm participates in the same validate-then-write
	* pass. Not part of the public persistence API — call `rehydrate()` instead.
	*/
	planSnapshotWrites(client, snapshot) {
		if (this.disposed) return [];
		const { state, deferred, children } = snapshot;
		if (!Object.hasOwn(this.states, state)) throw new Error(`rehydrate: unknown state "${state}" in FSM "${this.id}". Valid states: ${Object.keys(this.states).join(", ")}`);
		const writes = [];
		if (children) for (const stateName of Object.keys(children)) {
			if (!Object.hasOwn(this.states, stateName)) throw new Error(`rehydrate: unknown state "${stateName}" in FSM "${this.id}" referenced by snapshot.children.`);
			const childLink = this.states[stateName]?._child;
			if (!childLink) throw new Error(`rehydrate: state "${stateName}" in FSM "${this.id}" has no _child, but the snapshot has a children["${stateName}"] entry.`);
			writes.push(...childLink.planRehydrate(client, children[stateName]));
		}
		const deferredQueue = deferred.map((item) => ({
			inputName: item.inputName,
			args: cloneDeep(item.args),
			...item.untilState !== void 0 ? { untilState: item.untilState } : {}
		}));
		writes.push(() => {
			if (!this.clients.has(client)) this.knownClients.add(new WeakRef(client));
			this.clients.set(client, {
				state,
				deferredQueue
			});
		});
		return writes;
	}
	rehydrateCompositePath(client, compositeState) {
		const [state, ...rest] = compositeState.split(".");
		if (!Object.hasOwn(this.states, state)) throw new Error(`rehydrate: unknown state "${state}" in FSM "${this.id}". Valid states: ${Object.keys(this.states).join(", ")}`);
		if (rest.length > 0) {
			const childPath = rest.join(".");
			const childLink = this.states[state]?._child;
			if (!childLink) throw new Error(`rehydrate: state "${state}" in FSM "${this.id}" has no _child, but composite path "${compositeState}" requires one.`);
			childLink.rehydrate(client, childPath);
		}
		if (!this.clients.has(client)) this.knownClients.add(new WeakRef(client));
		this.clients.set(client, {
			state,
			deferredQueue: []
		});
	}
	/**
	* Walks every declared state's `_child`, dehydrating each one that has ever
	* seen `client`. The same child instance can be declared under multiple
	* state names (shared child) — it's dehydrated once and the result is
	* reused under every declaring state name, matching how the engine already
	* treats shared children elsewhere (dispose, event subscriptions).
	*
	* Declaring names are grouped by `childLink.instance` (the actual FSM
	* instance, not the `ChildLink` wrapper — `wrapChildLinks()` mints a fresh
	* wrapper per declaring state, so grouping by wrapper would never hit for a
	* shared child) BEFORE any `onPath` is computed or any child is dehydrated.
	* A shared child's `onPath` is the OR of `stateName === activeState` across
	* every declaring name in its group: at most one declaring name can ever
	* equal `activeState`, so this combined flag is correct and, critically,
	* independent of `Object.keys(this.states)` iteration order — computing
	* `onPath` per-declaring-name and caching whichever one happened to run
	* first would silently launder an on-path client's Fsm-child throw through
	* an unrelated off-path declaring name.
	*
	* An off-path Fsm child (declared only at states other than `activeState`,
	* OR nested anywhere under a `BehavioralFsm` child that is itself off-path
	* relative to the true root) is skipped entirely rather than dehydrated:
	* Fsm state isn't tracked per-client to begin with, so an off-path Fsm
	* child has nothing to lose by being skipped — unlike a BehavioralFsm
	* child's off-path meta, which is real per-client data. `isOnActivePath`
	* is the inherited "am I even reachable from the root" flag; combining it
	* with the group's `stateNames.includes(activeState)` check (rather than
	* using that check alone) is what keeps a nested Fsm grandchild from
	* throwing when its immediate BehavioralFsm parent is itself off-path —
	* the parent's own dormant `activeState` is irrelevant once the parent
	* isn't reachable. This keeps one Fsm child anywhere in the hierarchy from
	* disabling `dehydrate()` for every client, only for clients actually on
	* that branch.
	*/
	collectChildSnapshots(client, activeState, isOnActivePath) {
		const declaringNamesByInstance = /* @__PURE__ */ new Map();
		for (const stateName of Object.keys(this.states)) {
			const childLink = this.states[stateName]?._child;
			if (!childLink) continue;
			const entry = declaringNamesByInstance.get(childLink.instance);
			if (entry) entry.stateNames.push(stateName);
			else declaringNamesByInstance.set(childLink.instance, {
				childLink,
				stateNames: [stateName]
			});
		}
		let children;
		for (const { childLink, stateNames } of declaringNamesByInstance.values()) {
			const onPath = isOnActivePath && stateNames.includes(activeState);
			if (childLink.instance[MACHINA_TYPE] === "Fsm" && !onPath) continue;
			const childSnapshot = childLink.dehydrate(client, onPath);
			if (childSnapshot) {
				children ??= {};
				for (const stateName of stateNames) children[stateName] = childSnapshot;
			}
		}
		return children;
	}
	snapshotDeferredInput(item) {
		let clonedArgs;
		try {
			clonedArgs = cloneJsonSafe(item.args, "args");
		} catch (err) {
			if (!(err instanceof NonSerializableValueError)) throw err;
			const untilPart = item.untilState ? ` (until "${item.untilState}")` : "";
			throw new Error(`dehydrate: deferred input "${item.inputName}"${untilPart} in FSM "${this.id}" has a non-serializable value at ${err.path} (${err.label})`);
		}
		const snapshot = {
			inputName: item.inputName,
			args: clonedArgs
		};
		if (item.untilState !== void 0) snapshot.untilState = item.untilState;
		return snapshot;
	}
	on(eventName, callback) {
		if (this.disposed) return { off() {} };
		return this.emitter.on(eventName, callback);
	}
	/**
	* Emit a custom event through the FSM. Built-in lifecycle events are
	* emitted automatically — this is for user-defined events from handlers.
	* No-ops when disposed.
	*/
	emit(eventName, data) {
		if (this.disposed) return;
		this.emitter.emit(eventName, data);
	}
	/**
	* Permanently shut down this FSM. Irreversible — all subsequent method
	* calls become silent no-ops. Tears down child subscriptions, clears all
	* listeners, and cascades disposal to child FSMs (unless `preserveChildren`
	* is set). The same child appearing in multiple states is disposed once.
	*/
	dispose(options) {
		this.disposed = true;
		for (const sub of this.childSubscriptions) sub.off();
		if (!options?.preserveChildren) {
			const seen = /* @__PURE__ */ new Set();
			for (const stateName of Object.keys(this.states)) {
				const childLink = this.states[stateName]?._child;
				if (childLink && !seen.has(childLink.instance)) {
					seen.add(childLink.instance);
					childLink.dispose();
				}
			}
		}
		this.emitter.clear();
	}
	/**
	* Walks all states at construction time, detects raw FSM instances assigned
	* to _child, and wraps them into ChildLink adapters via createChildLink().
	* Must run BEFORE setupChildSubscriptions() so the subscriptions see
	* ChildLink objects, not raw FSM instances.
	*/
	wrapChildLinks() {
		for (const stateName of Object.keys(this.states)) {
			const stateObj = this.states[stateName];
			const rawChild = stateObj?._child;
			if (!rawChild) continue;
			if (typeof rawChild !== "object") throw new Error(`State "${stateName}"._child: expected an Fsm or BehavioralFsm instance, got ${String(rawChild)}`);
			if (!(MACHINA_TYPE in rawChild)) throw new Error(`State "${stateName}"._child: expected an Fsm or BehavioralFsm instance, got a plain object`);
			stateObj._child = createChildLink(rawChild);
		}
	}
	/**
	* Walks all states at construction time, finds states with _child, and
	* subscribes once to each unique child's wildcard events. Subscriptions are
	* stored for cleanup in dispose(). We deduplicate by `childLink.instance`
	* (the underlying Fsm/BehavioralFsm instance), not the `ChildLink` wrapper —
	* `wrapChildLinks()` mints a fresh wrapper per declaring state, so a child
	* shared across states would otherwise get one subscription PER declaring
	* state, each independently walking known clients and relaying events. That
	* silently double-fires client-less relays (Fsm-child events, or a
	* BehavioralFsm child's custom `emit()` with no `client` in the payload)
	* whenever two different clients are active on two different declaring
	* names at once — the same wrapper-vs-instance identity bug
	* `collectChildSnapshots()` had before its #184 fix.
	*/
	setupChildSubscriptions() {
		const seenInstances = /* @__PURE__ */ new Set();
		for (const stateName of Object.keys(this.states)) {
			const childLink = this.states[stateName]?._child;
			if (!childLink || seenInstances.has(childLink.instance)) continue;
			seenInstances.add(childLink.instance);
			const sub = childLink.onAny((eventName, data) => {
				if (eventName === "nohandler") {
					const payload = data;
					if (payload.client !== void 0) this.bubbleNohandler(payload.client, childLink, payload.inputName, payload.args ?? []);
					else for (const ref of this.knownClients) {
						const client = ref.deref();
						if (client === void 0) {
							this.knownClients.delete(ref);
							continue;
						}
						this.bubbleNohandler(client, childLink, payload.inputName, payload.args ?? []);
					}
					return;
				}
				const payload = data;
				if (payload && typeof payload === "object" && "client" in payload) {
					if (this.isChildActiveForClient(payload.client, childLink)) this.emitter.emit(eventName, data);
				} else for (const ref of this.knownClients) {
					const client = ref.deref();
					if (!client) {
						this.knownClients.delete(ref);
						continue;
					}
					if (this.isChildActiveForClient(client, childLink)) {
						this.emitter.emit(eventName, data);
						break;
					}
				}
			});
			this.childSubscriptions.push(sub);
		}
	}
	/**
	* Bubbles a child nohandler to the parent for the given client.
	* Only fires if the client is currently in a state that has this childLink.
	* Extracted from the lambda in setupChildSubscriptions to keep it readable.
	*/
	bubbleNohandler(client, childLink, inputName, args) {
		if (!this.isChildActiveForClient(client, childLink)) return;
		const meta = this.clients.get(client);
		meta.currentActionArgs = args;
		this.handleLocally(client, inputName, args, meta);
	}
	/**
	* Returns true if the given client is currently in a parent state whose
	* _child resolves to the same underlying instance as childLink. Returns
	* false if the client has no meta (never initialized) or is in a state
	* with a different (or no) child.
	*
	* Compares `.instance`, not the `ChildLink` wrapper itself — setupChildSubscriptions()
	* dedupes subscriptions by instance and keeps only ONE representative wrapper
	* per shared child, so the client's actual active declaring state may hold a
	* DIFFERENT wrapper for that same instance (wrapChildLinks() mints one per
	* declaring state). Comparing wrappers directly would only ever match the one
	* declaring state whose wrapper happened to be kept for the subscription,
	* silently breaking relay for every other declaring name of a shared child.
	*/
	isChildActiveForClient(client, childLink) {
		const meta = this.clients.get(client);
		if (!meta) return false;
		return (this.states[meta.state]?._child)?.instance === childLink.instance;
	}
	/**
	* The inner handler dispatch — no delegation, no initialization side effects
	* beyond what getOrCreateClientMeta already did. Called by handle() after
	* the delegation check, and by the nohandler child listener for bubbling.
	*/
	handleLocally(client, inputName, args, meta) {
		const stateObj = this.states[meta.state];
		const handler = stateObj?.[inputName] ?? stateObj?.["*"];
		if (!handler) {
			this.emitter.emit("nohandler", {
				inputName,
				args,
				client
			});
			meta.currentActionArgs = void 0;
			return;
		}
		try {
			this.emitter.emit("handling", {
				inputName,
				client
			});
			const handlerArgs = this.buildHandlerArgs(client, inputName, meta);
			let targetState = void 0;
			if (typeof handler === "string") targetState = handler;
			else if (typeof handler === "function") targetState = handler(handlerArgs, ...args);
			this.emitter.emit("handled", {
				inputName,
				client
			});
			if (typeof targetState === "string") this.transition(client, targetState);
		} finally {
			meta.currentActionArgs = void 0;
		}
	}
	getOrCreateClientMeta(client) {
		let meta = this.clients.get(client);
		if (meta) return meta;
		meta = {
			state: void 0,
			deferredQueue: []
		};
		this.clients.set(client, meta);
		this.knownClients.add(new WeakRef(client));
		this.transition(client, this.initialState);
		return meta;
	}
	buildHandlerArgs(client, inputName, meta) {
		return {
			ctx: client,
			inputName,
			defer: (opts) => {
				if (!meta.currentActionArgs) return;
				const deferred = {
					inputName,
					args: [...meta.currentActionArgs],
					untilState: opts?.until
				};
				meta.deferredQueue.push(deferred);
				this.emitter.emit("deferred", {
					inputName,
					client
				});
			},
			emit: (evtName, evtData) => {
				this.emitter.emit(evtName, evtData);
			}
		};
	}
	processQueue(client, meta) {
		const toReplay = [];
		const remaining = [];
		for (const item of meta.deferredQueue) if (item.untilState === void 0 || item.untilState === meta.state) toReplay.push(item);
		else remaining.push(item);
		meta.deferredQueue = remaining;
		for (const item of toReplay) this.handle(client, item.inputName, ...item.args);
	}
};
/**
* Internal factory called by `wrapChildLinks()` during construction.
* Wraps a raw Fsm or BehavioralFsm instance in a uniform `ChildLink` adapter
* so the parent engine doesn't need to know which type it's talking to.
*
* Users never call this directly — they assign an FSM instance to `_child`
* in their state config and `wrapChildLinks()` handles the wrapping.
*/
function createChildLink(child) {
	if (!child || typeof child !== "object") throw new Error(`createChildLink: expected an Fsm or BehavioralFsm instance, got ${String(child)}`);
	const childType = child[MACHINA_TYPE];
	if (childType === "BehavioralFsm") return {
		instance: child,
		canHandle(client, inputName) {
			return child.canHandle(client, inputName);
		},
		handle(client, inputName, ...args) {
			child.handle(client, inputName, ...args);
		},
		reset(client) {
			child.transition(client, child.initialState);
		},
		onAny(callback) {
			return child.on("*", callback);
		},
		compositeState(client) {
			return child.compositeState(client);
		},
		rehydrate(client, compositeState) {
			child.rehydrate(client, compositeState);
		},
		dehydrate(client, isOnActivePath) {
			return child.dehydrate(client, isOnActivePath);
		},
		planRehydrate(client, snapshot) {
			return child.planSnapshotWrites(client, snapshot);
		},
		dispose() {
			child.dispose();
		}
	};
	if (childType === "Fsm") return {
		instance: child,
		canHandle(_client, inputName) {
			return child.canHandle(inputName);
		},
		handle(_client, inputName, ...args) {
			child.handle(inputName, ...args);
		},
		reset(_client) {
			child.reset();
		},
		onAny(callback) {
			return child.on("*", callback);
		},
		compositeState(_client) {
			return child.compositeState();
		},
		rehydrate(_client, _compositeState) {
			throw new Error("rehydrate: cannot rehydrate an Fsm child. Fsm owns its own context; rehydrate is only valid for BehavioralFsm hierarchies.");
		},
		dehydrate(_client, _isOnActivePath) {
			throw new Error("dehydrate: cannot dehydrate an Fsm child. Fsm owns its own context; dehydrate is only valid for BehavioralFsm hierarchies.");
		},
		planRehydrate(_client, _snapshot) {
			throw new Error("rehydrate: cannot rehydrate an Fsm child. Fsm owns its own context; rehydrate is only valid for BehavioralFsm hierarchies.");
		},
		dispose() {
			child.dispose();
		}
	};
	throw new Error(`createChildLink: expected an Fsm or BehavioralFsm instance, got [MACHINA_TYPE] = ${String(childType ?? "undefined")}`);
}
function createBehavioralFsm(config) {
	if (config === void 0) return (curriedConfig) => new BehavioralFsm(curriedConfig);
	return new BehavioralFsm(config);
}

//#endregion
//#region src/fsm.ts
/**
* Single-client FSM. Wraps a BehavioralFsm and uses the config's `context`
* object as the implicit client, so callers never pass a client argument.
*
* Prefer `createFsm()` over constructing this directly — the factory infers
* all generic parameters from the config object.
*
* All public methods silently no-op after `dispose()` is called.
*
* @typeParam TCtx - The context type, inferred from `config.context`.
* @typeParam TStateNames - String literal union of valid state names.
* @typeParam TInputNames - String literal union of valid input names.
* @typeParam TBubbles - String literal union of inputs this FSM declares via
*   `bubbles`. Type-only — carried so `BubblesOfInstance` can extract it from
*   a constructed instance; nothing at runtime reads this generic.
*/
var Fsm = class {
	id;
	initialState;
	[MACHINA_TYPE] = "Fsm";
	states;
	bfsm;
	context;
	emitter = new Emitter();
	disposed = false;
	constructor(config) {
		this.id = config.id;
		this.initialState = config.initialState;
		this.context = config.context ?? {};
		this.bfsm = new BehavioralFsm(config);
		this.states = config.states;
		this.bfsm.on("*", (eventName, data) => {
			if (data && typeof data === "object" && "client" in data) {
				const { client: _, ...payload } = data;
				this.emitter.emit(eventName, payload);
			} else this.emitter.emit(eventName, data);
		});
		this.bfsm.transition(this.context, config.initialState);
	}
	/**
	* Dispatch an input to the current state's handler.
	* If a `_child` FSM in the current state can handle it, delegation occurs
	* there first; unhandled inputs bubble up to the parent.
	* No-ops silently when disposed.
	*/
	handle(inputName, ...args) {
		if (this.disposed) return;
		this.bfsm.handle(this.context, inputName, ...args);
	}
	/**
	* Returns true if the current state has a handler for `inputName`
	* (or a catch-all `"*"` handler), or if the current state's `_child`
	* chain can handle it (checked recursively, matching `handle()`'s
	* delegation reach). Does not trigger initialization or any side
	* effects. Returns false when disposed.
	*/
	canHandle(inputName) {
		if (this.disposed) return false;
		return this.bfsm.canHandle(this.context, inputName);
	}
	/**
	* Transition back to `initialState`, firing `_onEnter` and lifecycle
	* events as if entering it fresh. No-ops silently when disposed.
	*/
	reset() {
		if (this.disposed) return;
		this.bfsm.reset(this.context);
	}
	/**
	* Returns the current state name. Always defined — Fsm eagerly
	* initializes into `initialState` during construction.
	*/
	currentState() {
		return this.bfsm.currentState(this.context);
	}
	/**
	* Directly transition to `toState`, firing `_onExit`, `_onEnter`, and
	* lifecycle events. Same-state transitions are silently ignored.
	* No-ops when disposed.
	*/
	transition(toState) {
		if (this.disposed) return;
		this.bfsm.transition(this.context, toState);
	}
	/**
	* Returns the current state as a dot-delimited path that includes
	* any active child FSM states (e.g. `"active.connecting.retrying"`).
	* Returns just the current state name when no child is active.
	*/
	compositeState() {
		return this.bfsm.compositeState(this.context);
	}
	on(eventName, callback) {
		if (this.disposed) return { off() {} };
		return this.emitter.on(eventName, callback);
	}
	/**
	* Emit a custom event through the FSM. Built-in lifecycle events are
	* emitted automatically — this is for user-defined events from handlers.
	* Routes through the BehavioralFsm so all relay paths are consistent.
	* No-ops when disposed.
	*/
	emit(eventName, data) {
		if (this.disposed) return;
		this.bfsm.emit(eventName, data);
	}
	/**
	* Permanently shut down this FSM. Irreversible — all subsequent method
	* calls become silent no-ops. Clears all listeners and cascades disposal
	* to child FSMs (unless `preserveChildren` is set).
	*/
	dispose(options) {
		this.disposed = true;
		this.bfsm.dispose(options);
		this.emitter.clear();
	}
};
/**
* Create a single-client FSM from a config object.
*
* Generic parameters are inferred automatically:
* - `TCtx` comes from `config.context` (defaults to `{}` if omitted).
* - `TStates` is captured with `const` inference to preserve string literal
*   types, enabling compile-time validation of transition targets and `handle()`
*   input names.
*
* State names, input names, and all handler signatures derive from `TStates`.
*
* @example
* ```ts
* const light = createFsm({
*   id: "traffic-light",
*   initialState: "green",
*   context: { tickCount: 0 },
*   states: {
*     green:  { timeout: "yellow" },
*     yellow: { timeout: "red" },
*     red:    { timeout: "green" },
*   },
* });
*
* light.handle("timeout"); // transitions green → yellow
* ```
*/
function createFsm(config) {
	return new Fsm(config);
}

//#endregion
export { BehavioralFsm, Fsm, MACHINA_TYPE, createBehavioralFsm, createFsm };
//# sourceMappingURL=index.mjs.map