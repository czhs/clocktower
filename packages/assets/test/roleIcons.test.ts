// Role icons (scripts/roles): every character has original art, every emblem is well-formed and
// fits the plaque's field, and the committed PNGs match the catalogue.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '@ct/protocol';
import { drawEmblem, drawRoleIcon, ROLE_ART, ROLE_ICON_SIZE } from '../scripts/roles/index.js';
import { MOTIFS } from '../scripts/roles/motifs.js';

const GENERATED = join(dirname(fileURLToPath(import.meta.url)), '..', 'generated', 'roles');

describe('role icons', () => {
  it('has art for exactly the catalogue', () => {
    expect(Object.keys(ROLE_ART).sort()).toEqual([...CHARACTER_IDS].sort());
  });

  it('uses only known emblems, with only palette characters', () => {
    for (const [id, [motif]] of Object.entries(ROLE_ART)) expect(MOTIFS[motif], `${id} → ${motif}`).toBeDefined();
    for (const [name, rows] of Object.entries(MOTIFS)) for (const r of rows) expect(r, name).toMatch(/^[.#+\-o*wkgry]*$/);
  });

  it('every emblem (with its outline) fits inside the plaque field', () => {
    for (const [id, [motif, main, accent]] of Object.entries(ROLE_ART)) {
      const e = drawEmblem(motif, main, accent);
      // the emblem image carries a 1px outline border; its content must stay within 24px
      expect(e.w - 2, id).toBeLessThanOrEqual(24);
      expect(e.h - 2, id).toBeLessThanOrEqual(24);
    }
  });

  it('draws a 32×32 icon with transparent corners and an opaque centre', () => {
    const img = drawRoleIcon('imp');
    expect([img.w, img.h]).toEqual([ROLE_ICON_SIZE, ROLE_ICON_SIZE]);
    expect(img.alpha(0, 0)).toBe(0);
    expect(img.alpha(16, 16)).toBe(255);
  });

  it('a PNG is committed for every character', () => {
    expect(existsSync(GENERATED)).toBe(true);
    const files = readdirSync(GENERATED).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''));
    expect(files.sort()).toEqual([...CHARACTER_IDS].sort());
  });
});
