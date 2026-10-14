import { z } from 'zod';
import { ChatText } from './text.js';

// Text chat follows the same audibility rules as voice: in-game messages are delivered only to
// members in the sender's acoustic zone (server-computed). 'lobby' scope is used while waiting.

export const ChatSendMsg = z.object({ text: ChatText });

export interface ChatMessage {
  id: string;
  fromPid: string | null;
  fromName: string;
  text: string;
  scope: 'lobby' | 'zone' | 'storyteller' | 'system';
  at: number;
}
