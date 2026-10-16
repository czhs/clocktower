//#region src/emitter.d.ts
/**
 * Returned by `on()`. Call `off()` to remove the subscription.
 * Safe to call multiple times — subsequent calls are no-ops because
 * the underlying Set deduplicates membership.
 */
type Subscription = {
  off(): void;
};
//#endregion
//#region src/behavioral-fsm.d.ts
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
declare class BehavioralFsm<TClient extends object, TStateNames extends string, TInputNames extends string, TBubbles extends string = never> {
  readonly id: string;
  readonly initialState: TStateNames;
  readonly [MACHINA_TYPE]: "BehavioralFsm";
  readonly states: Record<string, Record<string, unknown>>;
  private readonly emitter;
  private readonly clients;
  private readonly knownClients;
  private readonly childSubscriptions;
  private disposed;
  private transitionDepth;
  constructor(config: FsmConfig<TClient, Record<string, Record<string, unknown>>>);
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
  handle(client: TClient, inputName: TInputNames, ...args: unknown[]): void;
  /**
   * Returns true if the client's current state has a handler for `inputName`
   * (or a catch-all `"*"` handler), or if the current state's `_child` chain
   * can handle it — the check recurses to the same depth `handle()`'s
   * delegation can actually reach, so a grandchild-only input answers true
   * from the root. Does NOT initialize the client — no `_onEnter`, no
   * events, no side effects. Unseen clients are treated as if they were
   * already in `initialState`. Returns false when disposed.
   */
  canHandle(client: TClient, inputName: string): boolean;
  /**
   * Transition the client back to `initialState`, firing `_onEnter` and
   * lifecycle events as if entering it fresh. No-ops when disposed.
   */
  reset(client: TClient): void;
  /**
   * Returns the client's current state, or `undefined` if the client has
   * never been initialized (i.e. `handle()`, `transition()`, or `reset()`
   * have never been called for it). Does NOT trigger initialization.
   */
  currentState(client: TClient): TStateNames | undefined;
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
  transition(client: TClient, toState: TStateNames): void;
  /**
   * Returns the client's state as a dot-delimited path including any active
   * child FSM states (e.g. `"active.connecting.retrying"`). Returns just the
   * current state name when no child is active. Returns `""` for clients that
   * have never been initialized (unlike `currentState()` which returns `undefined`).
   */
  compositeState(client: TClient): string;
  /**
   * Silently place `client` at `compositeState` with no lifecycle activity —
   * no `_onEnter`, no `_onExit`, no `transitioning`/`transitioned` events.
   * Designed to work with `compositeState()`, which produces the dot-path
   * string that the string form consumes.
   *
   * The snapshot form (pass a `ClientSnapshot` from `dehydrate()`) additionally
   * requeues each level's pending deferred inputs, so a client resumes with the
   * same replay-on-next-transition behavior it had when dehydrated. Both forms
   * validate the ENTIRE hierarchy before writing anything — a throw at any level
   * leaves every level, including this one, unwritten.
   *
   * Throws synchronously for unknown state names, missing `_child` at an inner
   * level, or Fsm children in the hierarchy (Fsm owns its own context; nothing
   * per-client to rehydrate there).
   *
   * No-ops silently when disposed.
   */
  rehydrate(client: TClient, compositeState: string): void;
  rehydrate(client: TClient, snapshot: ClientSnapshot): void;
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
  dehydrate(client: TClient, isOnActivePath?: boolean): ClientSnapshot | undefined;
  /**
   * @internal
   * Validates `snapshot` against this level's state graph and recurses into
   * every declared child, returning write thunks to run only once the WHOLE
   * tree — every level — validates successfully. Nothing is written here.
   * Called by the object-form of `rehydrate()` and, recursively, by ChildLink
   * so a nested BehavioralFsm participates in the same validate-then-write
   * pass. Not part of the public persistence API — call `rehydrate()` instead.
   */
  planSnapshotWrites(client: TClient, snapshot: ClientSnapshot): Array<() => void>;
  private rehydrateCompositePath;
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
  private collectChildSnapshots;
  private snapshotDeferredInput;
  /**
   * Subscribe to a built-in lifecycle event or the wildcard.
   *
   * Named overload: typed payload includes `{ client: TClient }` so you can
   * identify which client the event pertains to. Wildcard (`"*"`) receives
   * `(eventName, data)` for every event. Returns a no-op `Subscription`
   * when disposed.
   */
  on<K extends keyof BehavioralFsmEventMap<TClient, TStateNames> & string>(eventName: K, callback: (data: BehavioralFsmEventMap<TClient, TStateNames>[K]) => void): Subscription;
  on(eventName: "*", callback: (eventName: string, data: unknown) => void): Subscription;
  /**
   * Emit a custom event through the FSM. Built-in lifecycle events are
   * emitted automatically — this is for user-defined events from handlers.
   * No-ops when disposed.
   */
  emit(eventName: string, data?: unknown): void;
  /**
   * Permanently shut down this FSM. Irreversible — all subsequent method
   * calls become silent no-ops. Tears down child subscriptions, clears all
   * listeners, and cascades disposal to child FSMs (unless `preserveChildren`
   * is set). The same child appearing in multiple states is disposed once.
   */
  dispose(options?: DisposeOptions): void;
  /**
   * Walks all states at construction time, detects raw FSM instances assigned
   * to _child, and wraps them into ChildLink adapters via createChildLink().
   * Must run BEFORE setupChildSubscriptions() so the subscriptions see
   * ChildLink objects, not raw FSM instances.
   */
  private wrapChildLinks;
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
  private setupChildSubscriptions;
  /**
   * Bubbles a child nohandler to the parent for the given client.
   * Only fires if the client is currently in a state that has this childLink.
   * Extracted from the lambda in setupChildSubscriptions to keep it readable.
   */
  private bubbleNohandler;
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
  private isChildActiveForClient;
  /**
   * The inner handler dispatch — no delegation, no initialization side effects
   * beyond what getOrCreateClientMeta already did. Called by handle() after
   * the delegation check, and by the nohandler child listener for bubbling.
   */
  private handleLocally;
  private getOrCreateClientMeta;
  private buildHandlerArgs;
  private processQueue;
}
/**
 * Create a behavioral FSM (one definition, many clients) from a config object.
 *
 * `TClient` can't be inferred from the config — there's no `context` property
 * at the FSM level for it to hook into, unlike `createFsm`'s `TCtx`. Supplying
 * it as a single explicit type argument (`createBehavioralFsm<Connection>({...})`)
 * doesn't work either: TypeScript has no partial type-argument inference, so
 * providing one of two type parameters disables inference for the other,
 * widening `TStates` to `Record<string, Record<string, unknown>>` and
 * discarding all literal-type validation.
 *
 * The fix is currying: call with zero arguments to fix `TClient`, then call
 * the returned function with the config to infer `TStates` from it, `const`
 * literal capture and all. This is the recommended way to type a client.
 *
 * If you'd rather skip the type argument entirely, annotate `ctx` inline on
 * at least one handler (e.g. `disconnect({ ctx }: { ctx: Connection }) {...}`)
 * and call with zero type arguments — `TClient` is then inferred from that
 * annotation. This only works when the annotation is visible directly on a
 * handler; it does NOT work through object spread (`...guards`), since
 * TypeScript won't look inside a spread for the annotation.
 *
 * @example
 * ```ts
 * interface Connection { url: string; retries: number; }
 *
 * const connFsm = createBehavioralFsm<Connection>()({
 *   id: "connectivity",
 *   initialState: "disconnected",
 *   states: {
 *     disconnected: { connect: "connecting" },
 *     connecting:   { connected: "online", failed: "disconnected" },
 *     online:       { disconnect: "disconnected" },
 *   },
 * });
 *
 * const conn = { url: "wss://example.com", retries: 0 };
 * connFsm.handle(conn, "connect");
 * ```
 *
 * @example Inline-annotated `ctx`, zero type arguments
 * ```ts
 * const connFsm = createBehavioralFsm({
 *   id: "connectivity",
 *   initialState: "disconnected",
 *   states: {
 *     disconnected: {
 *       connect({ ctx }: { ctx: Connection }) { return "connecting"; },
 *     },
 *     connecting: { connected: "online", failed: "disconnected" },
 *     online:     { disconnect: "disconnected" },
 *   },
 * });
 * ```
 *
 * @example Declaring bubbled inputs under the curried form
 * ```ts
 * // childFsm fires "phaseComplete" at itself but never handles it — it
 * // expects whatever mounts it via `_child` to catch the bubble.
 * const childFsm = createBehavioralFsm<Connection>()({
 *   id: "child",
 *   initialState: "green",
 *   bubbles: ["phaseComplete"],
 *   states: {
 *     green: { advance: "red" },
 *     red: {},
 *   },
 * });
 *
 * // Mounting it without handling (or re-declaring) "phaseComplete" is a
 * // compile error on `_child` below.
 * const parentFsm = createBehavioralFsm<Connection>()({
 *   id: "parent",
 *   initialState: "active",
 *   states: {
 *     active: {
 *       _child: childFsm,
 *       phaseComplete: "cooldown", // covers the bubble
 *     },
 *     cooldown: { advance: "active" },
 *   },
 * });
 * ```
 */
declare function createBehavioralFsm<TClient extends object>(): <const TStates extends Record<string, Record<string, unknown>>, TStateNames extends string = keyof TStates & string, TBubbles extends string = never>(config: FsmConfig<TClient, TStates, TStateNames, TBubbles>) => BehavioralFsm<TClient, keyof TStates & string, Exclude<{ [S in keyof TStates]: keyof TStates[S] & string }[keyof TStates], SpecialStateKeys> | { [S in keyof TStates]: TStates[S] extends {
  _child: infer C;
} ? InputNamesOfInstance<C> : never }[keyof TStates] | TBubbles, TBubbles>;
declare function createBehavioralFsm<TClient extends object, const TStates extends Record<string, Record<string, unknown>>, TStateNames extends string = keyof TStates & string, TBubbles extends string = never>(config: FsmConfig<TClient, TStates, TStateNames, TBubbles>): BehavioralFsm<TClient, keyof TStates & string, Exclude<{ [S in keyof TStates]: keyof TStates[S] & string }[keyof TStates], SpecialStateKeys> | { [S in keyof TStates]: TStates[S] extends {
  _child: infer C;
} ? InputNamesOfInstance<C> : never }[keyof TStates] | TBubbles, TBubbles>;
//#endregion
//#region src/types.d.ts
/**
 * Keys on a state object that have special meaning and are NOT input names.
 * Used by InputNamesOf to filter these out when collecting input names.
 *
 * @internal Exported from this module only so the factory return types in
 *   fsm.ts / behavioral-fsm.ts can inline InputNamesOf's definition for
 *   readable error text; not re-exported via index.ts.
 */
type SpecialStateKeys = "_onEnter" | "_onExit" | "_child" | "*";
/**
 * Extracts state names as a string literal union from a states config object.
 *
 * @example
 * ```ts
 * type S = StateNamesOf<{ green: {...}, yellow: {...}, red: {...} }>;
 * // => "green" | "yellow" | "red"
 * ```
 */
type StateNamesOf<TStates> = keyof TStates & string;
/**
 * Extracts a state config's OWN input names — the handler keys declared
 * directly on its states, before any child FSM's inputs are folded in.
 * Collects all handler keys across ALL states, then strips out lifecycle
 * hooks and special keys (_onEnter, _onExit, _child, *).
 *
 * Split out from `InputNamesOf` so the child-coverage machinery (`CoverageOf`)
 * can ask "what does this FSM handle locally?" without pulling in every
 * descendant's inputs too — coverage is about what THIS level absorbs, not
 * what its children happen to also expose.
 *
 * @example
 * ```ts
 * type I = OwnInputNamesOf<{
 *   idle:    { start: "running", reset: fn };
 *   running: { pause: "paused", stop: "idle" };
 * }>;
 * // => "start" | "reset" | "pause" | "stop"
 * ```
 *
 * How it works:
 * 1. `{ [S in keyof TStates]: keyof TStates[S] & string }` — maps each state
 *    to the union of its handler key names
 * 2. `[keyof TStates]` — collapses the mapped type into a flat union of ALL
 *    handler keys across every state
 * 3. `Exclude<..., SpecialStateKeys>` — strips lifecycle/special keys
 */
type OwnInputNamesOf<TStates> = Exclude<{ [S in keyof TStates]: keyof TStates[S] & string }[keyof TStates], SpecialStateKeys>;
/**
 * Extracts input names as a string literal union from a states config object.
 * This is what flows into `handle(inputName)` to provide compile-time
 * validation of input names.
 *
 * A parent's `handle()` genuinely accepts everything its `_child` FSMs accept:
 * the engine checks the child first and only falls through to the parent's
 * own handlers if the child can't handle the input (see `BehavioralFsm.handle`).
 * `InputNamesOf` mirrors that at the type level by unioning the config's own
 * input names with every declared child's input names (recursively —
 * grandchildren ride along because each child's own `InputNamesOfInstance`
 * already folded in ITS children when that child was created).
 *
 * @example
 * ```ts
 * type I = InputNamesOf<{
 *   idle:    { start: "running", reset: fn };
 *   running: { pause: "paused", stop: "idle" };
 * }>;
 * // => "start" | "reset" | "pause" | "stop"
 * ```
 */
type InputNamesOf<TStates> = OwnInputNamesOf<TStates> | ChildInputNamesOf<TStates>;
/**
 * Walks every state looking for a `_child`, and folds in that child instance's
 * own input names (via `InputNamesOfInstance`). Not exported — `InputNamesOf`
 * is the public surface; this is just the "look inside _child" half of it.
 */
type ChildInputNamesOf<TStates> = { [S in keyof TStates]: TStates[S] extends {
  _child: infer C;
} ? InputNamesOfInstance<C> : never }[keyof TStates];
/**
 * Extracts state names from a concrete machina FSM instance.
 *
 * Unlike `keyof TFsm`, this reads the class generic that stores user-defined
 * state names, so adapter signatures stay tied to the configured states
 * instead of widening to method/property names.
 */
type StateNamesOfInstance<TFsm> = TFsm extends Fsm<infer _TCtx extends object, infer TStateNames extends string, infer _TInputNames extends string> ? TStateNames : TFsm extends BehavioralFsm<infer _TClient extends object, infer TStateNames extends string, infer _TInputNames extends string> ? TStateNames : never;
/**
 * Extracts input names from a concrete machina FSM instance.
 */
type InputNamesOfInstance<TFsm> = TFsm extends Fsm<infer _TCtx extends object, infer _TStateNames extends string, infer TInputNames extends string> ? TInputNames : TFsm extends BehavioralFsm<infer _TClient extends object, infer _TStateNames extends string, infer TInputNames extends string> ? TInputNames : never;
/**
 * Extracts the context object type from a concrete single-client FSM instance.
 */
type ContextOf<TFsm> = TFsm extends Fsm<infer TCtx extends object, infer _TStateNames extends string, infer _TInputNames extends string> ? TCtx : never;
/**
 * Extracts the client object type from a concrete behavioral FSM instance.
 */
type ClientOf<TFsm> = TFsm extends BehavioralFsm<infer TClient extends object, infer _TStateNames extends string, infer _TInputNames extends string> ? TClient : never;
/**
 * Extracts the declared `bubbles` union from a concrete machina FSM instance —
 * the inputs that FSM fires at itself without handling, expecting a `_child`
 * mount point to catch them (see `ChildCoverage`). `never` for an instance
 * that declared no `bubbles` (the common case) or for a non-machina type.
 */
type BubblesOfInstance<TFsm> = TFsm extends Fsm<infer _TCtx extends object, infer _TStateNames extends string, infer _TInputNames extends string, infer TBubbles extends string> ? TBubbles : TFsm extends BehavioralFsm<infer _TClient extends object, infer _TStateNames extends string, infer _TInputNames extends string, infer TBubbles extends string> ? TBubbles : never;
/**
 * The single combined object passed to every handler.
 *
 * Handlers return a state name to transition, or void to stay put.
 * This replaces imperative `transition()` calls — closer to gen_fsm's
 * return-based model and symmetrical with string shorthand handlers.
 *
 * @typeParam TCtx - The context type. For Fsm this is the config-defined
 *   context object. For BehavioralFsm this is the client object itself.
 * @typeParam TStateNames - String literal union of valid state names.
 *   Defaults to `string` for loose usage; the factory functions narrow this
 *   to the actual state names inferred from the config.
 *
 * @example
 * ```ts
 * // Conditional transition — return the target state:
 * timeout({ ctx }) {
 *   if (ctx.tickCount >= 3) return "yellow";
 * }
 *
 * // Side effects without transition — return nothing:
 * tick({ ctx }) {
 *   ctx.tickCount++;
 * }
 *
 * // In a catch-all — inputName tells you what was received:
 * "*"({ inputName }) {
 *   console.log(`unhandled input: ${inputName}`);
 * }
 * ```
 */
interface HandlerArgs<TCtx, TStateNames extends string = string> {
  /** The context (Fsm) or client object (BehavioralFsm) */
  ctx: TCtx;
  /**
   * The name of the input currently being handled.
   *
   * Typed as `string` rather than the inferred input union because:
   * 1. Inside a named handler you already know the input name
   * 2. In a catch-all (*) handler it could be anything
   * 3. Narrowing to the literal per-handler would require complex
   *    mapped types for zero practical benefit
   */
  inputName: string;
  /**
   * Defer the current input for replay after a future transition.
   * Erlang's selective receive, in JS form.
   *
   * @example
   * ```ts
   * // Replay on the next transition to any state
   * defer();
   *
   * // Replay only when entering "yellow"
   * defer({ until: "yellow" });
   * ```
   */
  defer(opts?: {
    until: TStateNames;
  }): void;
  /**
   * Emit a custom event through the FSM's emitter.
   * Built-in events (transitioning, transitioned, etc.) are emitted
   * automatically by the FSM engine — this is for user-defined events.
   */
  emit(eventName: string, data?: unknown): void;
}
/**
 * A function handler for state inputs, lifecycle hooks (_onEnter, _onExit),
 * and catch-all (*) handlers.
 *
 * **Return value determines transition:**
 * - Return a valid state name → FSM transitions to that state
 * - Return void/undefined → FSM stays in the current state
 *
 * This mirrors gen_fsm's `{next_state, StateName, NewStateData}` return.
 * Guards are just `if` statements. Actions are just code before the return.
 *
 * The `...extra` rest parameter captures additional arguments passed through
 * `handle(inputName, ...extraArgs)`. These are untyped (`unknown[]`) because
 * correlating per-input arg types with handle() call sites would require
 * prohibitively complex mapped types for minimal benefit.
 *
 * @example
 * ```ts
 * // Side effects only, no transition:
 * tick({ ctx }) { ctx.tickCount++; }
 *
 * // Conditional transition (replaces guard + target):
 * timeout({ ctx }) {
 *   if (ctx.tickCount >= 3) return "yellow";
 * }
 *
 * // Unconditional transition with side effect (replaces action + target):
 * timeout({ ctx }) {
 *   console.log("transitioning after", ctx.tickCount, "ticks");
 *   return "yellow";
 * }
 *
 * // Handler with extra args passed via handle("success", responseData):
 * success({ ctx }, data) { ctx.result = data; }
 * ```
 */
type HandlerFn<TCtx, TStateNames extends string = string> = (args: HandlerArgs<TCtx, TStateNames>, ...extra: unknown[]) => TStateNames | void;
/**
 * The union of valid handler definition forms for a state input.
 *
 * - `TStateNames` — string shorthand, auto-transitions to that state
 * - `HandlerFn` — function that returns a state name (transition) or void (stay)
 * - `MachinaInstance` — NOT a handler you'd write under an input key. It's here
 *   because `ValidateStates` types every state as the SAME `Record` value type,
 *   which combines named properties (`_onEnter`, `_onExit`, `_child`, `"*"`)
 *   with a `[input: string]: HandlerDef<...>` index signature covering
 *   everything else. TypeScript requires every named property's type to be
 *   assignable to the index signature's type, so `_child?: MachinaInstance`
 *   only type-checks if `HandlerDef` itself includes `MachinaInstance` in its
 *   union. Remove this member and `_child: someChildFsm` stops compiling.
 *
 * @example
 * ```ts
 * states: {
 *   green: {
 *     timeout: "yellow",                    // string shorthand
 *     tick({ ctx }) { ctx.tickCount++; },   // function, no transition
 *     emergency({ ctx }) {                  // function, conditional transition
 *       if (ctx.severity > 5) return "red";
 *     },
 *   },
 * }
 * ```
 */
type HandlerDef<TCtx, TStateNames extends string = string> = TStateNames | HandlerFn<TCtx, TStateNames> | MachinaInstance;
/**
 * Validates and constrains the states object at the type level.
 *
 * A `Record` keyed by `TStateNames` (see the module-level comment above for
 * why it's keyed by this dedicated parameter rather than re-deriving keys
 * from `TStates`). Every state gets the same value shape: named optional
 * keys for lifecycle hooks / `_child` / catch-all, plus an index signature
 * for ordinary inputs.
 *
 * | Key              | Expected type                           |
 * |------------------|-----------------------------------------|
 * | `_onEnter`       | HandlerFn (lifecycle hook)              |
 * | `_onExit`        | HandlerFn (lifecycle hook)              |
 * | `_child`         | MachinaInstance (Fsm or BehavioralFsm)  |
 * | `*`              | HandlerFn (catch-all)                   |
 * | anything else    | HandlerDef (string or fn)               |
 *
 * @typeParam TCtx - Context/client type, flows into handler signatures
 * @typeParam TStates - The literal states object type. Only used here to
 *   default `TStateNames` — every other reference in this type uses
 *   `TStateNames` directly, never `TStates`, to avoid re-entering inference.
 * @typeParam TStateNames - The state-name union. Defaults to
 *   `keyof TStates & string`, but callers that already resolved it
 *   (the factory functions) pass it through explicitly.
 */
type ValidateStates<TCtx, TStates extends Record<string, Record<string, unknown>>, TStateNames extends string = keyof TStates & string> = Record<TStateNames, {
  _onEnter?: HandlerFn<TCtx, NoInfer<TStateNames>>;
  _onExit?: HandlerFn<TCtx, NoInfer<TStateNames>>;
  _child?: MachinaInstance;
  "*"?: HandlerFn<TCtx, NoInfer<TStateNames>>;
} & {
  [input: string]: HandlerDef<TCtx, NoInfer<TStateNames>>;
}>;
/**
 * True when at least one state in `TStates` declares a `"*"` catch-all —
 * a catch-all absorbs every input, including any bubbled one, so it counts
 * as coverage for the whole FSM regardless of which state it lives on.
 */
type HasCatchAll<TStates> = { [S in keyof TStates]: "*" extends keyof TStates[S] ? true : never }[keyof TStates] extends never ? false : true;
/**
 * What this FSM absorbs, for the purpose of covering a mounted child's
 * bubbled inputs: everything it handles locally (`OwnInputNamesOf`), plus
 * everything it re-declares as its OWN `bubbles` (re-exporting the
 * obligation to whatever mounts THIS FSM), plus — if a catch-all exists
 * anywhere — literally anything.
 */
type CoverageOf<TStates, TBubbles extends string> = OwnInputNamesOf<TStates> | TBubbles | (HasCatchAll<TStates> extends true ? string : never);
/**
 * For state `S`, if it mounts a `_child`, the child's declared bubbles that
 * this FSM's `CoverageOf` doesn't account for. `never` when the state has no
 * `_child`, or when every bubble is covered.
 */
type UncoveredChildBubbles<TStates extends Record<string, Record<string, unknown>>, S extends string, TBubbles extends string> = TStates[S] extends {
  _child: infer C;
} ? Exclude<BubblesOfInstance<C>, CoverageOf<TStates, TBubbles>> : never;
/**
 * Enforces the bubbled-input wiring contract across an entire `states`
 * config. Intersected onto `FsmConfig.states` alongside `TStates` and
 * `ValidateStates`, so a violation reports on the `states` object itself.
 *
 * Per state: `unknown` (a no-op intersection member) when that state's
 * `_child` mount — if any — has no uncovered bubbles. Otherwise, an
 * impossible-to-satisfy `_child` type whose single property name IS the
 * error message, naming exactly which inputs are uncovered. Coverage is
 * FSM-wide rather than mount-state-local: a bubbled input re-dispatches
 * against whatever state the parent happens to be in when the bubble
 * fires, which can be any state — so coverage declared ANYWHERE in the
 * config (or in this FSM's own `bubbles`, or via a `"*"` anywhere) counts,
 * matching that runtime reality exactly.
 */
type ChildCoverage<TStates extends Record<string, Record<string, unknown>>, TStateNames extends string, TBubbles extends string> = { [S in TStateNames]: UncoveredChildBubbles<NoInfer<TStates>, S, NoInfer<TBubbles>> extends never ? unknown : {
  _child: {
    "child bubbles up inputs this FSM neither handles nor re-declares": UncoveredChildBubbles<NoInfer<TStates>, S, NoInfer<TBubbles>>;
  };
} };
/**
 * Configuration object for creating an FSM.
 *
 * @typeParam TCtx - The context type (Fsm) or client type (BehavioralFsm).
 *   For Fsm, this is inferred from the `context` property. For BehavioralFsm,
 *   it's the client object type provided explicitly or as a generic parameter.
 *
 * @typeParam TStates - The literal states object type. Captured directly from
 *   the naked `states: TStates & ...` intersection member below (ideally with
 *   `const` on the factory's generic to preserve string literal types) —
 *   deliberately NOT derived from `ValidateStates`, so an empty or
 *   function-only state can't disable inference (see `ValidateStates`'
 *   module comment for the full mechanism). Defaults to a loose record for
 *   unconstrained usage.
 *
 * @typeParam TStateNames - The state-name union, defaulted from `TStates` but
 *   captured as its OWN parameter (see `ValidateStates`) so it's available,
 *   fully resolved, while handler bodies are still being type-checked.
 *
 * @typeParam TBubbles - The union of inputs this FSM declares via `bubbles`.
 *   Defaults to `never` — most FSMs bubble nothing.
 *
 * @example
 * ```ts
 * // TCtx inferred as { tickCount: number }, TStates inferred from states object:
 * createFsm({
 *   id: "traffic-light",
 *   initialState: "green",         // validated against state keys
 *   context: { tickCount: 0 },     // inference site for TCtx
 *   states: {
 *     green:  { timeout: "yellow" }, // "yellow" validated against state keys
 *     yellow: { timeout: "red" },
 *     red:    { timeout: "green" },
 *   },
 * });
 * ```
 *
 * @example Declaring bubbled inputs for a child FSM
 * ```ts
 * // This FSM fires "phaseComplete" at itself but never handles it — it
 * // expects whatever mounts it via `_child` to catch the bubble.
 * const phaseController = createFsm({
 *   id: "phase-controller",
 *   initialState: "green",
 *   bubbles: ["phaseComplete"],
 *   states: {
 *     green: { advance: "red" },
 *     red: {
 *       _onEnter({ ctx }) {
 *         setTimeout(() => phaseController.handle("phaseComplete"), 0);
 *       },
 *     },
 *   },
 * });
 *
 * // Mounting it without handling "phaseComplete" (and without re-declaring
 * // it in this FSM's own `bubbles`) is a compile error on `_child` below.
 * const intersection = createFsm({
 *   id: "intersection",
 *   initialState: "northSouth",
 *   states: {
 *     northSouth: {
 *       _child: phaseController,
 *       phaseComplete: "clearance", // this line is what covers the bubble
 *     },
 *     clearance: { advance: "northSouth" },
 *   },
 * });
 * ```
 */
interface FsmConfig<TCtx, TStates extends Record<string, Record<string, unknown>> = Record<string, Record<string, unknown>>, TStateNames extends string = keyof TStates & string, TBubbles extends string = never> {
  /** Unique identifier for this FSM */
  id: string;
  /**
   * The state to start in. Must be a key of `states`.
   *
   * Wrapped in NoInfer to prevent TypeScript from using this value as an
   * inference site for TStateNames. Without it, `initialState: "green"`
   * could narrow the state-name union to only have a "green" key. We want
   * inference to come exclusively from the `states` property.
   */
  initialState: NoInfer<TStateNames>;
  /**
   * Initial context data. The type is inferred from this value and flows
   * into every handler's `ctx` parameter.
   *
   * For BehavioralFsm, this property is optional and serves only as a
   * type constraint — the client object IS the context.
   */
  context?: TCtx;
  /**
   * Inputs this FSM fires at itself without handling them — expecting
   * whatever mounts it via `_child` to catch them through machina's
   * nohandler-bubbling mechanism (see the "Input delegation" section of the
   * hierarchical states guide). Declaring a bubble does two things:
   *
   * 1. Joins this FSM's own typed input union, so a self-directed
   *    `fsm.handle("phaseComplete")` (e.g. from inside `_onEnter`)
   *    type-checks without a cast.
   * 2. Becomes part of this FSM's mounting contract: any config that
   *    mounts it via `_child` must handle every declared bubble in some
   *    state, re-declare it in its OWN `bubbles` (passing the obligation
   *    up another level), or carry a `"*"` catch-all — enforced at compile
   *    time by `ChildCoverage`, which is intersected onto `states` below.
   *
   * A bubble name is NOT a state name — it can't be used as a string
   * shorthand transition target. Omit `bubbles` entirely (the default) for
   * an FSM that never expects a container to catch anything from it — such
   * an FSM can be mounted via `_child` anywhere with no obligations.
   */
  bubbles?: readonly TBubbles[];
  /**
   * State definitions. Keys become the state name union.
   *
   * The intersection with the bare `TStates` is what makes literal-type
   * capture work for empty and function-only states (see `ValidateStates`'
   * module comment) — `ValidateStates` and `ChildCoverage` layer validation
   * and the bubble-coverage contract on top without becoming the inference
   * source themselves.
   */
  states: TStates & ValidateStates<TCtx, TStates, TStateNames> & ChildCoverage<TStates, TStateNames, TBubbles>;
}
/**
 * Symbol used as a property key to identify machina FSM instances at runtime.
 * Each class stamps itself with a MachinaType value so the ChildLink adapter
 * can dispatch handle()/canHandle()/reset() correctly without circular imports.
 */
declare const MACHINA_TYPE: unique symbol;
/**
 * Discriminant values stamped onto FSM instances via `MACHINA_TYPE`.
 * Used by the `ChildLink` adapter to dispatch calls correctly without
 * importing either class directly (which would create circular dependencies).
 */
type MachinaType = "Fsm" | "BehavioralFsm";
/** Structural type matching any machina FSM instance (Fsm or BehavioralFsm) */
type MachinaInstance = {
  readonly [MACHINA_TYPE]: MachinaType;
};
/**
 * Internal adapter that wraps either an Fsm or BehavioralFsm child,
 * presenting a uniform API for parent-initiated delegation.
 */
interface ChildLink {
  /** Check if the child's current state can handle this input */
  canHandle(client: object, inputName: string): boolean;
  /** Dispatch the input to the child */
  handle(client: object, inputName: string, ...args: unknown[]): void;
  /** Reset the child to its initialState */
  reset(client: object): void;
  /** Subscribe to all child events (wildcard). Returns unsubscribe fn. */
  onAny(callback: (eventName: string, data: unknown) => void): {
    off(): void;
  };
  /** The child FSM's compositeState for the given client */
  compositeState(client: object): string;
  /**
   * Silently place `client` at the given composite state within the child hierarchy.
   * Throws for Fsm children (no per-client state to rehydrate).
   */
  rehydrate(client: object, compositeState: string): void;
  /**
   * Snapshot everything this child tracks for `client`, recursing into its own
   * children. `undefined` when the child has never seen this client. Throws for
   * Fsm children that are on the active path — an Fsm owns its own context, so
   * there's nothing per-client to snapshot. `isOnActivePath` is threaded down
   * from the true root's dehydrate() call: it's `false` whenever ANY ancestor
   * declaring state didn't match its own parent's active state, so a nested
   * BehavioralFsm child correctly treats every one of its own Fsm children as
   * off-path once the child itself is off-path, rather than recomputing
   * reachability from its own (possibly dormant) state alone.
   */
  dehydrate(client: object, isOnActivePath: boolean): ClientSnapshot | undefined;
  /**
   * Validates `snapshot` against this child's state graph (recursing into its
   * own children) and returns write thunks to run only once the ENTIRE tree
   * validates — nothing is written here. Throws for Fsm children, matching
   * `dehydrate()`.
   */
  planRehydrate(client: object, snapshot: ClientSnapshot): Array<() => void>;
  /** Dispose the child FSM */
  dispose(): void;
  /**
   * The raw Fsm or BehavioralFsm instance this ChildLink wraps.
   * Exposed for inspection tooling (machina-inspect) — allows external
   * tools to introspect child graph structure without reaching through
   * private fields.
   */
  instance: MachinaInstance;
}
/**
 * Options for FSM disposal.
 */
interface DisposeOptions {
  /**
   * When true, child FSMs declared via _child are NOT disposed.
   * Default: false (children ARE disposed along with the parent).
   */
  preserveChildren?: boolean;
}
/**
 * Built-in event map for Fsm instances.
 * Payloads do NOT include a client reference (Fsm is its own client).
 *
 * @typeParam TStateNames - The state name union, flows into transition
 *   event payloads so fromState/toState are narrowed to actual state names.
 */
interface FsmEventMap<TStateNames extends string = string> {
  /** Fired just before a state transition occurs */
  transitioning: {
    fromState: TStateNames;
    toState: TStateNames;
  };
  /** Fired just after a state transition completes */
  transitioned: {
    fromState: TStateNames;
    toState: TStateNames;
  };
  /** Fired when an input is about to be dispatched to a handler */
  handling: {
    inputName: string;
  };
  /** Fired after an input has been successfully handled */
  handled: {
    inputName: string;
  };
  /** Fired when an input has no matching handler in the current state */
  nohandler: {
    inputName: string;
    args: unknown[];
  };
  /** Fired when a transition targets a state that doesn't exist */
  invalidstate: {
    stateName: string;
  };
  /** Fired when an input is deferred for later replay */
  deferred: {
    inputName: string;
  };
}
/**
 * Built-in event map for BehavioralFsm instances.
 * Every payload is intersected with `{ client: TClient }` so subscribers
 * can identify which client the event pertains to.
 *
 * @typeParam TClient - The client object type
 * @typeParam TStateNames - The state name union
 */
type BehavioralFsmEventMap<TClient, TStateNames extends string = string> = { [K in keyof FsmEventMap<TStateNames>]: FsmEventMap<TStateNames>[K] & {
  client: TClient;
} };
/**
 * A deferred input queue entry. Created when a handler calls
 * deferUntilTransition() — the input is stored here and replayed
 * after a future state transition.
 */
interface DeferredInput {
  /** The input name that was deferred */
  inputName: string;
  /** The original arguments passed to handle() for this input */
  args: unknown[];
  /**
   * If set, only replay when entering this specific state.
   * When undefined, replays on the next transition to any state.
   */
  untilState?: string;
}
/**
 * Plain-data snapshot of everything machina tracks for one client at a given
 * level of the FSM hierarchy. Produced by `dehydrate()`, consumed by the
 * object-overload of `rehydrate()`.
 *
 * `children` covers every state whose `_child` holds tracking data for this
 * client — active or not. A child the client never reached has no entry
 * (there's nothing to restore). This full-fidelity walk is what makes a
 * rehydrated client behaviorally indistinguishable from one that never left
 * memory: off-path child state and its pending deferrals travel too, and
 * replay/reset exactly as they would have in-memory on the parent's next
 * re-entry.
 */
interface ClientSnapshot {
  /** This level's state name (not the composite dot-path). */
  state: string;
  /** This level's pending deferred inputs, in FIFO replay order. */
  deferred: DeferredInput[];
  /**
   * One entry per state (at this level) whose `_child` has tracking data
   * for this client, keyed by that state's name. Omitted entirely when no
   * state's child has ever seen this client.
   */
  children?: {
    [stateName: string]: ClientSnapshot;
  };
}
//#endregion
//#region src/fsm.d.ts
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
declare class Fsm<TCtx extends object, TStateNames extends string, TInputNames extends string, TBubbles extends string = never> {
  readonly id: string;
  readonly initialState: TStateNames;
  readonly [MACHINA_TYPE]: "Fsm";
  readonly states: Record<string, Record<string, unknown>>;
  private readonly bfsm;
  readonly context: TCtx;
  private readonly emitter;
  private disposed;
  constructor(config: FsmConfig<TCtx, Record<string, Record<string, unknown>>>);
  /**
   * Dispatch an input to the current state's handler.
   * If a `_child` FSM in the current state can handle it, delegation occurs
   * there first; unhandled inputs bubble up to the parent.
   * No-ops silently when disposed.
   */
  handle(inputName: TInputNames, ...args: unknown[]): void;
  /**
   * Returns true if the current state has a handler for `inputName`
   * (or a catch-all `"*"` handler), or if the current state's `_child`
   * chain can handle it (checked recursively, matching `handle()`'s
   * delegation reach). Does not trigger initialization or any side
   * effects. Returns false when disposed.
   */
  canHandle(inputName: string): boolean;
  /**
   * Transition back to `initialState`, firing `_onEnter` and lifecycle
   * events as if entering it fresh. No-ops silently when disposed.
   */
  reset(): void;
  /**
   * Returns the current state name. Always defined — Fsm eagerly
   * initializes into `initialState` during construction.
   */
  currentState(): TStateNames;
  /**
   * Directly transition to `toState`, firing `_onExit`, `_onEnter`, and
   * lifecycle events. Same-state transitions are silently ignored.
   * No-ops when disposed.
   */
  transition(toState: TStateNames): void;
  /**
   * Returns the current state as a dot-delimited path that includes
   * any active child FSM states (e.g. `"active.connecting.retrying"`).
   * Returns just the current state name when no child is active.
   */
  compositeState(): string;
  /**
   * Subscribe to a built-in lifecycle event or the wildcard.
   *
   * Named overload: typed payload, no event name in callback.
   * Wildcard (`"*"`): receives `(eventName, data)` for every event.
   * Returns a no-op `Subscription` when disposed.
   */
  on<K extends keyof FsmEventMap<TStateNames> & string>(eventName: K, callback: (data: FsmEventMap<TStateNames>[K]) => void): Subscription;
  on(eventName: "*", callback: (eventName: string, data: unknown) => void): Subscription;
  /**
   * Emit a custom event through the FSM. Built-in lifecycle events are
   * emitted automatically — this is for user-defined events from handlers.
   * Routes through the BehavioralFsm so all relay paths are consistent.
   * No-ops when disposed.
   */
  emit(eventName: string, data?: unknown): void;
  /**
   * Permanently shut down this FSM. Irreversible — all subsequent method
   * calls become silent no-ops. Clears all listeners and cascades disposal
   * to child FSMs (unless `preserveChildren` is set).
   */
  dispose(options?: DisposeOptions): void;
}
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
declare function createFsm<TCtx extends object = Record<string, never>, const TStates extends Record<string, Record<string, unknown>> = Record<string, Record<string, unknown>>, TStateNames extends string = keyof TStates & string, TBubbles extends string = never>(config: FsmConfig<TCtx, TStates, TStateNames, TBubbles>): Fsm<TCtx, keyof TStates & string, Exclude<{ [S in keyof TStates]: keyof TStates[S] & string }[keyof TStates], SpecialStateKeys> | { [S in keyof TStates]: TStates[S] extends {
  _child: infer C;
} ? InputNamesOfInstance<C> : never }[keyof TStates] | TBubbles, TBubbles>;
//#endregion
export { BehavioralFsm, type BehavioralFsmEventMap, type BubblesOfInstance, type ChildLink, type ClientOf, type ClientSnapshot, type ContextOf, type DeferredInput, type DisposeOptions, Fsm, type FsmConfig, type FsmEventMap, type HandlerArgs, type HandlerDef, type HandlerFn, type InputNamesOf, type InputNamesOfInstance, MACHINA_TYPE, type MachinaInstance, type StateNamesOf, type StateNamesOfInstance, type Subscription, createBehavioralFsm, createFsm };
//# sourceMappingURL=index.d.mts.map