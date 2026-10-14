// @ct/rules — pure Trouble Brewing rules engine (owned by rules-storyteller).
// Public API contract (to be implemented):
//   createGame(players, rng) -> GameState            (server-only state)
//   applyStCommand(state, cmd, ctx) -> Result<GameState>
//   applyPlayerAction(state, seat, action) -> Result<GameState>
//   projectForPlayer(state, seat) -> PlayerGameView  (MUST NOT leak hidden info)
//   projectForStoryteller(state) -> StorytellerGameView
export {};
