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
var src_exports = {};
__export(src_exports, {
  default: () => Clock
});
module.exports = __toCommonJS(src_exports);
class Clock {
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
}
