import type { DirectoryPhase } from './lobby.js';
import type { VoiceUsageView } from './voice.js';

// GET /api/admin/status (session account must be in ADMIN_ACCOUNT_IDS) -> AdminStatusView
// GET /healthz (public, no internals) -> { ok: true, env, version }

export interface AdminStatusView {
  env: string;
  version: string;
  uptimeSec: number;
  memory: { rssMb: number; heapUsedMb: number };
  cpu: { load1: number; cores: number };
  lobbies: { id: string; name: string; phase: DirectoryPhase; players: number; connected: number }[];
  voice: VoiceUsageView;
  recentErrors: { at: number; message: string }[];
}
