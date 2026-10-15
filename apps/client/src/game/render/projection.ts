// Camera projection constants shared by gameplay overlays and the renderer. This is the neutral
// (pre-overhaul) version for the classic top-down renderer: no ground squash. The art overhaul
// replaces it with its own values (e.g. GROUND_Y = 0.6 for the shallow camera).
export const GROUND_Y = 1;
export const UPRIGHT_Y = 1 / GROUND_Y;
export const CAMERA_ZOOM = 3;
