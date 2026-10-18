// Demo character roster generator (owner: demo characters; docs/DEMO.md §4.2). Re-runnable while the character session
// keeps adding / finishing cast members:
//   tools/remote.sh node tools/demo-roster.mjs [--check] [--include a,b] [--exclude c]          static pass (node only)
//   tools/remote.sh node tools/demo-roster.mjs --browser [--shots shots/v3-roster] [--tag noon]  + live verification
// Writes src/demo/roster.json (pull it back: rsync render-host:pixel3d/src/demo/roster.json), which src/demo/roster.js reads.
//
// Manifest v3 (2026-10-16: the PUBLIC demo offers only FINISHED characters; ?wip=1 adds the work in progress).
// EVERY characters/<id>.js is a row (mannequin, opal-style partial files and _-prefixed files aside):
//   finished (status 'shipped', `finishedBy` = the evidence) when ANY of
//     (a) docs/CHARACTER_STATUS.md lists it as shipped / complete: the "Shipped characters:" line (ids before the first
//         '.'), a "Complete characters:" / "Finished cast:" line of the same shape, or a table row `| <id> | … shipped|complete … |`;
//     (b) characters/<id>.md records a FINAL independent critic verdict that ships: of the critic-attributed records in
//         the sheet ("critic … N/24", "critic-<id>-rK scored N/24", "critic … verdict: ship"; self-scores never count)
//         the latest (highest round, then last in the file) says ship or scores >= the ship bar parsed from
//         docs/CHARACTER_PLAYBOOK.md ("Ship bar ≥ 19/24, no zeros on 1–3 or 7") and reports no blocking zero / no
//         "not shipped";
//     (c) its id is in the user allow-list src/demo/roster-allow.json ({ "allow": [ids] }; missing file = empty);
//     (d) --include a,b (one-off, this run only).
//   else status 'wip'. `critic` (informational) = the latest critic score found in docs/CHARACTER_LEARNINGS.md.
//   playable = characters/<id>.js imports in node and looks like a spec (name, skeleton, parts[]) AND it is not known
//           to fail the live check: --browser loads the demo with ?roster=all, where characters.js builds every
//           character, poses it (idle) and drives it forward (the gait must walk), renders its portrait; the result is
//           stored as `verified` (keyed by the spec file's mtime, carried over by later static runs until it changes).
//   offered (= complete, what the PUBLIC switcher shows) = finished AND playable.
//   wipOffered (what demo.html?wip=1 adds) = playable AND not finished.
//   order   finished first (CHARACTER_STATUS order), then work in progress by name, then the unplayable ones.
// --browser then (pass 2) swaps the player through every offered character in the PUBLIC page (idle + walk + side-view
// shots, swap timing, exactly one player model of the right spec in the scene), checks that the public page offers no
// WIP character and that ?char=<wip id> falls back to a finished one, (pass 3) that ?wip=1 offers the finished + WIP
// set, writes the portraits (thumbs/<id>.png + thumbs.png sheet) and a lineup of the offered characters on the square.
// Exit 1 on any console / page / shader error or failed check.
// Never imported by the page; node only (three resolves from ./node_modules). --check: exit 1 if a finished character
// fails to load.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
const INCLUDE = new Set(list(opt('include', '')));
const EXCLUDE = new Set(['mannequin', ...list(opt('exclude', ''))]);
const OUT = path.join(ROOT, opt('out', 'src/demo/roster.json'));
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; } };
const mtime = (p) => { try { return fs.statSync(path.join(ROOT, p)).mtimeMs; } catch { return 0; } };
/** The same fingerprint as src/demo/characters.js sourcePrint (FNV-1a over the UTF-16 code units, '.' + length). */
const srcPrint = (text) => { if (!text) return null; let h = 2166136261 >>> 0; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return `${h.toString(36)}.${text.length}`; };
const prevManifest = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return null; } })();
const prevRow = (id) => prevManifest?.characters?.find?.((c) => c.id === id) ?? null;

// ids the user asked to skip (pipeline/skip.txt, one per line, # comments) never reach the demo, public or ?wip=1
const SKIP = new Set((fs.existsSync(path.join(ROOT, 'pipeline/skip.txt')) ? fs.readFileSync(path.join(ROOT, 'pipeline/skip.txt'), 'utf8') : '')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
const ids = fs.readdirSync(path.join(ROOT, 'characters'))
  .filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => f.slice(0, -3)).filter((id) => !EXCLUDE.has(id) && !SKIP.has(id)).sort();
const idRe = (id) => new RegExp(`(^|[^\\w-])\`?${id.replace(/[-]/g, '\\-')}\`?(?![\\w-])`, 'i');

// ---- (1a) docs/CHARACTER_STATUS.md
const status = read('docs/CHARACTER_STATUS.md');
const statusIds = new Map();   // id -> how
for (const line of status.split('\n')) {
  const m = line.match(/(shipped|complete|completed|finished)\s+(characters|cast(?: members)?)\s*\**\s*:\**\s*(.*)$/i);
  if (m) {
    const head = m[3].split(/\.(\s|$)/)[0];   // "wanderer, keeper, hound, duelist. Latest packs: ..." -> ids before the '.'
    const hit = ids.map((id) => [id, head.search(idRe(id))]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
    for (const [id] of hit) statusIds.set(id, `CHARACTER_STATUS: ${m[1]} ${m[2]}`);   // in the doc's order
  }
  if (/^\s*\|/.test(line) && /\b(shipped|complete|ship)\b/i.test(line)) {
    const cells = line.split('|').map((c) => c.trim().replace(/`/g, ''));
    for (const id of ids) if (cells.includes(id)) statusIds.set(id, 'CHARACTER_STATUS table');
  }
}

// ---- (1b) the FINAL independent critic verdict recorded in characters/<id>.md
const playbook = read('docs/CHARACTER_PLAYBOOK.md');
const barM = playbook.match(/Ship bar\s*(?:≥|>=)\s*(\d+)\s*\/\s*(\d+)(?:,\s*no zeros on ([^.\n]+))?/i);
const BAR = { min: barM ? +barM[1] : 19, of: barM ? +barM[2] : 24, zeros: barM?.[3]?.trim() ?? '1–3 or 7', src: barM ? 'docs/CHARACTER_PLAYBOOK.md' : 'default' };
const NEG = /(iterate|revise|reject|redo|fail|hold|not shipped|no ship)/i;
function criticVerdict(id) {
  const md = `characters/${id}.md`, recs = [];
  read(md).split('\n').forEach((line, i) => {
    // critic-attributed scores: "critic 16/24", "critic-hound-r1 scored 15/24", "critic r2: 20/24", "(critic-x, 16/24)"
    for (const m of line.matchAll(new RegExp(`\\bcritic(-[\\w-]+)?((?:[^\\d\\n|]|r\\d+){0,14}?)(\\d{1,2})\\s*\\/\\s*${BAR.of}\\b`, 'gi'))) {
      if (/self/i.test(m[2])) continue;
      const r = (m[1] ?? '').match(/-r(\d+)/) ?? m[2].match(/\br(\d+)\b/);
      const tail = line.slice(m.index + m[0].length, m.index + m[0].length + 60);
      const v = tail.match(/^\W{0,6}(?:—|-|,)?\s*(ship(?:ped)?|not shipped)\b/i)?.[1]?.toLowerCase() ?? null;
      recs.push({ score: +m[3], verdict: v, round: r ? +r[1] : 0, line: i + 1, text: line.trim().slice(0, 140) });
    }
    // explicit verdict lines: "Critic verdict: ship", "critic r3 verdict — iterate"
    const e = line.match(/\bcritic\b[^|\n]{0,40}?\bverdict\b\W{0,6}(ship|iterate|revise|reject|redo|fail|hold)\b/i);
    if (e) { const r = line.match(/critic[\w-]*-r(\d+)|critic\s+r(\d+)/i); recs.push({ score: null, verdict: e[1].toLowerCase(), round: r ? +(r[1] ?? r[2]) : 0, line: i + 1, text: line.trim().slice(0, 140) }); }
  });
  if (!recs.length) return null;
  const last = recs.sort((x, y) => (x.round - y.round) || (x.line - y.line))[recs.length - 1];
  const zero = /\bzeros?\b/i.test(last.text) && !/\bno zeros?\b/i.test(last.text);
  const ships = !zero && !NEG.test(last.verdict ?? '') && !/not shipped/i.test(last.text)
    && (last.verdict === 'ship' || last.verdict === 'shipped' || (last.score != null && last.score >= BAR.min));
  return { ...last, ships, zero, src: `${md}:${last.line}` };
}
// ---- (1c) the user allow-list
const ALLOW_FILE = 'src/demo/roster-allow.json';
const ALLOW = (() => {
  const t = read(ALLOW_FILE);
  if (!t) return new Set();
  try { const j = JSON.parse(t); return new Set((Array.isArray(j) ? j : j.allow ?? []).filter((x) => typeof x === 'string')); } catch (e) {
    console.error(`${ALLOW_FILE}: not valid JSON (${e.message}) - treated as empty`); return new Set();
  }
})();
// ---- informational: the latest critic score in docs/CHARACTER_LEARNINGS.md (append-only: the last mention wins)
const learn = read('docs/CHARACTER_LEARNINGS.md').split('\n');
function learningsCritic(id) {
  let best = null;
  const esc = id.replace(/-/g, '\\-');
  learn.forEach((line, i) => {
    let m;
    if (/^#+ .*critic note/i.test(line) && new RegExp(`critic-${esc}\\b(?!-)|critic note — ${esc} \\(`, 'i').test(line) && (m = line.match(new RegExp(`(\\d{1,2})\\s*\\/\\s*${BAR.of}`)))) {
      best = { score: +m[1], shipped: !/not shipped/i.test(line), src: `docs/CHARACTER_LEARNINGS.md:${i + 1}` };
    } else if (/^\|/.test(line) && new RegExp(`^\\|\\s*${esc}\\s*(\\(|\\|)`).test(line)) {
      const cells = line.split('|').map((c) => c.trim()).slice(1);
      const nums = cells.slice(2, 4).filter((c) => /^\d{1,2}$/.test(c));
      if (nums.length) best = { score: +nums[nums.length - 1], shipped: /\byes\b/i.test(cells[4] ?? ''), src: `docs/CHARACTER_LEARNINGS.md:${i + 1}` };
    }
  });
  return best;
}

// ---- design sheet: display name + blurb
function sheetInfo(id) {
  const md = read(`characters/${id}.md`);
  const h = md.match(/^#\s+(.+)$/m)?.[1] ?? '';
  let name = h.replace(/\s*\(.*$/, '').replace(/\s+[—-]\s+.*$/, '').trim();
  if (!name || /design sheet/i.test(name)) name = id.replace(/(^|-)(\w)/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase());
  const blurb = md.match(/^"([^"\n]{4,160})"/m)?.[1] ?? null;
  return { name, blurb };
}

// ---- (2) load check
async function loadCheck(id) {
  const t0 = performance.now();
  try {
    const mod = await import(pathToFileURL(path.join(ROOT, 'characters', `${id}.js`)).href + `?v=${mtime(`characters/${id}.js`)}`);
    const s = mod.default;
    if (!s || typeof s !== 'object') throw new Error('no default export spec');
    if (!s.skeleton) throw new Error('spec has no skeleton');
    if (!Array.isArray(s.parts) || !s.parts.length) throw new Error('spec has no parts');
    const loco = s.locomotion ?? {};
    const game = s.gameSpeed?.v ?? s.game?.speed ?? null;
    return {
      ok: true, ms: Math.round(performance.now() - t0),
      meta: {
        bodyPlan: s.bodyPlan ?? (s.skeleton?.meta?.plan || null) ?? null, height: +(s.height ?? 1.4).toFixed(3),
        walkSpeed: +(loco.walkSpeed ?? 1.4).toFixed(3), runSpeed: +(loco.runSpeed ?? 3.4).toFixed(3),
        gameSpeed: game == null ? null : +game.toFixed(3), plan: loco.plan ?? null,
        clips: Object.keys(s.clips ?? {}), emote: s.emote ?? null, smears: !!s.smears, fx: !!s.fx,
      },
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).split('\n')[0].slice(0, 200) };
  }
}

const out = [];
let bad = 0;
for (const id of ids) {
  const st = statusIds.get(id) ?? null;
  const v = criticVerdict(id);
  const lc = learningsCritic(id);
  const by = INCLUDE.has(id) ? '--include'
    : st ? st
    : v?.ships ? `final critic verdict ships (${v.score != null ? `${v.score}/${BAR.of}, ` : ''}${v.src})`
    : ALLOW.has(id) ? `user allow-list (${ALLOW_FILE})` : null;
  const load = await loadCheck(id);
  const { name, blurb } = sheetInfo(id);
  const status = by ? 'shipped' : 'wip';
  const fileT = Math.round(mtime(`characters/${id}.js`));
  const pv = prevRow(id)?.verified;
  const verified = pv && pv.mtime === fileT ? pv : null;   // a live check of THIS version of the file
  const playable = load.ok && !(verified && !verified.ok);
  const offered = playable && !!by;
  const wipOffered = playable && !by;
  const notFinished = v ? `latest critic record ${v.score != null ? `${v.score}/${BAR.of}` : `'${v.verdict}'`} < bar ${BAR.min} or not ship (${v.src})`
    : 'no critic verdict in its sheet';
  let reason;
  if (!load.ok) { reason = `does not load: ${load.error}`; if (by) bad++; }
  else if (!playable) { reason = `failed the live check: ${verified.error}`; if (by) bad++; }
  else reason = by ? `finished (${by})` : `work in progress, ?wip=1 only (not in CHARACTER_STATUS shipped; ${notFinished}; not allow-listed)`;
  out.push({ id, name, status, shipped: status === 'shipped', finished: !!by, finishedBy: by, loads: load.ok, playable, offered, complete: offered, wipOffered, reason, blurb, ...(load.meta ?? {}),
    verdict: v ? { score: v.score, verdict: v.verdict, round: v.round, ships: v.ships, src: v.src } : null,
    critic: lc, mtime: fileT, verified });
}
const order = [...statusIds.keys()];
const sortRows = () => out.sort((a, b) => (b.playable - a.playable) || (b.shipped - a.shipped)
  || ((order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99)) || a.name.localeCompare(b.name));
sortRows();
let current = null;   // the manifest as last written (the browser check serves THIS, see openPage)
const writeManifest = () => {
  const manifest = current = {
    version: 3,
    generated: new Date().toISOString(),
    generator: 'tools/demo-roster.mjs',
    rule: `offered (public) = finished AND playable; wipOffered (demo.html?wip=1 adds them) = playable AND not finished. finished = shipped in docs/CHARACTER_STATUS.md OR the final independent critic verdict in characters/<id>.md ships (>= ${BAR.min}/${BAR.of}, no zeros on ${BAR.zeros}; ${BAR.src}) OR in ${ALLOW_FILE}. playable = characters/<id>.js loads AND it passed (or has not yet failed) the live idle + walk check`,
    shipBar: BAR,
    allow: [...ALLOW],
    complete: out.filter((c) => c.offered).map((c) => c.id),
    shipped: out.filter((c) => c.offered).map((c) => c.id),
    wip: out.filter((c) => c.wipOffered).map((c) => c.id),
    characters: out,
  };
  fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
};
const manifest = writeManifest();
console.log(`wrote ${path.relative(ROOT, OUT)}: ${manifest.complete.length} finished offered publicly, ${manifest.wip.length} WIP (?wip=1), of ${out.length}; ship bar ${BAR.min}/${BAR.of} (${BAR.src}); allow-list [${[...ALLOW]}]`);
for (const c of out) console.log(`  ${c.offered ? '+' : c.wipOffered ? '~' : '-'} ${c.status.padEnd(7)} ${c.id.padEnd(14)} ${c.name.padEnd(20)} ${c.reason}${c.critic ? ` [learnings critic ${c.critic.score}/${BAR.of}${c.critic.shipped ? ' ship' : ''} ${c.critic.src}]` : ''}`);
if (args.includes('--check') && bad) { console.error(`${bad} finished character(s) fail to load`); process.exit(1); }
if (!args.includes('--browser')) process.exit(0);

// ================================================================================================ --browser live check
// Loads demo.html in REAL TIME (headless Chromium on the 4090, repo served by request interception):
//   pass 1 (?roster=all&npcs=0): characters.js exercises every character that imports (idle pose + driven walk) and
//          renders its portrait -> `verified` per row in roster.json, thumbs/<id>.png, thumbs.png (sheet, 4x).
//   pass 2 (the regenerated roster, NPCs on): swap the player through every offered character: swap time + worst frame,
//          idle shot, walk shot (W, away from the camera), side shot (D), clip / mode while moving and after release,
//          exactly one player model in the scene and it is THAT character's rig (spec, bone count), programs, fps;
//          a missing id keeps the current character; the lineup of every offered character on the square (scale).
const { chromium } = await import('playwright');
const SHOTS = opt('shots', 'shots/v3-roster');
const TAG = opt('tag', 'noon');
const Q = opt('q', '');
const ZOOM = Number(opt('zoom', '7.5'));
fs.mkdirSync(path.join(ROOT, SHOTS, 'thumbs'), { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const SHADER_RX = /WebGLProgram|Shader Error|shader error|program not valid|VALIDATE_STATUS|could not compile/i;
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=vulkan', '--enable-unsafe-swiftshader'] });
const errs = [], warns = [], fails = [], notes = [];
async function openPage(q) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    const line = `[${m.type()}] ${m.text()}`;
    if (m.type() === 'error' || SHADER_RX.test(m.text())) errs.push(line);
    else if (m.type() === 'warning') { warns.push(line); if (/\[demo\] character '.*' skipped/.test(m.text())) notes.push(m.text()); }
  });
  page.on('pageerror', (e) => errs.push(`[pageerror] ${e.stack || e.message}`));
  await page.route('http://pixel3d.local/**', (route) => {
    const u = new URL(route.request().url());
    // roster.json from memory: other sessions' tools/remote.sh rsyncs push the Mac tree to render-host at any time and
    // overwrite the file just written here (seen 2026-10-16)
    if (path.join(ROOT, decodeURIComponent(u.pathname)) === OUT) return route.fulfill({ status: 200, body: JSON.stringify(current), headers: { 'content-type': 'application/json' } });
    const p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
  });
  const t0 = Date.now();
  await page.goto(`http://pixel3d.local/demo.html?${q}`);
  await page.waitForFunction(() => window.__demo && (window.__demo.ready || window.__demo.errors.length), null, { timeout: 120000 });
  const demoErrs = await page.evaluate(() => window.__demo.errors.slice());
  errs.push(...demoErrs.map((e) => `[__demo] ${e}`));
  return { page, readyMs: Date.now() - t0 };
}
const report = { tag: TAG, q: Q, steps: [] };
let page = null;
try {
  // ---------------------------------------------------------------- pass 1: exercise + portraits of everything that imports
  const p1 = await openPage(`roster=all&npcs=0&ui=0&rosterCache=0&${Q}`);   // a real check (no cached / manifest results)
  const rows = await p1.page.evaluate(() => window.__demo.demo.characters.map((c) => ({ id: c.id, complete: c.complete, error: c.error ?? null, check: c.check ?? null, thumb: c.thumb ?? null, status: c.status, name: c.name })));
  report.pass1 = { readyMs: p1.readyMs, rosterMs: await p1.page.evaluate(() => window.__demo.demo.engine.stats.demoRosterMs ?? null) };
  console.log(`pass 1 ready after ${p1.readyMs} ms (roster exercise + portraits ${report.pass1.rosterMs} ms)`);
  for (const r of rows) {
    const row = out.find((c) => c.id === r.id);
    if (!row) continue;
    if (!row.loads) { console.log(`  ${r.id}: not loadable in node, browser says ${r.complete ? 'ok' : r.error}`); continue; }
    // (perf) src = the page's fingerprint of characters/<id>.js (characters.js sourcePrint: FNV-1a of the text, '.' length)
    // + the portrait: a page whose copy of the file has the same fingerprint uses them instead of re-running the check
    row.verified = { ok: !!r.complete, mtime: row.mtime, at: new Date().toISOString(), ...(r.check ?? {}), ...(r.error ? { error: r.error } : {}),
      src: srcPrint(read(`characters/${r.id}.js`)), ...(r.complete && r.thumb ? { thumb: r.thumb } : {}) };
    row.playable = !!r.complete;
    row.offered = row.complete = row.playable && row.finished;
    row.wipOffered = row.playable && !row.finished;
    if (!r.complete) { row.reason = `failed the live check: ${r.error}`; if (row.finished) fails.push(`${r.id}: finished but fails the live check: ${r.error}`); }
    else if (/^failed the live check/.test(row.reason)) row.reason = row.finished ? `finished (${row.finishedBy})` : 'work in progress, ?wip=1 only';
    if (r.thumb) fs.writeFileSync(path.join(ROOT, SHOTS, 'thumbs', `${r.id}.png`), Buffer.from(r.thumb.split(',')[1], 'base64'));
    console.log(`  ${r.complete ? '+' : '-'} ${r.id.padEnd(14)} ${JSON.stringify(r.check ?? r.error)}`);
  }
  // portrait sheet (4x, nearest) in rows of 7 with names
  const sheet = await p1.page.evaluate((rows) => new Promise((res) => {
    const ok = rows.filter((r) => r.thumb), W = 7, cell = 24 * 4, lab = 28, cv = document.createElement('canvas');
    cv.width = W * (cell + 8) + 8; cv.height = Math.ceil(ok.length / W) * (cell + lab + 8) + 8;
    const g = cv.getContext('2d'); g.fillStyle = '#1b1f2c'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
    let n = 0;
    const next = () => {
      if (n >= ok.length) return res(cv.toDataURL('image/png'));
      const r = ok[n], x = 8 + (n % W) * (cell + 8), y = 8 + Math.floor(n / W) * (cell + lab + 8), im = new Image();
      im.onload = () => {
        g.fillStyle = '#2c3244'; g.fillRect(x, y, cell, cell); g.drawImage(im, x, y, cell, cell);
        g.fillStyle = r.status === 'shipped' ? '#e8d7a8' : '#9aa0b4'; g.font = '11px serif';
        g.fillText(r.name.slice(0, 17), x, y + cell + 12); g.fillText(`${r.id} · ${r.status}`, x, y + cell + 24);
        n++; next();
      };
      im.src = r.thumb;
    };
    next();
  }), rows);
  fs.writeFileSync(path.join(ROOT, SHOTS, `${TAG}-thumbs.png`), Buffer.from(sheet.split(',')[1], 'base64'));
  report.steps.push({ step: 'pass1', rows: rows.map(({ thumb, ...r }) => r) });
  await p1.page.close();
  sortRows();
  const m2 = writeManifest();
  fs.writeFileSync(path.join(ROOT, SHOTS, 'roster.json'), JSON.stringify(m2, null, 2) + '\n');   // a copy no rsync clobbers
  console.log(`rewrote ${path.relative(ROOT, OUT)}: ${m2.complete.length} finished offered publicly: ${m2.complete.join(', ')}; ${m2.wip.length} WIP behind ?wip=1`);

  // ---------------------------------------------------------------- pass 2: live swaps in the town
  const p2 = await openPage(Q);
  page = p2.page;
  report.readyMs = p2.readyMs;
  console.log('pass 2 ready after', p2.readyMs, 'ms');
  const shot = async (name) => { const f = path.join(SHOTS, `${TAG}-${name}.png`); await page.screenshot({ path: path.join(ROOT, f) }); return f; };
  const probeState = () => page.evaluate(() => {
    const d = window.__demo.demo, h = d.player?.handle;
    const roots = d.engine.scene.children.filter((o) => /^character:/.test(o.name)).map((o) => o.name.slice(10));
    const st = h?.ch?.state ?? {};
    const mesh = h?.root?.getObjectByProperty?.('isSkinnedMesh', true);
    return {
      id: h?.id ?? null, clip: st.clip, mode: st.mode, run: st.run, speed: +(st.speed ?? 0).toFixed(2), facing: st.facing,
      clock: h ? +h.clock.toFixed(2) : null, roots, npcs: d.npcs?.list ?? null,
      // the player's model really is this character: its root name, spec and rig bone count
      model: h ? { root: h.root.name, spec: h.spec?.name ?? null, bones: mesh?.skeleton?.bones?.length ?? null, specBones: h.spec?.skeleton?.length ?? null,
        lastBone: mesh?.skeleton?.bones?.at(-1)?.name ?? null, inScene: h.root.parent === d.engine.scene } : null,
      pos: d.player ? [+d.player.position.x.toFixed(2), +d.player.position.z.toFixed(2)] : null,
      root: h ? [+h.root.position.x.toFixed(2), +h.root.position.y.toFixed(3), +h.root.position.z.toFixed(2)] : null,
      programs: d.engine.renderer.info.programs?.length ?? null, fps: window.__demo.info?.().fps ?? null,
      characters: d.characters.map((c) => `${c.id}${c.complete ? '' : '(-)'}`).join(' '),
    };
  });
  await page.evaluate((z) => window.__demo.demo.store.set({ zoom: z }, 'test'), ZOOM);
  await page.waitForTimeout(2500);
  let s = await probeState();
  console.log('boot', JSON.stringify(s));
  report.steps.push({ step: 'boot', ...s, shot: await shot('boot') });
  const ids = await page.evaluate(() => window.__demo.demo.characters.filter((c) => c.complete).map((c) => c.id));
  const want = out.filter((c) => c.offered).map((c) => c.id);
  if (ids.join() !== want.join()) fails.push(`switcher offers [${ids}] but the manifest offers [${want}]`);
  const leak = ids.filter((id) => !out.find((c) => c.id === id)?.finished);
  if (leak.length) fails.push(`the PUBLIC switcher offers work in progress: [${leak}]`);
  const panel = await page.evaluate(() => ({ buttons: document.querySelectorAll('.dui-char').length, wip: document.querySelectorAll('.dui-char[data-status="wip"]').length }));
  console.log(`public switcher: [${ids.join(', ')}]; panel buttons ${panel.buttons}, WIP-styled ${panel.wip}`);
  if (panel.wip) fails.push(`the public panel shows ${panel.wip} WIP-styled character buttons`);
  report.steps.push({ step: 'public-offer', ids, panel });
  const bootPrograms = s.programs;
  for (const id of [...ids.filter((x) => x !== s.id), s.id]) {
    await page.evaluate(() => { const d = window.__demo.demo; d.player?.teleport?.(22.5, 27.1, 0); });
    await page.waitForTimeout(400);
    const before = await probeState();
    const [ms, hitch] = await page.evaluate(async (id) => {
      const d = window.__demo.demo, t = performance.now();
      let worst = 0, last = performance.now(), on = true;
      const tick = () => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; if (on) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      await new Promise((res) => {
        const off = d.events.on('player:character', (e) => { if (e.id === id) { off(); res(); } });
        d.store.set({ character: id }, 'test');
        setTimeout(res, 15000);
      });
      const ms = Math.round(performance.now() - t);
      await new Promise((r) => setTimeout(r, 1500));
      on = false;
      return [ms, Math.round(worst)];
    }, id);
    const idle = await probeState();
    const fIdle = await shot(`${id}-idle`);
    await page.keyboard.down('w');
    await page.waitForTimeout(350);
    const walk = await probeState();
    const fWalk = await shot(`${id}-walk`);
    await page.waitForTimeout(150);
    await page.keyboard.up('w');
    await page.keyboard.down('d');
    await page.waitForTimeout(400);
    const walk2 = await probeState();
    const fSide = await shot(`${id}-side`);
    await page.keyboard.up('d');
    await page.waitForTimeout(1500);
    const after = await probeState();
    const npcN = (after.npcs ?? []).length;
    const okRoots = after.roots.filter((r) => r === id).length >= 1 && after.roots.length === 1 + npcN;
    const step = { step: id, swapMs: ms, hitchMs: hitch, idle: idle.clip + '/' + idle.mode, walk: walk.clip + '/' + walk.mode + (walk.run ? '/run' : '') + ` v${walk.speed}`,
      walk2: walk2.clip + '/' + walk2.mode + ` v${walk2.speed}`, after: after.clip + '/' + after.mode, moved: [before.pos, walk2.pos],
      model: idle.model, roots: after.roots, programs: [before.programs, after.programs], fps: after.fps, root: walk.root, shots: [fIdle, fWalk, fSide] };
    console.log(JSON.stringify(step));
    report.steps.push(step);
    if (idle.id !== id) fails.push(`${id}: swap did not happen (player handle ${idle.id})`);
    const md = idle.model;
    if (!md || md.root !== `character:${id}` || !md.inScene || (md.bones !== md.specBones && !(md.bones === md.specBones + 1 && md.lastBone === "ghostHalo"))) fails.push(`${id}: player model is not this character's rig ${JSON.stringify(md)}`);
    if (!okRoots) fails.push(`${id}: character roots in the scene ${JSON.stringify(after.roots)} (want 1 player + ${npcN} NPCs)`);
    if (walk.mode === 'idle' && walk.speed < 0.05) fails.push(`${id}: not walking while W is held (${step.walk})`);
    if (walk2.mode === 'idle' && walk2.speed < 0.05) fails.push(`${id}: not walking while D is held (${step.walk2})`);
    if (after.speed > 0.05) fails.push(`${id}: still moving after release (${step.after})`);
    if (after.programs > bootPrograms + Number(opt('programs', '3'))) fails.push(`${id}: programs ${bootPrograms} at boot -> ${after.programs}`);
    if (hitch > 100) fails.push(`${id}: ${hitch} ms frame after the swap`);
    if (ms > 1500) fails.push(`${id}: swap took ${ms} ms`);
  }
  // a broken id must be rejected without losing the current character
  const cur = (await probeState()).id;
  await page.evaluate(() => window.__demo.demo.store.set({ character: 'zz-missing' }, 'test'));
  await page.waitForTimeout(1500);
  const bad = await probeState();
  console.log('bad id ->', JSON.stringify({ id: bad.id, roots: bad.roots, state: await page.evaluate(() => window.__demo.demo.store.state.character) }));
  if (bad.id !== cur) fails.push(`bad id: player handle ${bad.id}, want ${cur}`);
  report.steps.push({ step: 'bad-id', id: bad.id, roots: bad.roots });
  // lineup: every offered character in a row on the square's north arc, facing the camera (relative scale)
  const line = await page.evaluate(async (ids) => {
    const d = window.__demo.demo, { createCharacter } = await import('/src/demo/characters.js');
    // two rows across the circle (shipped first, front row = the second half), 0.9 m apart
    const C = d.layout.CIRCLE, made = [], gap = 0.9, per = Math.ceil(ids.length / 2);
    d.npcs?.dispose?.();
    d.player?.teleport?.(C.cx, C.cz - 4, 0);
    for (let i = 0; i < ids.length; i++) {
      const row = Math.floor(i / per), k = i % per, cnt = row ? ids.length - per : per;
      const p = new (d.engine.scene.position.constructor)(C.cx + (k - (cnt - 1) / 2) * gap, 0, C.cz + 3 + row * 1.5);
      const h = await createCharacter(d.engine, ids[i], { position: p, face: 0 });
      h.ch.drive(() => ({ pos: p, face: 0 }));
      d.engine.scene.add(h.root); made.push(h);
    }
    d.engine.onUpdate((t) => { for (const h of made) h.update(t); });
    d.store.set({ zoom: 12, cutaway: 'on' }, 'test');
    return made.map((h) => [h.id, +h.height.toFixed(2)]);
  }, ids);
  await page.waitForTimeout(1800);
  report.steps.push({ step: 'lineup', heights: line, shot: await shot('lineup') });
  console.log('lineup', JSON.stringify(line));
  await page.close(); page = null;

  // ---------------------------------------------------------------- pass 3: ?char=<wip> falls back publicly; ?wip=1 offers the WIP
  const wipIds = out.filter((c) => c.wipOffered).map((c) => c.id);
  if (wipIds.length) {
    const p3 = await openPage(`char=${wipIds[0]}&npcs=0&${Q}`);
    await p3.page.waitForTimeout(1500);
    const deep = await p3.page.evaluate(() => ({ id: window.__demo.demo.player?.handle?.id ?? null, state: window.__demo.demo.store.state.character,
      offered: window.__demo.demo.characters.filter((c) => c.complete).map((c) => c.id) }));
    console.log(`public ?char=${wipIds[0]} ->`, JSON.stringify(deep));
    if (!want.includes(deep.id)) fails.push(`public ?char=${wipIds[0]} loaded '${deep.id}' (want a finished character)`);
    report.steps.push({ step: 'public-char-wip', ask: wipIds[0], ...deep });
    await p3.page.close();
  }
  const p4 = await openPage(`wip=1&npcs=0&${Q}`);
  await p4.page.evaluate((z) => window.__demo.demo.store.set({ zoom: z }, 'test'), ZOOM);
  await p4.page.waitForTimeout(1500);
  const wv = await p4.page.evaluate(() => ({ offered: window.__demo.demo.characters.filter((c) => c.complete).map((c) => `${c.id}:${c.status}`),
    buttons: document.querySelectorAll('.dui-char').length, wip: document.querySelectorAll('.dui-char[data-status="wip"]').length,
    groups: [...document.querySelectorAll('.dui-char-grp')].map((g) => g.textContent) }));
  const wvIds = wv.offered.map((x) => x.split(':')[0]);
  const wantAll = [...want, ...wipIds];
  console.log(`?wip=1 switcher: ${wv.offered.length} (${wv.wip} WIP-styled) groups ${JSON.stringify(wv.groups)}`);
  if ([...wvIds].sort().join() !== [...wantAll].sort().join()) fails.push(`?wip=1 offers [${wvIds}] but want [${wantAll}]`);
  if (wv.wip !== wipIds.length) fails.push(`?wip=1 panel: ${wv.wip} WIP-styled buttons, want ${wipIds.length}`);
  report.steps.push({ step: 'wip-mode', ...wv, shot: await (async () => { const f = path.join(SHOTS, `${TAG}-wip-panel.png`); await p4.page.screenshot({ path: path.join(ROOT, f) }); return f; })() });
  await p4.page.close();
} catch (e) { fails.push('CHECK FAILED: ' + (e.stack || e.message)); }
const expectedWarn = (w) => /GPU stall due to ReadPixels|skipped|roster\.json unavailable|character 'zz-missing' failed|Failed to fetch dynamically imported module|zz-missing/.test(w);
report.errors = errs; report.fails = fails; report.notes = notes; report.warnings = warns.filter((w) => !expectedWarn(w)).slice(0, 30);
fs.writeFileSync(path.join(ROOT, SHOTS, `${TAG}-report.json`), JSON.stringify(report, null, 2));
if (notes.length) console.log('skipped (console notes):\n' + [...new Set(notes)].join('\n'));
if (report.warnings.length) console.log('warnings:\n' + report.warnings.join('\n'));
await browser.close();
// the 404 of a deliberately missing character module is a console error in Chromium: not a failure
const realErrs = errs.filter((e) => !/zz-missing|Failed to load resource: the server responded with a status of 404/.test(e));
if (realErrs.length || fails.length) { console.error('ERRORS:\n' + [...realErrs, ...fails].slice(0, 40).join('\n')); process.exit(1); }
console.log('browser check OK');
process.exit(0);
