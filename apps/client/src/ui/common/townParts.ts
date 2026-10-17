// (v2.4 perf P2) One lazy chunk for the in-town panels that only render once the town is up (or, for
// the storyline picker, only in automatic lobbies): kept out of the LobbyRoute chunk so the waiting
// room's first frame needs less code. Loaded through ui/common/lazyTown.tsx; fetched in parallel with
// Phaser as soon as the lobby route mounts.
export { Notebook } from '../notebook/Notebook';
export { Story } from '../story/Story';
export { SocialPalette } from '../social/SocialPalette';
export { ClockChip } from '../clock/ClockChip';
export { AutoStorylineSetting } from '../storyteller/autoStoryline';
