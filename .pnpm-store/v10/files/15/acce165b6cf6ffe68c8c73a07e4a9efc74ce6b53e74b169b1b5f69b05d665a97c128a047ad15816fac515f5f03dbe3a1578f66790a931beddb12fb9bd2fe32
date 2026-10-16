// src/Delayed.ts
var Type = /* @__PURE__ */ ((Type2) => {
  Type2[Type2["Interval"] = 0] = "Interval";
  Type2[Type2["Timeout"] = 1] = "Timeout";
  Type2[Type2["Async"] = 2] = "Async";
  return Type2;
})(Type || {});
var Delayed = class {
  constructor(handler, args, time, type) {
    this.active = true;
    this.paused = false;
    this.elapsedTime = 0;
    this.handler = handler;
    this.args = args;
    this.time = time;
    this.type = type;
  }
  tick(deltaTime) {
    if (this.paused) {
      return;
    }
    this.elapsedTime += deltaTime;
    if (this.elapsedTime >= this.time) {
      this.execute();
    }
  }
  execute() {
    this.handler.apply(this, this.args);
    switch (this.type) {
      case 1 /* Timeout */:
      case 2 /* Async */:
        this.active = false;
        break;
      case 0 /* Interval */:
        this.elapsedTime -= this.time;
        break;
    }
  }
  reset() {
    this.elapsedTime = 0;
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
  }
  clear() {
    this.active = false;
  }
};

// src/TimerClearedError.ts
var TimerClearedError = class extends Error {
  constructor() {
    super("Timer has been cleared");
  }
};

// node_modules/@colyseus/clock/build/index.mjs
var Clock = class {
  // number or NodeJS.Timer
  constructor(useInterval = false) {
    this.running = false;
    this.now = typeof window !== "undefined" && window.performance && window.performance.now && window.performance.now.bind(window.performance) || Date.now;
    this.start(useInterval);
  }
  start(useInterval = false) {
    this.deltaTime = 0;
    this.currentTime = this.now();
    this.elapsedTime = 0;
    this.running = true;
    if (useInterval) {
      this._interval = setInterval(this.tick.bind(this), 1e3 / 60);
    }
  }
  stop() {
    this.running = false;
    if (this._interval) {
      clearInterval(this._interval);
    }
  }
  tick(newTime = this.now()) {
    this.deltaTime = newTime - this.currentTime;
    this.currentTime = newTime;
    this.elapsedTime += this.deltaTime;
  }
};

// src/ClockTimer.ts
var ClockTimer = class extends Clock {
  constructor(autoStart = false) {
    super(autoStart);
    /**
     * An array of all the scheduled timeouts and intervals.
     * @private For compatibility it's public but avoid modifying it directly.
     */
    this.delayed = [];
  }
  /**
   * Re-evaluate all the scheduled timeouts and intervals and execute appropriate handlers.
   * Use this in your own context or not if your passed `autoStart` as `true` in the constructor.
   */
  tick() {
    super.tick();
    let delayedList = this.delayed;
    let i = delayedList.length;
    while (i--) {
      const delayed = delayedList[i];
      if (delayed.active) {
        delayed.tick(this.deltaTime);
      } else {
        delayedList.splice(i, 1);
        continue;
      }
    }
  }
  /**
   * Schedule a function to be called every `time` milliseconds.
   * This `time` minimum value will be tied to the `tick` method of the clock. This means if you use the default `autoStart` value from the constructor, the minimum value will be 16ms. Otherwise it will depend on your `tick` method call.
   *
   * Returns a {@link Delayed} object that can be used to clear the timeout or play around with it.
   */
  setInterval(handler, time, ...args) {
    const delayed = new Delayed(handler, args, time, 0 /* Interval */);
    this.delayed.push(delayed);
    return delayed;
  }
  /**
   * Schedule a function to be called after a delay.
   *
   * This `time` minimum value will be tied to the `tick` method of the clock. This means if you use the default `autoStart` value from the constructor, the minimum value will be 16ms. Otherwise it will depend on your `tick` method call.
   *
   * Returns a {@link Delayed} object that can be used to clear the timeout or play around with it.
   */
  setTimeout(handler, time, ...args) {
    const delayed = new Delayed(handler, args, time, 1 /* Timeout */);
    this.delayed.push(delayed);
    return delayed;
  }
  /**
   * A promise that schedule a timeout that will resolves after the given time.
   *
   * If the {@link Delayed} instance is cleared before the time, the promise will be rejected. This happens when the {@link ClockTimer.clear} method is called.
   *
   * For the sake of simplicity of this API, you can only cancel a timeout scheduled with this method with {@link ClockTimer.clear} method (which clears all scheduled timeouts and intervals).
   * If you need fine-tuned control over the timeout, use the {@link ClockTimer.setTimeout} method instead.
   *
   * @example **Inside an async function**
   * ```typescript
   * const timer = new Clock(true);
   * await timer.duration(1000);
   * console.log("1 second later");
   * ```
   *
   * @example **Using the promise**
   * ```typescript
   * const timer = new Clock(true);
   * timer.duration(1000).then(() => console.log("1 second later"));
   * ```
   *
   * @example **Using the promise with error**
   * ```typescript
   * const timer = new Clock(true);
   * timer.duration(1000).then(() => console.log("1 second later")).catch(() => console.log("Timer cleared"));
   * timer.clear();
   * ```
   *
   *
   * @param ms the duration in milliseconds in which the promise will be resolved
   */
  duration(ms) {
    return new Promise((resolve, reject) => {
      const delayed = new Delayed(resolve, void 0, ms, 2 /* Async */);
      delayed.clear = () => {
        delayed.active = false;
        reject(new TimerClearedError());
      };
      this.delayed.push(delayed);
    });
  }
  /**
   * Delete any scheduled timeout or interval. That will never be executed.
   *
   * If some of the timeouts/intervals are already executed, they will be removed from the list and callback will be garbage collected.
   * For timeout created with {@link ClockTimer.duration}, the promise will be rejected and therefore the unused resolving callback will be garbage collected.
   */
  clear() {
    let i = this.delayed.length;
    while (i--) {
      this.delayed[i].clear();
    }
    this.delayed = [];
  }
};

// src/index.ts
var src_default = ClockTimer;
export {
  Delayed,
  TimerClearedError,
  Type,
  src_default as default
};
