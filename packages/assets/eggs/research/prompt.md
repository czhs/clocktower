You are a research assistant for a small hobby game. Use your web browsing / web search tools. Do NOT write code. Work for at most ~35 minutes of browsing, then write the report.

## Context
"Clocktower Town" is a gothic, whimsical pixel-art village where friends (mostly Carnegie Mellon University students) play Blood on the Clocktower. We want to hide 10-20 subtle CMU easter eggs in the village (a CMU student should think "wait, is that Wean Hall?"; outsiders just see a charming fantasy town). We prefer insider jokes, especially CS / ECE humour, over generic campus trolling. We will write ORIGINAL jokes; we only need facts and the flavour of what students find funny. Do not copy article text; summarise in your own words and keep any quote under 15 words.

## Tasks (in this order, keep each bounded)

1. **CMU CS course mascots.** Several CMU computer science courses reportedly have mascots, each with an Instagram account (not widely publicised). Find out which courses have mascots, what each mascot is (animal/object, name, colours, distinguishing features), and the Instagram handle. Courses to check include (not limited to): 15-112, 15-122, 15-150, 15-151, 15-210, 15-213 (Introduction to Computer Systems), 15-251, 15-259, 15-281, 15-312, 15-317, 15-410, 15-411, 15-445, 18-213/18-240/18-290/18-341/18-349 (ECE), 21-127. Instagram may require a login: try direct profile URLs anyway, plus public mirrors / viewers, Google/Bing results, Reddit (r/cmu, r/cmucs), course websites and syllabi, Piazza/Ed public posts, CMU news, ScottyLabs, The Tartan, and the course staff pages. For EVERY claim record the source URL and whether you **verified** it (saw it on an official course page or the account itself), **partially verified** (secondary source such as a Reddit comment), or **unverified** (only guessed / nothing found). Never invent a mascot; "not found" is a valid and useful answer.

2. **r/cmu running jokes** (https://www.reddit.com/r/cmu/ — try old.reddit.com and search within the subreddit if the main site blocks you): recurring memes and inside jokes. Look especially for: Wean Hall (its brutalist look, confusing floors, slow/inefficient elevators, floor numbering that does not line up with neighbouring buildings - find out exactly which floors of which buildings connect, e.g. Wean/Doherty/Gates/Hamerschlag/Scott Hall/Newell-Simon), "CMU is the Cornell of the top 20s"-type self-deprecation, sleep deprivation / "my life is a 15-213 lab", 15-213 labs (Data Lab, Bomb Lab, Attack Lab, Cache Lab, Malloc Lab, Shell Lab, Proxy Lab), Autolab / autograder scores, office-hours queues (OHQueue), 18-290 Signals and Systems, ECE labs with broken equipment, the Fence (painting tradition, guarding it overnight), Buggy / Sweepstakes, Carnival booths, Scotty the Scottish terrier, tartan, the Randy Pausch bridge lights, "Walking to the Sky" statue, Hamerschlag Hall, Gates Hillman helix, the Cut, Doherty, Kiltie band, bagpipes, "my heart is in the work", Pittsburgh weather/grey skies, the Tartan Shuttle, dining jokes, "CMU fun" being an oxymoron. Collect ~20 concrete threads with URLs.

3. **CMU readme** (https://cmureadme.com/ and the archive https://cmureadme.com/issues). Start from: "Vote Wean Hall!", the inefficient Wean elevators, the O-Week Crime Report, and Buggy satire pieces; then skim 2-3 recent issues. For each piece: URL, a one-line summary of the joke in your own words, and why it lands with CMU students.

4. **Physical facts** needed for faithful-but-original pixel art reinterpretations: what the Fence looks like (location, how thick the paint is, painting rules/traditions), the Randy Pausch Memorial Bridge (colours/lights, where it connects), Walking to the Sky (what it depicts, when installed/removed/moved), Hamerschlag Hall (the cylindrical tower + its look), Wean Hall (concrete, the 'robot' or 'brutalist' look), the Buggy (shape, how many wheels, who pushes, the hill route), Scotty dog mascot, the Kiltie band, the CMU tartan colours. Also any well-known, kind, tasteful CMU personalities that students affectionately joke about (e.g. famous lecturers' catchphrases or traditions) - note only harmless, affectionate things.

## Output
Write a single Markdown file `research.md` in the current working directory with these sections:
- `## Mascots` - a table: course | mascot | handle | description | source URL(s) | verification level. Then a short list of what you could NOT verify and why (login wall, no results, etc.).
- `## Reddit` - list of ~20 items: URL | joke/meme in your own words | how popular/recurring.
- `## readme` - list of pieces: URL | own-words summary.
- `## Facts` - bullet facts with URLs.
- `## Ideas` - 25+ raw easter-egg ideas for a gothic pixel village inspired by the above (one line each), marking which are CS/ECE.
- `## Log` - which sites blocked you, which searches you ran.

When done, print the absolute path of research.md.
