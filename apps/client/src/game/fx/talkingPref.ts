// Talking-outline display preference (OWNED BY voice; tiny on purpose: the Settings panel imports it).
//   'behind' (default) the outline is y-sorted with its avatar: buildings and props in front hide it,
//                      exactly like the character sprite itself
//   'top'              always drawn on top of everything (like name labels), also through buildings
// Stored per browser in localStorage['ct.talkOutline']; the town re-reads it about once a second.
export type TalkOutlineMode = 'behind' | 'top';
export const TALK_OUTLINE_KEY = 'ct.talkOutline';

export function parseTalkOutlineMode(v: unknown): TalkOutlineMode {
  return v === 'top' ? 'top' : 'behind';
}

export function readTalkOutlineMode(): TalkOutlineMode {
  try {
    return parseTalkOutlineMode(window.localStorage.getItem(TALK_OUTLINE_KEY));
  } catch {
    return 'behind';
  }
}

export function saveTalkOutlineMode(m: TalkOutlineMode) {
  try {
    window.localStorage.setItem(TALK_OUTLINE_KEY, m);
  } catch {
    /* storage blocked: the default stays */
  }
}
