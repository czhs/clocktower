// packages/core/src/presence/LocalPresence.ts
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { spliceOne } from "../utils/Utils.mjs";
import { isDevMode } from "../utils/DevMode.mjs";
var DEVMODE_CACHE_FILE_PATH = path.resolve(".devmode.json");
var LocalPresence = class {
  constructor() {
    this.subscriptions = new EventEmitter();
    this.data = {};
    this.hash = {};
    this.keys = {};
    this.timeouts = {};
    if (isDevMode && fs.existsSync(DEVMODE_CACHE_FILE_PATH)) {
      const cache = fs.readFileSync(DEVMODE_CACHE_FILE_PATH).toString("utf-8") || "{}";
      const parsed = JSON.parse(cache);
      if (parsed.data) {
        this.data = parsed.data;
      }
      if (parsed.hash) {
        this.hash = parsed.hash;
      }
      if (parsed.keys) {
        this.keys = parsed.keys;
      }
    }
  }
  subscribe(topic, callback) {
    this.subscriptions.on(topic, callback);
    return Promise.resolve(this);
  }
  unsubscribe(topic, callback) {
    if (callback) {
      this.subscriptions.removeListener(topic, callback);
    } else {
      this.subscriptions.removeAllListeners(topic);
    }
    return this;
  }
  publish(topic, data) {
    this.subscriptions.emit(topic, data);
    return this;
  }
  async channels(pattern) {
    let eventNames = this.subscriptions.eventNames();
    if (pattern) {
      const regexp = new RegExp(
        pattern.replaceAll(".", "\\.").replaceAll("$", "\\$").replaceAll("*", ".*").replaceAll("?", "."),
        "gi"
      );
      eventNames = eventNames.filter((eventName) => regexp.test(eventName));
    }
    return eventNames;
  }
  async exists(key) {
    return this.keys[key] !== void 0 || this.data[key] !== void 0 || this.hash[key] !== void 0;
  }
  set(key, value) {
    this.keys[key] = value;
  }
  setex(key, value, seconds) {
    this.keys[key] = value;
    this.expire(key, seconds);
  }
  expire(key, seconds) {
    if (this.timeouts[key]) {
      clearTimeout(this.timeouts[key]);
    }
    this.timeouts[key] = setTimeout(() => {
      delete this.keys[key];
      delete this.timeouts[key];
    }, seconds * 1e3);
  }
  get(key) {
    return this.keys[key];
  }
  del(key) {
    delete this.keys[key];
    delete this.data[key];
    delete this.hash[key];
  }
  sadd(key, value) {
    if (!this.data[key]) {
      this.data[key] = [];
    }
    if (this.data[key].indexOf(value) === -1) {
      this.data[key].push(value);
    }
  }
  async smembers(key) {
    return this.data[key] || [];
  }
  async sismember(key, field) {
    return this.data[key] && this.data[key].includes(field) ? 1 : 0;
  }
  srem(key, value) {
    if (this.data[key]) {
      spliceOne(this.data[key], this.data[key].indexOf(value));
    }
  }
  scard(key) {
    return (this.data[key] || []).length;
  }
  async sinter(...keys) {
    const intersection = {};
    for (let i = 0, l = keys.length; i < l; i++) {
      (await this.smembers(keys[i])).forEach((member) => {
        if (!intersection[member]) {
          intersection[member] = 0;
        }
        intersection[member]++;
      });
    }
    return Object.keys(intersection).reduce((prev, curr) => {
      if (intersection[curr] > 1) {
        prev.push(curr);
      }
      return prev;
    }, []);
  }
  hset(key, field, value) {
    if (!this.hash[key]) {
      this.hash[key] = {};
    }
    this.hash[key][field] = value;
    return Promise.resolve(true);
  }
  hincrby(key, field, incrBy) {
    if (!this.hash[key]) {
      this.hash[key] = {};
    }
    let value = Number(this.hash[key][field] || "0");
    value += incrBy;
    this.hash[key][field] = value.toString();
    return Promise.resolve(value);
  }
  hincrbyex(key, field, incrBy, expireInSeconds) {
    if (!this.hash[key]) {
      this.hash[key] = {};
    }
    let value = Number(this.hash[key][field] || "0");
    value += incrBy;
    this.hash[key][field] = value.toString();
    if (this.timeouts[key]) {
      clearTimeout(this.timeouts[key]);
    }
    this.timeouts[key] = setTimeout(() => {
      delete this.hash[key];
      delete this.timeouts[key];
    }, expireInSeconds * 1e3);
    return Promise.resolve(value);
  }
  async hget(key, field) {
    return typeof this.hash[key] === "object" ? this.hash[key][field] ?? null : null;
  }
  async hgetall(key) {
    return this.hash[key] || {};
  }
  hdel(key, field) {
    const success = this.hash?.[key]?.[field] !== void 0;
    if (success) {
      delete this.hash[key][field];
    }
    return Promise.resolve(success);
  }
  async hlen(key) {
    return this.hash[key] && Object.keys(this.hash[key]).length || 0;
  }
  async incr(key) {
    if (!this.keys[key]) {
      this.keys[key] = 0;
    }
    this.keys[key]++;
    return Promise.resolve(this.keys[key]);
  }
  async decr(key) {
    if (!this.keys[key]) {
      this.keys[key] = 0;
    }
    this.keys[key]--;
    return Promise.resolve(this.keys[key]);
  }
  llen(key) {
    return Promise.resolve(this.data[key] && this.data[key].length || 0);
  }
  rpush(key, ...values) {
    if (!this.data[key]) {
      this.data[key] = [];
    }
    let lastLength = 0;
    values.forEach((value) => {
      lastLength = this.data[key].push(value);
    });
    return Promise.resolve(lastLength);
  }
  lpush(key, ...values) {
    if (!this.data[key]) {
      this.data[key] = [];
    }
    let lastLength = 0;
    values.forEach((value) => {
      lastLength = this.data[key].unshift(value);
    });
    return Promise.resolve(lastLength);
  }
  lpop(key) {
    return Promise.resolve(Array.isArray(this.data[key]) ? this.data[key].shift() : null);
  }
  rpop(key) {
    return Promise.resolve(this.data[key].pop());
  }
  brpop(...args) {
    const keys = args.slice(0, -1);
    const timeoutInSeconds = args[args.length - 1];
    const getFirstPopulated = () => {
      const keyWithValue = keys.find((key) => this.data[key] && this.data[key].length > 0);
      if (keyWithValue) {
        return [keyWithValue, this.data[keyWithValue].pop()];
      } else {
        return null;
      }
    };
    const firstPopulated = getFirstPopulated();
    if (firstPopulated) {
      return Promise.resolve(firstPopulated);
    } else {
      const maxRetries = timeoutInSeconds * 8;
      let tries = 0;
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          tries++;
          const firstPopulated2 = getFirstPopulated();
          if (firstPopulated2) {
            clearInterval(interval);
            return resolve(firstPopulated2);
          } else if (tries >= maxRetries) {
            clearInterval(interval);
            return resolve(null);
          }
        }, timeoutInSeconds * 1e3 / maxRetries);
      });
    }
  }
  setMaxListeners(number) {
    this.subscriptions.setMaxListeners(number);
  }
  shutdown() {
    if (isDevMode) {
      const cache = JSON.stringify({
        data: this.data,
        hash: this.hash,
        keys: this.keys
      });
      fs.writeFileSync(DEVMODE_CACHE_FILE_PATH, cache, { encoding: "utf-8" });
    }
  }
};
export {
  LocalPresence
};
