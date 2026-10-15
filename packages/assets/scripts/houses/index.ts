// Registry of hand-designed houses: building id -> drawing function. Houses not listed here use
// the generic cottage in ../buildings.ts. Each house-<i>.ts default-exports a HouseArt or null.
import type { HouseArt } from './types.js';
import h0 from './house-0.js';
import h1 from './house-1.js';
import h2 from './house-2.js';
import h3 from './house-3.js';
import h4 from './house-4.js';
import h5 from './house-5.js';
import h6 from './house-6.js';
import h7 from './house-7.js';
import h8 from './house-8.js';
import h9 from './house-9.js';
import h10 from './house-10.js';
import h11 from './house-11.js';
import h12 from './house-12.js';
import h13 from './house-13.js';
import h14 from './house-14.js';

const ALL: (HouseArt | null)[] = [h0, h1, h2, h3, h4, h5, h6, h7, h8, h9, h10, h11, h12, h13, h14];
export const HOUSE_ART: Record<string, HouseArt | undefined> = Object.fromEntries(ALL.map((f, i) => [`house-${i}`, f ?? undefined]));
