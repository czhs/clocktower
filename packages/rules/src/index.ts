// @ct/rules — pure Trouble Brewing rules engine (owned by rules-storyteller). No I/O; all
// randomness comes from the injected RNG; time comes from the caller (ctx.now).
//
//   createGame({players, rng}) -> GameState                (server-only state; never sent)
//   applyStCommand(state, cmd, {now}) -> CommandResult      (ST commands, incl. overrides/undo)
//   applyPlayerAction(state, seat, action, {now})           (nominate / vote / prompt answer / slayer shot)
//   tick(state, now)                                        (bedtime countdown, voting clock hand)
//   projectForPlayer(state, seat) -> PlayerGameView         (whitelisted, no hidden info)
//   projectForStoryteller(state) -> StorytellerGameView
export * from './types.js';
export {
  createGame,
  applyStCommand,
  applyPlayerAction,
  tick,
  setStorytellerConnected,
  setPlayerConnected,
  setVisiting,
  noteStoryteller,
  DEFAULT_VOTE_STEP_MS,
  type TickOptions,
  type CreateGameOptions,
  type PlayerAction,
} from './engine.js';
export { projectForPlayer, projectForStoryteller } from './project.js';
export {
  SETUP_TABLE,
  setupCounts,
  countTypes,
  randomAssignment,
  validateAssignment,
  completeAssignment,
  type SetupCounts,
  type Assignment,
} from './setup.js';
export { storylineBag, dealBag, presetAssignment, type BagDealOptions } from './presets.js';
export { ROLES, FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER, type RoleDef } from './roles.js';
export { finishVoteNow, minVotes } from './day.js';
export { mulberry32, impaired, actingRole } from './util.js';
export { commandLabel } from './labels.js';
