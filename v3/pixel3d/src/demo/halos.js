// (B, vote-fix6) THE GHOST HALO, made unmistakable. The user (2026-10-18): "also I want halos to be more obvious since
// its a very important game marker". The halo says: this dead player STILL HAS their ghost vote.
//   createHalos(demo) -> halos { info(), centreOf(handle), topY(handle), boxes(), update(), dispose() }
//
// Every character's own 3D halo stays as it is (src/chars: spec.ghost's shared 'ghostHalo' bone, or a character's own
// clip-keyed 'halo' bone such as Chonk's) - this module only READS it: where a halo is shown (shared: rig.ghostLevel 1;
// own: the 'halo' bone grown past x10), a crisp D=2 pixel-art HALO SPRITE is drawn over it on the game UI's world tier,
// tracking the 3D ring (its own vertices, skinned: mesh.applyBoneTransform), at least MIN_RX art px wide whatever the
// character's size: a thick gold ring (dark line, light top, deep-gold underside: it reads on the sky, on stone and at
// night), a stepped glow breathing on the 30 Hz grid (3 drawings) and a glint running round it (8 steps). No light, no
// shader program: UI tiers only.
// SPENT (the ghost vote counted: the 3D halo goes + 'ghost:spent', seatcast.js / player.js; integrate7: ONLY then - an
// un-ghost / revive / hidden figure just loses it): the sprite SNUFFS where it was - it dims
// (3 frames), breaks into 4 pieces (3), and wisps away as 3 pale curls rising and thinning (8): ~0.47 s, noticed.
// The name label stands over the sprite (gameui.js: the label lift uses topY(); in the vote ring the sprite's box is a
// keep-out for every name, boxes()).
import * as THREE from 'three';
import * as A from '../ui/events/art.js';
import { PixelImage, frameAt, dissolve, GRID_HZ } from '../ui/kit.js';
import { HALO } from '../chars/rig.js';

const MIN_RX = 9;                 // art px (x q at D=2): the smallest halo half-width drawn
const GROW = 1.3;                 // x the 3D ring's radius: the sprite covers the thin 3D ring
const SNUFF_F = 14;               // grid frames of the snuff
const GOLD = { hi: '#FFFBE2', mid: '#FFD84A', sh: '#D98A16', line: '#2E1A06' };
const DULL = { hi: '#E8D9A6', mid: '#B8963E', sh: '#7A5A24', line: '#2E1A06' };
const gk = (dt) => Math.floor(dt * GRID_HZ + 1e-6);
const cache = new Map();
const memo = (k, fn) => { let v = cache.get(k); if (!v) { v = fn(); cache.set(k, v); if (cache.size > 400) cache.delete(cache.keys().next().value); } return v; };

/** the halo ring (rx x ry art px), glow step g 0..2 (0 none, 1 a dithered glow line, 2 a full glow line + dither),
 *  ramp R; broken = the 4 gaps of the snuff's break. -> PixelImage centred at (ox, oy) */
function haloArt(rx, ry, q, g, R = GOLD, broken = false) {
  return memo(`h|${rx}|${ry}|${q}|${g}|${R.mid}|${broken}`, () => {
    const pad = 3 * q + 2, W = 2 * (rx + pad) + 1, H = 2 * (ry + pad) + 1, cx = rx + pad + 0.5, cy = ry + pad + 0.5;
    const img = new PixelImage(W, H);
    const tx = Math.max(2 * q + 1, Math.round(rx * 0.3)), ty = Math.max(q + 1, Math.round(ry * 0.5));
    if (g > 0) {
      const glow = new PixelImage(W, H);
      for (let i = 0; i < q; i++) glow.ring(cx, cy, rx + q + i, ry + q * 0.6 + i * 0.6, '#FFF2A0');
      if (g === 2) for (let i = 0; i < q; i++) glow.ring(cx, cy, rx + 2 * q + i, ry + q * 1.2 + i * 0.6, '#FFE36A');
      const gg = g === 1 ? dissolve(glow, 0.5) : glow;
      img.blit(gg, 0, 0);
      // the glow's inner side too (the hole lights up)
      const inner = new PixelImage(W, H);
      for (let i = 0; i < q; i++) inner.ring(cx, cy, rx - tx - i, Math.max(1, ry - ty - i * 0.6), '#FFF2A0');
      img.blit(g === 1 ? dissolve(inner, 0.75) : dissolve(inner, 0.5), 0, 0);
    }
    const ring = new PixelImage(W, H);
    A.annulus(ring, cx, cy, rx, ry, R, { tx, ty });
    if (broken) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = Math.atan2((y + 0.5 - cy) / ry, (x + 0.5 - cx) / rx);
      for (const g0 of [0.4, 1.95, 3.5, 5.05]) { let d = a - g0; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) < 0.2) ring.erase(x, y); }
    }
    img.blit(ring, 0, 0);
    img.ox = rx + pad; img.oy = ry + pad;
    return img;
  });
}
/** a pale wisp curl (the snuff), h art px tall, drawing k 0..1 */
function wispArt(h, q, k) {
  return memo(`w|${h}|${q}|${k}`, () => {
    const W = 3 * q + 3, img = new PixelImage(W, h + 2);
    for (let y = 0; y < h; y++) { const x = Math.round(W / 2 - 1 + Math.sin((y / h) * Math.PI * 1.6 + k * 1.3) * q * 0.9); img.rect(x, y + 1, q, 1, y < h / 3 ? '#F4F0E6' : '#CFC8BA'); }
    img.ox = W >> 1; img.oy = h + 1;
    return img;
  });
}

export function createHalos(demo) {
  const { engine, events } = demo;
  const params = demo.params ?? new URLSearchParams();
  const reduced = params.get('rm') === '1';
  // (integrate7) reduced motion: the 3D halo's stepped glow + glint stop too (rig.js reads HALO per displayed frame)
  if (reduced) HALO.twinkle = false;
  const gameui = demo.gameui, L = gameui?.layers;
  if (!L?.add) return null;
  if (params.get('halos') === '0') return null;
  const cam = engine.camera;
  const rigInfo = new WeakMap();      // rig -> { bone, shared, verts [4 vertex indices] } | null
  const state = new Map();            // handle -> { on, c (world centre), r, x, y, rx, ry, q, offAt, top }
  const info = { drawn: 0, snuffs: 0, list: [] };
  const v = new THREE.Vector3();
  // (integrate7) the snuff only on a REAL spend: 'ghost:spent' {seat | you, t} (seatcast.js / player.js) marks that
  // figure; the draw stamps it on the UI clock (spentAt) and snuffs a halo that went off within SPEND_WIN s of it. A halo
  // that goes because the figure is un-ghosted (key 5, a revive) or hidden just vanishes.
  const SPEND_WIN = 1.0, pendingSpent = new Set();
  const onSpent = (e) => {
    const h = e?.you ? demo.player?.handle : demo.passB?.seats?.handleOf?.(e?.seat);
    if (h) pendingSpent.add(h);
  };
  const offSpent = events?.on?.('ghost:spent', onSpent);

  function haloOf(rig) {
    if (rigInfo.has(rig)) return rigInfo.get(rig);
    let out = null;
    const b = rig?.bones ?? {}, bone = b.ghostHalo ?? b.halo ?? null, mesh = rig?.mesh;
    const geo = mesh?.geometry, si = geo?.attributes?.skinIndex, pos = geo?.attributes?.position;
    if (bone && si && pos && mesh.isSkinnedMesh) {
      const idx = rig.boneList.indexOf(bone);
      let mnx = null, mxx = null, mnz = null, mxz = null;
      for (let i = 0; i < si.count; i++) {
        if (si.getX(i) !== idx) continue;
        const x = pos.getX(i), z = pos.getZ(i);
        if (mnx === null || x < pos.getX(mnx)) mnx = i;
        if (mxx === null || x > pos.getX(mxx)) mxx = i;
        if (mnz === null || z < pos.getZ(mnz)) mnz = i;
        if (mxz === null || z > pos.getZ(mxz)) mxz = i;
      }
      if (mnx !== null) out = { bone, shared: bone === b.ghostHalo, verts: [mnx, mxx, mnz, mxz] };
    }
    rigInfo.set(rig, out);
    return out;
  }
  /** is the 3D halo shown now (the rig's own rule) */
  const shown = (rig, h) => (h.shared ? rig.ghostLevel === 1 && h.bone.scale.x > 0.5 : h.bone.scale.x > 10);
  /** the 3D ring's world centre + radius now */
  function ringNow(rig, h) {
    const mesh = rig.mesh, P = [];
    for (const i of h.verts) { v.fromBufferAttribute(mesh.geometry.attributes.position, i); mesh.applyBoneTransform(i, v); P.push(mesh.localToWorld(v.clone())); }
    const c = P[0].clone().add(P[1]).add(P[2]).add(P[3]).multiplyScalar(0.25);
    const r = 0.5 * Math.max(Math.hypot(P[0].x - P[1].x, P[0].z - P[1].z), Math.hypot(P[2].x - P[3].x, P[2].z - P[3].z));
    return { c, r };
  }
  /** the figures that may wear a halo: you + the townsfolk the game UI knows (the seated cast included) */
  function figures() {
    const out = [];
    const P = demo.player, h = P?.handle;
    if (h) out.push(h);
    if (!P?.interior) for (const n of demo.npcs?.members ?? []) if (n?.handle) out.push(n.handle);
    return out;
  }
  const visibleH = (h) => { for (let o = h.root; o; o = o.parent) if (o.visible === false) return false; return !!h.root?.parent; };

  const draw = (LL) => {
    const T = LL.tok, t = LL.t;
    const HD = LL.hd && LL.hd.d > 1 ? LL.hd : null, q = HD ? HD.d : 1, kk = HD ? HD.k : 1;
    const Wimg = HD ? HD.world : LL.world, atW = (p) => (HD ? HD.at(p) : LL.at(p));
    const tw = cam.texelWorld, cp = Math.max(0.3, Math.cos(cam.pitch)), sp = Math.sin(cam.pitch);
    info.drawn = 0; info.list.length = 0;
    const seen = new Set();
    for (const h of figures()) {
      seen.add(h);
      const rig = h.ch?.rig, hi = rig ? haloOf(rig) : null;
      let s = state.get(h);
      if (!hi) { if (s) state.delete(h); continue; }
      const vis = visibleH(h);
      const on = vis && shown(rig, hi);
      if (!s) { s = { on: false, offAt: null, spentAt: null, wentOff: null }; state.set(h, s); }
      if (pendingSpent.has(h)) { pendingSpent.delete(h); s.spentAt = t; }
      if (s.spentAt != null && t - s.spentAt > SPEND_WIN && (on || s.wentOff == null)) s.spentAt = null;
      if (on) {
        const { c, r } = ringNow(rig, hi);
        const rx = Math.max(MIN_RX * q, Math.round((r * GROW / tw) * kk)), ry = Math.max(3 * q, Math.round(rx * Math.max(0.36, sp * 1.05)));
        const p = atW(c);
        Object.assign(s, { on: true, offAt: null, wentOff: null, c, r, x: Math.round(p.x), y: Math.round(p.y), rx, ry, q, kk,
          top: c.y + ((ry + 3 * q + 2) / kk) * tw / cp });
        const g = reduced ? 1 : [0, 1, 2, 1][frameAt(t, 3, 4)];
        const im = haloArt(rx, ry, q, g);
        fastPut(Wimg, im, s.x - im.ox, s.y - im.oy);
        // the glint running round the ring (8 steps, 4 / s), on the near (lower) half and the sides
        if (!reduced) {
          const j = Math.floor(t * 4) % 8, a = [0.2, 0.75, 1.3, 1.85, 2.4, 2.95, -0.35, -2.8][j];
          const gx = s.x + Math.round(Math.cos(a) * (rx - q)), gy = s.y + Math.round(Math.sin(a) * (ry - q * 0.5));
          sparkQ(Wimg, gx, gy, j % 2 ? 2 : 1, q, { core: '#FFFFFF', arm: '#FFFBE2', tip: '#FFD84A' });
        }
        info.drawn++;
        info.list.push({ id: h.id, x: s.x, y: s.y, rx, ry, hd: !!HD });
      } else {
        // the SNUFF: it was on, the figure is still there AND its ghost vote was just spent ('ghost:spent' within
        // SPEND_WIN s, before or after the 3D halo went) -> dims, breaks, wisps away where it was. Otherwise it just goes.
        if (s.on) s.wentOff = vis ? t : null;
        if (s.wentOff != null && s.offAt == null) {
          if (s.spentAt != null && Math.abs(s.spentAt - s.wentOff) <= SPEND_WIN) { s.offAt = s.wentOff; s.wentOff = null; s.spentAt = null; info.snuffs++; }
          else if (t - s.wentOff > SPEND_WIN) s.wentOff = null;
        }
        s.on = false;
        if (s.offAt != null && vis && s.rx) {
          const k = reduced ? 99 : gk(t - s.offAt);
          if (k < SNUFF_F) {
            if (s.c) { const p = atW(s.c); s.x = Math.round(p.x); s.y = Math.round(p.y); }
            if (k < 6) { const im = haloArt(s.rx, s.ry, s.q, 0, DULL, k >= 3); fastPut(Wimg, k >= 3 ? dissolve(im.clone(), 0.25, s.x & 3, s.y & 3) : im, s.x - im.ox, s.y - im.oy); }
            else {
              const u = k - 6, wh = Math.max(4 * s.q, Math.round(s.ry * 1.4));
              for (const [dx, ph] of [[-0.7, 0], [0, 1], [0.7, 0]]) {
                let w = wispArt(wh, s.q, (u + ph) % 2);
                if (u >= 3) w = dissolve(w.clone(), u >= 6 ? 0.75 : 0.5, 0, 0);
                fastPut(Wimg, w, s.x + Math.round(dx * s.rx) - w.ox, s.y - Math.round(u * 1.5 * s.q) - w.oy);
              }
            }
            info.list.push({ id: h.id, snuff: k });
          } else s.offAt = null;
        } else if (!vis) s.offAt = null;
      }
    }
    for (const h of [...state.keys()]) if (!seen.has(h)) state.delete(h);
    pendingSpent.clear();   // (a spend on a figure not drawn this frame: nothing to snuff)
  };
  L.add(draw, 19);

  return {
    info: () => JSON.parse(JSON.stringify(info)),
    /** the halo sprite's world centre + 3D radius for a handle (last frame), or null when none is shown */
    centreOf: (h) => { const s = state.get(h); return s?.on ? { x: s.c.x, y: s.c.y, z: s.c.z, r: s.r } : null; },
    /** the world y of the sprite's top (+ its glow) for a handle (last frame), or null: the name label stands over it */
    topY: (h) => { const s = state.get(h); return s?.on || (s?.offAt != null) ? s.top ?? null : null; },
    /** the shown sprites' boxes (L.world texels, last frame): keep-outs for the names in the vote ring */
    boxes: () => [...state.values()].filter((s) => s.on).map((s) => ({ x0: Math.floor((s.x - s.rx - 3 * s.q) / s.kk), x1: Math.ceil((s.x + s.rx + 3 * s.q) / s.kk), y0: Math.floor((s.y - s.ry - 3 * s.q) / s.kk), y1: Math.ceil((s.y + s.ry + 3 * s.q) / s.kk) })),
    update() { /* drawn by the UI layer pass */ },
    dispose() { L.remove?.(draw); offSpent?.(); },
  };
}

/** blit a cached sprite straight into a layer's bytes; partial alpha composites through set() (votemarks.js fastBlit) */
function fastPut(dst, src, x, y) {
  if (!dst || !src) return;
  x |= 0; y |= 0;
  const W = dst.w, H = dst.h, sw = src.w, sd = src.data, dd = dst.data;
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + sw), y1 = Math.min(H, y + src.h);
  if (x1 <= x0 || y1 <= y0) return;
  for (let yy = y0; yy < y1; yy++) {
    let si = ((yy - y) * sw + (x0 - x)) * 4, di = (yy * W + x0) * 4;
    for (let xx = x0; xx < x1; xx++, si += 4, di += 4) {
      const a = sd[si + 3];
      if (!a) continue;
      if (a === 255 || !dd[di + 3]) { dd[di] = sd[si]; dd[di + 1] = sd[si + 1]; dd[di + 2] = sd[si + 2]; dd[di + 3] = a; }
      else dst.set(xx, yy, [sd[si], sd[si + 1], sd[si + 2], a]);
    }
  }
  dst.mark?.(x0, y0, x1 - 1, y1 - 1);
}
/** a 1x / HD spark at (x, y) (votemarks.js sparkQ) */
function sparkQ(img, x, y, r, q, S) {
  x |= 0; y |= 0;
  if (q === 1) { A.spark(img, x, y, r, S); img.set?.(x, y, S.core); return; }
  A.spark(img, x, y, 2 * r, S);
  img.rect?.(x - 1, y - 1, 2, 2, S.core);
}
