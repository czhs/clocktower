// OWNED BY lobby-auth (stub from lead, M0). One Colyseus room per lobby. Responsibilities:
// ticket auth, seat/member lifecycle, duplicate-device policy, reconnection, C2S validation via
// the protocol C2S map, dispatch to Game/World/Voice modules, per-client view fan-out.
import { Room, type Client } from '@colyseus/core';
import { getServices, type Services } from '../services.js';

export class GameRoom extends Room {
  override maxClients = 16;
  private services!: Services;

  override onCreate(_options: { lobbyId: string }) {
    this.services = getServices();
  }

  override onJoin(_client: Client) {}

  override onLeave(_client: Client) {}
}
