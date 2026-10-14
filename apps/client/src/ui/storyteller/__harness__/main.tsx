// @ts-nocheck
// TEMPORARY visual harness (rules-storyteller). Runs the real engine in-browser behind a fake conn.
import { render } from 'preact';
import { useState } from 'preact/hooks';
import * as R from '../../../../../../packages/rules/src/index.ts';
import { createStore, Emitter } from '../../../net/store';
import { Hud } from '../../hud';
import { StorytellerPanel } from '..';
import '../../common/theme.css';

const CH = ['imp', 'poisoner', 'washerwoman', 'empath', 'fortune_teller', 'monk', 'butler', 'ravenkeeper', 'drunk'];
const names = ['Ada', 'Bram', 'Cora', 'Dov', 'Esme', 'Finn', 'Gus', 'Hale', 'Iris'];
const s = R.createGame({ players: names.map((name, seat) => ({ pid: 'p' + seat, seat, name })), rng: R.mulberry32(5), now: Date.now() });
const now = () => Date.now();
const stc = (c) => { const r = R.applyStCommand(s, c, { now: now() }); if (!r.ok) console.warn(r.error); return r; };
stc({ type: 'assign_characters', assignments: CH.map((character, seat) => ({ seat, character })), drunkBelievesSeatCharacter: 'chef', redHerringSeat: 3, demonBluffs: [], allowNonstandard: true });

const conns = {};
function connFor(who) {
  if (conns[who]) return conns[who];
  const c = { events: new Emitter(), gameView: createStore(null), lobbyView: createStore(null), chat: createStore([]), status: createStore('open'),
    send(type, payload) {
      let r;
      if (type === 'st:command') r = R.applyStCommand(s, payload, { now: now() });
      else {
        const seat = Number(who.slice(1));
        const map = { 'game:nominate': { type: 'nominate', ...payload }, 'game:vote': { type: 'vote', ...payload }, 'game:promptResponse': { type: 'promptResponse', ...payload }, 'game:slayerShot': { type: 'slayerShot', ...payload } };
        r = R.applyPlayerAction(s, seat, map[type], { now: now() });
      }
      if (!r.ok) c.events.emit('error', { code: r.code, message: r.error, for: type });
      else for (const e of r.effects) if (e.type === 'announcement') Object.values(conns).forEach((x) => x.events.emit('announcement', e.announcement));
      refresh();
    } };
  conns[who] = c;
  return c;
}
function refresh() {
  for (const [who, c] of Object.entries(conns)) c.gameView.set(who === 'st' ? R.projectForStoryteller(s) : R.projectForPlayer(s, Number(who.slice(1))));
}
setInterval(() => { const r = R.tick(s, now()); if (r.changed) refresh(); }, 250);
window.__s = s; window.__stc = (c) => { stc(c); refresh(); };

function App() {
  const [who, setWho] = useState(new URLSearchParams(location.search).get('who') || 'st');
  const conn = connFor(who);
  refresh();
  return (
    <div class="screen" style={{ background: 'radial-gradient(#2a2f3a, #0f0d14)' }}>
      <div style={{ position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 99, display: 'flex', gap: 4 }}>
        {['st', ...names.map((_, i) => 'p' + i)].map((w) => <button key={w} class={w === who ? 'primary' : ''} onClick={() => setWho(w)}>{w}</button>)}
      </div>
      <Hud key={'h' + who} conn={conn} account={{}} />
      <StorytellerPanel key={'s' + who} conn={conn} account={{}} />
    </div>
  );
}
render(<App />, document.getElementById('app'));
