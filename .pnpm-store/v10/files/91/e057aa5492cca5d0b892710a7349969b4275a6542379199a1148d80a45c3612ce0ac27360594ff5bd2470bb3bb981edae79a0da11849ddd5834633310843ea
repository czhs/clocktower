import { EventEmitter } from 'events';
import { Presence } from './Presence.js';
type Callback = (...args: any[]) => void;
export declare class LocalPresence implements Presence {
    subscriptions: EventEmitter<[never]>;
    data: {
        [roomName: string]: string[];
    };
    hash: {
        [roomName: string]: {
            [key: string]: string;
        };
    };
    keys: {
        [name: string]: string | number;
    };
    private timeouts;
    constructor();
    subscribe(topic: string, callback: (...args: any[]) => void): Promise<Awaited<this>>;
    unsubscribe(topic: string, callback?: Callback): this;
    publish(topic: string, data: any): this;
    channels(pattern?: string): Promise<string[]>;
    exists(key: string): Promise<boolean>;
    set(key: string, value: string): void;
    setex(key: string, value: string, seconds: number): void;
    expire(key: string, seconds: number): void;
    get(key: string): string | number;
    del(key: string): void;
    sadd(key: string, value: any): void;
    smembers(key: string): Promise<string[]>;
    sismember(key: string, field: string): Promise<0 | 1>;
    srem(key: string, value: any): void;
    scard(key: string): number;
    sinter(...keys: string[]): Promise<any[]>;
    hset(key: string, field: string, value: string): Promise<boolean>;
    hincrby(key: string, field: string, incrBy: number): Promise<number>;
    hincrbyex(key: string, field: string, incrBy: number, expireInSeconds: number): Promise<number>;
    hget(key: string, field: string): Promise<string>;
    hgetall(key: string): Promise<{
        [key: string]: string;
    }>;
    hdel(key: string, field: any): Promise<boolean>;
    hlen(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    decr(key: string): Promise<number>;
    llen(key: string): Promise<number>;
    rpush(key: string, ...values: string[]): Promise<number>;
    lpush(key: string, ...values: string[]): Promise<number>;
    lpop(key: string): Promise<string>;
    rpop(key: string): Promise<string | null>;
    brpop(...args: [...keys: string[], timeoutInSeconds: number]): Promise<[string, string] | null>;
    setMaxListeners(number: number): void;
    shutdown(): void;
}
export {};
