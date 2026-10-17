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
  DEFAULT_SCRIPT,
  SETUP_TABLE,
  setupCounts,
  countTypes,
  randomAssignment,
  validateAssignment,
  completeAssignment,
  type SetupCounts,
  type Assignment,
} from './setup.js';
export {
  ROLES,
  FIRST_NIGHT_ORDER,
  OTHER_NIGHT_ORDER,
  firstNightOrder,
  otherNightOrder,
  jinxesFor,
  type RoleDef,
  type ScriptRoleDefs,
} from './roles.js';
export {
  acknowledge,
  choose,
  chooseCharacter,
  chooseRange,
  chosen,
  pairPick,
  pairSuggestion,
  target,
  targets,
  yesNo,
  type KillPrevention,
  type ResolveInput,
  type StepSuggestion,
} from './rolekit.js';
export { becomeDemon, killPlayer, killPrevention } from './deaths.js';
export { finishVoteNow, minVotes } from './day.js';
// Storyteller-facing night-step view (suggestion, prompt, notes). Used by the ST panel and tests.
export { stepView, buildNightQueue, findStep, openStepFor } from './night.js';
export { mulberry32, impaired, actingRole } from './util.js';
// Travellers: the exile mechanic (travellers are exiled, never executed).
export {
  addTraveller,
  callExile,
  cancelExile,
  canBeNominated,
  EXILE_REMINDER,
  exilePlayer,
  exileThreshold,
  isTravellerPlayer,
  setExileHand,
  startExileVote,
  tallyExile,
  travellersIn,
  type ExileState,
} from './exile.js';
// Custom scripts: validate and derive a Storyteller-built character list (any mix, incl. homebrew).
export {
  buildCustomScript,
  playerCountsSupported,
  validateCustomScript,
  type CustomScript,
  type CustomScriptValidation,
} from './customScript.js';
