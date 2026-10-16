# Brianbi sprite source

Generated with the built-in imagegen tool from the original Brianbi reference. Keep anatomical right foot bare and left sneaker intact; never mirror views.

## Generation prompt

Create a production game sprite animation sheet using the attached image ONLY as the identity, clothing and photographic style reference. This is Brianbi, the same young adult man with spiky black hair, beige loose sweatshirt with faded print, dark charcoal jeans and gray backpack. Preserve his face and outfit. His anatomical RIGHT foot is barefoot, and his anatomical LEFT foot wears the dark sneaker, consistently from every viewpoint. Do not horizontally mirror him.
Output a transparent PNG, portrait canvas, precisely FIVE equal columns and EIGHT equal rows, no labels, no borders, no ground shadows, no floor, no extra people. Exactly 40 separate complete full-body figures, one within each equal cell. Leave clear transparent padding on all four sides of each figure, including above every hair spike and beneath feet. Identical scale, center and foot baseline in every cell; all figures about 80% of their cell height. Fixed orthographic camera at chest height, photographic cutout style, neutral soft lighting. Every row contains the SAME direction throughout, with these exact row directions from top to bottom:
1 FRONT, facing the viewer (game down).
2 FRONT THREE-QUARTER facing toward the RIGHT EDGE of the image (game down-right). Face and chest visible, nose points to the right.
3 RIGHT PROFILE, nose to the RIGHT EDGE (game right).
4 BACK THREE-QUARTER facing toward the RIGHT EDGE (game up-right), backpack and back of head visible.
5 BACK, facing directly away (game up).
6 BACK THREE-QUARTER facing toward the LEFT EDGE (game up-left), backpack and back of head visible.
7 LEFT PROFILE, nose to the LEFT EDGE (game left).
8 FRONT THREE-QUARTER facing toward the LEFT EDGE (game down-left), face and chest visible.
Five columns from left to right:
1 neutral standing idle, both feet planted;
2 walk contact A, right bare foot forward and left shoe back, opposite arm swing;
3 walk passing A, left shoe swinging forward past planted right bare foot, natural bent knee;
4 walk contact B, left shoe forward and right bare foot back, reversed arm swing;
5 walk passing B, right bare foot swinging forward past planted left shoe, natural bent knee.
Make the legs and arms clearly articulate in a gentle ordinary walking cycle, torso stable, no running, no exaggerated rocking. Walk in place, no translational movement between cells. Keep exact identity, hair, backpack, asymmetrical footwear and body size across all 40 frames. Correct the duplicate direction mistakes in the reference: rows 2 and 8 face opposite horizontal sides, as do rows 4 and 6. Transparent alpha background, crisp natural silhouette with no white fringe.

## Refinement prompt

Edit this sprite sheet only to clean its transparency and correct its animation. Preserve precisely the existing 5 column by 8 row grid, all 40 character poses, every direction, Brianbi's identity and photographic detail, beige sweatshirt, charcoal jeans, gray backpack, right bare foot and left sneaker. Remove ALL the stray red/yellow/white colored pixels and specks surrounding the figures. All pixels outside the natural body, hair and clothing silhouette must be clean fully transparent alpha, with natural anti-aliased edges and no outline, glow, fringe or ground shadow. Keep the complete hair and feet visible with transparent margins. Ensure walking poses in columns 2-5 alternate which leg is forward: column 2 right bare foot forward, column 3 left shoe passing beneath hips, column 4 left shoe forward, column 5 right bare foot passing beneath hips. Keep feet separated and knees natural; the arms gently swing in opposition. Column 1 remains neutral standing idle. Every row direction remains unchanged. Preserve identical body size and alignment throughout. Do not add labels or background.

## Reproduce the atlas

Source: `brianbi-source.png` (five animation columns × eight direction rows). Run `node --import tsx packages/assets/scripts/hd/import-brianbi.ts`, then `pnpm assets:generate` from the repo root. The importer packs/resamples the authored frames into `brianbi.png` (eight direction columns × five animation rows), at a common scale and foot baseline.
