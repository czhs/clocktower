var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var Delayed_exports = {};
__export(Delayed_exports, {
  Delayed: () => Delayed,
  Type: () => Type
});
module.exports = __toCommonJS(Delayed_exports);
var Type = /* @__PURE__ */ ((Type2) => {
  Type2[Type2["Interval"] = 0] = "Interval";
  Type2[Type2["Timeout"] = 1] = "Timeout";
  Type2[Type2["Async"] = 2] = "Async";
  return Type2;
})(Type || {});
class Delayed {
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
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Delayed,
  Type
});
