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
export {
  Delayed,
  Type
};
