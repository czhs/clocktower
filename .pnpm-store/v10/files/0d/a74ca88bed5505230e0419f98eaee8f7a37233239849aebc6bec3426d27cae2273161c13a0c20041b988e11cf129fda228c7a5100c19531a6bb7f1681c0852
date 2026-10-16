// src/index.ts
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
export {
  Clock as default
};
