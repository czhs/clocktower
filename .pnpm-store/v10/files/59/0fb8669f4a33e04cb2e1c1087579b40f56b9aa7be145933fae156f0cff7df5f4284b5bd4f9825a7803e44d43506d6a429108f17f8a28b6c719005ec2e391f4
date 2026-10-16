import { Presence } from './presence/Presence.js';
export declare function requestFromIPC<T>(presence: Presence, publishToChannel: string, method: string, args: any[], rejectionTimeout?: number): Promise<T>;
export declare function subscribeIPC(presence: Presence, channel: string, replyCallback: (method: string, args: any[]) => any): Promise<void>;
/**
 * Wait for a room creation notification via presence publish/subscribe
 */
export declare function subscribeWithTimeout(presence: Presence, channel: string, timeout: number): Promise<string>;
