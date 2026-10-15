// CMU easter eggs — all text (cmu-eggs). Original writing; see docs/easter-eggs.md for what each
// line nods to. Rendered with textContent only (never innerHTML).

export const FENCE_MESSAGES: readonly string[] = [
  'HAPPY BIRTHDAY, BOVIK (WHOEVER YOU ARE)',
  'THE KEEP’S LIFT IS FIXED — and beneath it, in another colour: NO IT ISN’T',
  'HOLLOWMERE: THE CORNELL OF THE TOP TWENTY VILLAGES',
  'WELCOME, NEW VILLAGERS! YOUR FIRST CURSE IS DUE FRIDAY, 11:59',
  'SLEEP IS A SOCIAL CONSTRUCT — THE NIGHT WATCH',
  'WE GUARDED THIS ALL NIGHT FOR THIS?',
  'MALLOC’D THREE HOURS OF SLEEP. FREED NONE.',
  'SWEEPSTAKES GUILD: HILL TWO IS STILL A HILL',
  'FREE SOUP AT THE LANTERN (BRING YOUR OWN BOWL, SPOON AND SOUP)',
  'CONGRATULATIONS TO THE GRAVEDIGGERS’ GUILD: ZERO LATE DAYS USED',
  'THE CLOCKTOWER IS NOT A BEDROOM — signed, everyone who has slept there',
  'MY HEART IS IN THE WORK. MY SOUL IS IN THE QUEUE.',
  'PAINTED WITH BRUSHES, AS IS PROPER',
];

export interface Page {
  title: string;
  lines: string[];
  /** small print under the body */
  foot?: string;
}

/** The Keep's lift: one page per press of E, then it starts over. */
export const LIFT: readonly Page[] = [
  {
    title: 'The Keep’s lift',
    lines: ['A brass call button. Above it, a dial for floors 1 to 9. The arrow points at 8.', 'By all accounts it has pointed at 8 since the bell was cast.'],
    foot: 'E — press the button',
  },
  { title: 'The Keep’s lift', lines: ['You wait.', 'Somewhere far above, the chains consider their options.'], foot: 'E — keep waiting' },
  {
    title: 'The Keep’s lift',
    lines: ['You wait some more. A villager walks up, sighs, and takes the stairs.', 'Their footsteps go up, then down, then — somehow — sideways.'],
    foot: 'E — keep waiting',
  },
  {
    title: 'Ding.',
    lines: ['The doors open. You press 4. The lift rises to 6, stops, and opens onto a small polite sign:', '“THIS LIFT DOES NOT STOP AT 4. PLEASE WALK DOWN TWO FLIGHTS.”'],
    foot: 'E — walk down two flights',
  },
  {
    title: 'Floor 4',
    lines: ['A plaque: “FLOOR 4 · also floor 4 of the house next door · also floor 4 of the one after that.”', 'The covered bridge to the Workshop, however, leaves from floor 7 and arrives on its floor 2. Nobody asks why. Nobody who asked came back.'],
    foot: 'E — head back down',
  },
  {
    title: 'Floor 4, still',
    lines: ['The stairs down are “closed for repairs (since 1971)”. You take the lift.', 'It goes up.'],
    foot: 'The dial returns to 8.',
  },
];

/** The Workshop (the town's engineering hall): a broken laboratory that throws errors. */
export const WORKSHOP: readonly Page[] = [
  {
    title: 'The Workshop',
    lines: ['Inside the door, a bench of brass instruments under a cardboard tag: OUT OF ORDER.', 'The tag is older than the bench.'],
    foot: 'E — try an instrument',
  },
  { title: 'Signal generator', lines: ['You turn the crank. It produces a perfect sine wave.', 'The oscilloscope beside it shows a perfect square wave. Each insists the other is broken.'] },
  { title: 'A brass box with six dials', lines: ['Neatly engraved: “PHASE 1 OF 6. GOOD LUCK.”', 'You turn the first dial. Click. Phase 1 defused!'] },
  {
    title: 'A brass box with six dials',
    lines: ['Phase 2. You turn the second dial with confidence.', 'BOOM. A soot-black pigeon flaps off toward the Keep to report the explosion. (−½ point)'],
  },
  { title: 'The receiver', lines: ['It hums, then prints on a paper tape:', 'ERROR: system is neither causal nor stable. Suggested fix: take the Laplace transform, then take a walk.'] },
  { title: 'The water wheel', lines: ['The wheel samples the river twice per turn.', 'Through the window, the fish appear to swim backwards. Aliasing. Nobody here is surprised.'] },
  {
    title: 'A note on the bench',
    lines: ['“Equipment repaired. — The Guild, 1898.”', 'Pinned beneath it, in a dozen different hands: “No it isn’t.”'],
    foot: 'The tag still says OUT OF ORDER.',
  },
];

/** Mortimer's shelf of increasingly absurd textbooks (prices in grace days). */
export const BOOKS: readonly Page[] = [
  { title: 'Mortimer’s “Improving Literature”', lines: ['A shelf of heavy books, every spine cracked in exactly one place: the night before.'], foot: 'E — take down a book' },
  { title: 'Computer Systems: A Ghost’s Perspective', lines: ['Third edition. The binding has held up beautifully. Its readers, less so.'], foot: 'Price: 2 grace days' },
  { title: 'Principles of Imperative Incantation', lines: ['Every spell opens with a loop invariant. Most of them are wishful thinking.'], foot: 'Price: 1 grace day' },
  { title: 'Functional Witchcraft', lines: ['Chapter 1: “To understand this book, first understand this book.”'], foot: 'Price: 1 grace day (curried)' },
  { title: 'Concepts of Mathematics, Volume II', lines: ['“The proof is left as an exercise.” Volume I was the exercise.'], foot: 'Price: 2 grace days' },
  { title: 'Great Theoretical Ideas in Necromancy', lines: ['251 pages. Every one of them is the hard part.'], foot: 'Price: 3 grace days' },
  { title: 'Signals, Systems & Séances', lines: ['How to Fourier-transform a scream, and why you then hear it at every frequency.'], foot: 'Price: 2 grace days' },
  { title: 'The Cache Grimoire', lines: ['On the flyleaf, a ledger: 4 hits, 213 misses, 1 eviction (the previous owner).'], foot: 'Price: 1 grace day' },
  { title: 'Parallel Cattle Husbandry', lines: ['Two cows, one pasture, no data races. Illustrated.'], foot: 'Price: 1 grace day per cow, both at once' },
  { title: 'The Collected Works of Harry Q. Bovik', lines: ['Every page reads: “Please put your name here.”'], foot: 'Price: free; nobody has ever bought it' },
  { title: 'A Ranking of Villages', lines: ['Annotated in pencil beside Hollowmere: “the Cornell of the top twenty.”', 'Underlined twice. With pride.'], foot: 'Price: 1 grace day' },
  { title: 'Grace Days Remaining', lines: ['A ledger. Every single page reads 0.'], foot: 'Not for sale' },
  { title: 'The end of the shelf', lines: ['One last empty slot, with a small brass label: YOUR THESIS.'], foot: 'E — start over' },
];

/** The noticeboard: three notices a day from this pool. */
export const NOTICES: readonly string[] = [
  'EXAMINATION. The Midwinter Examination is due Friday at 11:59 PM. It will be posted Friday at 11:58 PM. Good luck.',
  'BY ORDER OF THE COUNCIL: sleeping in the Clocktower is forbidden. Sleeping anywhere else is merely unheard of.',
  'LOST: one sense of time. Last seen in the Keep around 3 AM. If found, please do not return it; it only causes trouble.',
  'HOUSING LOTTERY: results are in. Every villager has been assigned the Crypt. The waitlist for the Crypt is now open.',
  'VOTE THE KEEP for Most Beautiful Building! A vote for the Keep is a vote for concrete.',
  'LIFT NOTICE: the Keep’s lift has been repaired.* (*This notice has been pinned here since 1971.)',
  'OFFICE HOURS have moved to the Crypt, midnight to dawn. Bring a candle, a question and patience. Mostly patience.',
  'CARNIVAL: booth building begins Thursday. Booth dismantling begins Thursday, shortly after.',
  'WANTED: five strong pushers and one small, brave driver. Must enjoy hills. — The Sweepstakes Guild',
  'FUN will be held on Saturday from 2:00 to 2:15 PM in the Crypt. Attendance is optional and will be graded.',
  'WEATHER: the sun was sighted over Hollowmere on Tuesday. Villagers are asked to remain calm.',
  'COACH SERVICE: the next coach arrives in two minutes. (Posted three weeks ago.)',
];

export const CRYPT_DAY: Page = {
  title: 'A plaque on the crypt door',
  lines: ['OFFICE HOURS — midnight until dawn.', 'Please read the scroll before asking.'],
};
export const CRYPT_NIGHT: Page = {
  title: 'Office hours are open',
  lines: ['Now serving: #3. Your number: #147.', 'Estimated wait: two eternities.', 'The ghost ahead of you asks whether this is a quick question. It is not.'],
};

// ----------------------------------------------------------------------------- the Engine

export const ENGINE_INTRO =
  'You lift the hatch. Below, on a desk of stacked crates, an ancient calculating engine glows green. A small plush shark watches from the only comfortable chair.';

export const ENGINE_BANNER = ['HOLLOWMERE DIFFERENCE ENGINE · heap laboratory', 'team: "ateam"   member: Harry Q. Bovik', 'due: Friday 11:59 PM   (it is Friday, 11:52 PM)'];

export const ENGINE_COMMANDS: readonly { cmd: string; out: string[] }[] = [
  { cmd: 'make', out: ['cc -Wall -O2 -o mdriver mdriver.c mm.c memlib.c', 'mm.c:213: warning: unused variable ‘sleep’'] },
  {
    cmd: './mdriver -V',
    out: [
      'trace  valid  util    ops',
      '  0     yes    99%   5694',
      '  1     yes    98%   5848',
      '  2     yes    52%   6648',
      '  3     no      -       -   ERROR: payload overlaps another payload',
      'Perf index = 0/100  (a valid heap is a happy heap)',
    ],
  },
  { cmd: 'git commit -m "pls"', out: ['[main 213f00d] pls', ' 1 file changed, 1 insertion(+), 1 deletion(-)', ' (the insertion and the deletion are the same line)'] },
  {
    cmd: './submit',
    out: [
      'Handing in to the Autograder (a brass automaton)…',
      'It awards 99 points for elegance, then silently circles one crumb.',
      'Final score: 34.7 / 100   Submissions left: 0   Grace days left: −1',
    ],
  },
  { cmd: 'sleep 8h', out: ['sleep: not found in this course'] },
];
