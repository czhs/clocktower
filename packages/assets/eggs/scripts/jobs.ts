// gpt-6-astra jobs for the CMU easter-egg sprites (cmu-eggs). Same mechanics as the main AI
// pipeline (ai/scripts/jobs.ts): the procedural blockouts (sprites.ts) are laid out on a magenta
// reference sheet, Astra repaints them, and remaster.ts's processFrame() cuts the result back into
// exact-size frames that must pass silhouette validation; failures keep the blockout.
import type { AiJob } from '../../ai/scripts/jobs.js';

export interface EggJob extends AiJob {
  /** Town context crop (tiles) attached as context.png: where these sprites will stand. */
  context: { x: number; y: number; w: number; h: number };
  /** Extra reference images (repo-relative) attached to the codex run with -i (look only; never shipped). */
  attach?: string[];
}

const SHARED_NOTES = [
  'Quality bar: stunning, lovingly hand-placed pixel art in the spirit of modern "HD-2D" gothic scenes, at the native pixel size: crisp clusters, rich hue-shifted shading, a cool moonlit rim light on upper-left edges, warm emissive cores in windows, lanterns and screens (they glow at night in the game), deep soft-edged contact shadows. Every material reads at 1x.',
  'These are new props for the same town, so they must look like they were painted by the same artist as the buildings and props in context.png: same palette, same dark outline, same moonlit lighting, same pixel density (1 art pixel = one grid cell).',
  'Keep every sprite readable at 1x: strong silhouette first, then 2-3 shading steps; tiny details may be single pixels.',
  'No legible text, numbers, letters, logos or real-world brand marks anywhere (paint strokes and engravings must stay abstract), except where a job explicitly asks for one symbol.',
];

export const EGG_JOBS: EggJob[] = [
  {
    id: 'eggs-weanworks',
    sheet: 'objects',
    frames: ['egg_wean', 'egg_hamerschlag'],
    canvas: 'tall',
    scale: 6,
    subject:
      'two linked buildings at the foot of the northern cliff. LEFT: a tall, stern, blocky grey keep of rough cast stone with NINE low floors of identical narrow slit windows in a strict grid (a few warmly lit), a flat roof with a parapet, a heavy projecting concrete-like canopy over a double door, and a small red-and-green tartan pennant on an iron pole; a covered stone skybridge with a row of lit windows leaves its SEVENTH floor to the right. RIGHT: a gothic engineering workshop of pale buff and grey stone standing on a tall rocky outcrop, two tall floors with arched windows, a slate roof, a round cylindrical tower capped with a small dome on its left (it hides a chimney), a large brass gear on the facade, and a wooden water wheel on its right edge; the skybridge from the keep arrives at the workshop\'s SECOND floor door on its left edge, so the two bridge ends must line up at the same height across the two sprites',
    notes: [
      ...SHARED_NOTES,
      'The keep is the town\'s odd one out: brutal and grid-like but still built of the town\'s weathered stone so it belongs in a gothic village.',
      'The skybridge in the left sprite runs to its right edge and the workshop\'s bridge door is at its left edge: keep both exactly at the heights shown in ref.png.',
    ],
    enabled: true,
    minIoU: 0.72,
    context: { x: 56, y: 2, w: 40, h: 26 },
  },
  {
    id: 'eggs-props',
    sheet: 'objects',
    frames: ['egg_sky', 'egg_fence', 'egg_fence_1', 'egg_fence_2', 'egg_fence_3', 'egg_camp', 'egg_hatch'],
    canvas: 'wide',
    scale: 5,
    subject:
      'small town props: (1) `egg_sky` a slender dark iron pole leaning steeply into the sky from a small stone plinth, with seven tiny people striding up it and two more standing on the ground looking up; (2) `egg_fence`, `egg_fence_1`, `egg_fence_2`, `egg_fence_3` the SAME stubby, absurdly thick post-and-two-rail fence, so caked in decades of paint that every edge is rounded and blobby, each painted in a different bright scheme of abstract stripes, blobs and drips (keep each one\'s colours); (3) `egg_camp` a small tartan-striped canvas tent with a glowing lantern on a stick; (4) `egg_hatch` a wooden cellar hatch set in the ground with iron bands, a thin line of green screen-light leaking from its edge',
    notes: [...SHARED_NOTES, 'The four fences are variants of one object: identical shape, only the paint differs.'],
    enabled: true,
    minIoU: 0.7,
    context: { x: 30, y: 26, w: 34, h: 24 },
  },
  {
    id: 'eggs-creatures',
    sheet: 'objects',
    frames: [
      'egg_scotty_0',
      'egg_scotty_1',
      'egg_scotty_2',
      'egg_honk_0',
      'egg_honk_1',
      'egg_honk_2',
      'egg_chonk',
      'egg_cow_0',
      'egg_cow_1',
      'egg_requin_0',
      'egg_requin_1',
      'egg_requin_grin',
      'egg_polly_0_0',
      'egg_polly_0_1',
      'egg_polly_1_0',
      'egg_polly_1_1',
      'egg_polly_2_0',
      'egg_polly_2_1',
      'egg_frog_green_0',
      'egg_frog_green_1',
      'egg_frog_blue_0',
      'egg_frog_blue_1',
    ],
    canvas: 'wide',
    scale: 8,
    subject:
      'chunky, bold, charming creature characters seen from the side, all facing right, as animation frames: a boxy black Scottish terrier with a huge grey beard and a little red/green/blue/yellow tartan coat (2 trotting frames + 1 sitting); a round grey goose with a dark neck, white cheek and orange beak (2 waddling frames + 1 HONKING with the beak wide open); one enormous fluffy white goose taller than a person, looking pleased with itself; a chunky black-and-white cow with big eyes (head up, then grazing); a dark shark fin slicing the water with a foam wake (2 frames); the same shark surfacing with a huge toothy grin; a round parrot perched on a twig in three different plumages (each idle + wings out); two round frogs with eyes on top and white bellies, one green, one blue (sitting, mid-hop)',
    notes: [
      ...SHARED_NOTES,
      'Style: bold and playful character design — simple rounded masses, oversized expressive eyes with a 1-pixel shine, 2-3 flat tones per material, a confident dark contour, clear readable poses. They are allowed to look a little out of place in the gothic village; that is the joke.',
      'STRICT SILHOUETTES: every sprite keeps the size and outline of its blockout; feet, perches and the waterline touch the same bottom edge. No extra ground, splashes beyond the blockout, or longer perches.',
      'Frames of the same animal must stay consistent (same colours, same proportions); only the pose changes.',
    ],
    enabled: true,
    minIoU: 0.62,
    context: { x: 4, y: 68, w: 30, h: 20 },
  },
  {
    // the user-confirmed costumes and the rest of the course mascots (supersedes eggs-creatures for
    // Requin and Polly: the last job listing a frame decides)
    id: 'eggs-mascots',
    sheet: 'objects',
    frames: [
      'egg_requin_0',
      'egg_requin_1',
      'egg_requin_grin',
      'egg_polly_0_0',
      'egg_polly_0_1',
      'egg_polly_1_0',
      'egg_polly_1_1',
      'egg_polly_2_0',
      'egg_polly_2_1',
      'egg_opal_0',
      'egg_opal_1',
      'egg_cilantro_0',
      'egg_cilantro_1',
      'egg_fox_0',
      'egg_fox_1',
      'egg_panda_0',
      'egg_panda_1',
      'egg_theo_0',
      'egg_theo_1',
      'egg_greenting_0',
      'egg_greenting_1',
    ],
    canvas: 'wide',
    scale: 8,
    subject:
      'chunky, bold, charming creature characters, all facing right, as animation frames: a dark shark fin wearing a tiny black French BERET, slicing the water with a foam wake (2 frames), and the same shark surfacing with a huge toothy grin, beret jauntily tilted; a round parrot perched on a twig wearing a black T-shirt with a white lambda (λ) on the chest, in three different plumages (each idle + wings out); a brown otter floating on her back in the water with a small orange harness, paws up holding a pebble (2 frames); a giraffe in a blue hoodie and a green scarf, long spotted neck, friendly face (open eyes, then blinking); a plump orange fox with a white chest and muzzle and black ears, sitting (ears relaxed, then one ear twitching); a small red panda with a white-marked face and a ringed tail (sitting, then standing up on its hind legs); a round brown hedgehog with little spikes (2 walking frames); a rounded green blob-shaped creature with a small black eye and a black clock-hand-like mark, peeking up (2 frames)',
    notes: [
      ...SHARED_NOTES,
      'Style: bold and playful character design — simple rounded masses, oversized expressive eyes with a 1-pixel shine, 2-3 flat tones per material, a confident dark contour, clear readable poses. They are allowed to look out of place in the gothic village; that is the joke.',
      'Costume details must stay readable at 1x: the beret on the shark, the lambda on the parrot\'s black T-shirt, the giraffe\'s blue hoodie and green scarf, the otter\'s orange harness.',
      'STRICT SILHOUETTES: every sprite keeps the size and outline of its blockout; feet, perches and waterlines touch the same bottom edge.',
      'Frames of the same character must stay consistent; only the pose changes. The lambda is the only symbol allowed; no other letters or text.',
    ],
    enabled: true,
    minIoU: 0.62,
    context: { x: 4, y: 68, w: 30, h: 20 },
  },
];

// ------------------------------------------------------------------------------------------
// 2x density redraws (docs/art-direction.md "Visual overhaul": all art authored at 32 texels per
// tile). Reference = the shipped 1x frame upscaled 2x; Astra redraws it at double pixel density.
const D2 = (id: string, frames: string[], canvas: 'wide' | 'tall', scale: number, subject: string, extra: string[] = []): EggJob => ({
  id,
  sheet: 'objects',
  frames,
  canvas,
  scale,
  subject,
  notes: [...SHARED_NOTES, ...extra],
  enabled: true,
  minIoU: 0.72,
  context: { x: 56, y: 2, w: 40, h: 26 },
  density: 2,
});
const CHUNKY = 'Characters: bold and playful design, simple rounded masses, oversized expressive eyes with a shine, 2-3 flat tones per material, a confident dark contour; keep every costume detail (beret, lambda T-shirt, hoodie and scarf, harness, tartan coat).';
export const EGG_JOBS_2X: EggJob[] = [
  D2('eggs2x-wean', ['egg_wean'], 'tall', 4, 'a tall stern grey stone keep with nine low floors of identical arched slit windows (some warmly lit), a projecting stone canopy over a double door, a small tartan pennant on the roof and a covered skybridge leaving its seventh floor to the right edge'),
  D2('eggs2x-workshop', ['egg_hamerschlag'], 'tall', 4, 'a gothic engineering workshop on a tall mossy rock: buff and grey stone, a round tower with a small green dome on the left, arched windows (one lit, one dark), a big brass gear on the facade, a water wheel on the right edge and the skybridge door on the left edge at the second floor'),
  D2('eggs2x-props', ['egg_sky', 'egg_camp', 'egg_hatch'], 'wide', 4, 'a slender iron pole leaning into the sky from a stone plinth with seven tiny striding figures and two onlookers; a small tartan tent with a glowing lantern on a stick; a wooden cellar hatch with iron bands and a thin line of green screen-light'),
  D2('eggs2x-fences', ['egg_fence', 'egg_fence_1', 'egg_fence_2', 'egg_fence_3'], 'wide', 5, 'the same stubby post-and-two-rail fence, so caked in decades of paint that every edge is rounded, in four different paint jobs of abstract stripes, blobs and drips'),
  D2('eggs2x-creatures', ['egg_scotty_0', 'egg_scotty_1', 'egg_scotty_2', 'egg_honk_0', 'egg_honk_1', 'egg_honk_2', 'egg_chonk', 'egg_cow_0', 'egg_cow_1', 'egg_frog_green_0', 'egg_frog_green_1', 'egg_frog_blue_0', 'egg_frog_blue_1'], 'wide', 5, 'animation frames of chunky creature characters: a black Scottish terrier in a tartan coat, a grey goose (waddling and honking), an enormous white goose, a black-and-white cow, a green frog and a blue frog', [CHUNKY]),
  D2('eggs2x-mascots-a', ['egg_requin_0', 'egg_requin_1', 'egg_requin_grin', 'egg_polly_0_0', 'egg_polly_0_1', 'egg_polly_1_0', 'egg_polly_1_1', 'egg_polly_2_0', 'egg_polly_2_1'], 'wide', 6, 'animation frames: a shark fin wearing a tiny black beret, the same shark surfacing with a huge toothy grin; a perched parrot in a black lambda T-shirt in three plumages', [CHUNKY, 'The lambda on the T-shirt is the only symbol allowed.']),
  D2('eggs2x-mascots-b', ['egg_opal_0', 'egg_opal_1', 'egg_cilantro_0', 'egg_cilantro_1', 'egg_fox_0', 'egg_fox_1', 'egg_panda_0', 'egg_panda_1', 'egg_theo_0', 'egg_theo_1', 'egg_greenting_0', 'egg_greenting_1'], 'wide', 5, 'animation frames: an otter floating on her back with an orange harness; a giraffe in a blue hoodie and green scarf; a plump orange fox; a small red panda; a round hedgehog; a rounded, bean-shaped green creature head seen in side profile with a dark eye and a black line mark (its look is fixed by the reference; keep it)', [CHUNKY]),
];

/** Animation groups: if any frame of a group is not AI, the whole group ships procedural. */
export const EGG_GROUPS: readonly string[][] = [
  ['egg_scotty_0', 'egg_scotty_1', 'egg_scotty_2'],
  ['egg_honk_0', 'egg_honk_1', 'egg_honk_2'],
  ['egg_requin_0', 'egg_requin_1', 'egg_requin_grin'],
  ['egg_cilantro_0', 'egg_cilantro_1'],
  ['egg_greenting_0', 'egg_greenting_1'],
  ['egg_opal_0', 'egg_opal_1'],
  ['egg_theo_0', 'egg_theo_1'],
  ['egg_cow_0', 'egg_cow_1'],
  ['egg_frog_green_0', 'egg_frog_green_1', 'egg_frog_blue_0', 'egg_frog_blue_1'],
  ['egg_polly_0_0', 'egg_polly_0_1', 'egg_polly_1_0', 'egg_polly_1_1', 'egg_polly_2_0', 'egg_polly_2_1'],
  ['egg_wean', 'egg_hamerschlag'],
  ['egg_opal_0', 'egg_opal_1'],
  ['egg_cilantro_0', 'egg_cilantro_1'],
  ['egg_fox_0', 'egg_fox_1', 'egg_panda_0', 'egg_panda_1'],
  ['egg_theo_0', 'egg_theo_1'],
  ['egg_greenting_0', 'egg_greenting_1'],
];

/** Frames reviewed side by side where the blockout reads better at 1x (decided by eye, see docs). */
export const PREFER_PROCEDURAL: ReadonlySet<string> = new Set<string>([]);

export const eggJobById = (id: string) => [...EGG_JOBS, ...EGG_JOBS_2X].find((j) => j.id === id);
