import { TICK_MS, VIRTUAL_W, VIRTUAL_H } from './constants.js';

// Game is a thin state-machine + fixed-step ticker. Each "state" object
// implements: enter(game), exit(game), tick(game), draw(game, ctx).
export class Game {
  constructor({ canvas, ctx, assets, audio, input }) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.assets = assets;
    this.audio = audio;
    this.input = input;

    this.state = null;
    this.pendingState = null;
    this.pendingStateArgs = null;

    // Persistent across-state data
    this.session = {
      p1Char: null,
      p2Char: null,
      p1Wins: 0,
      p2Wins: 0,
      round: 1,
    };

    this._lastTime = 0;
    this._accumulator = 0;
    this._running = false;
  }

  setState(stateInstance, args) {
    this.pendingState = stateInstance;
    this.pendingStateArgs = args;
  }

  _applyPending() {
    if (this.pendingState) {
      if (this.state?.exit) this.state.exit(this);
      this.state = this.pendingState;
      const args = this.pendingStateArgs;
      this.pendingState = null;
      this.pendingStateArgs = null;
      if (this.state.enter) this.state.enter(this, args);
    }
  }

  start(initialState) {
    this.setState(initialState);
    this._applyPending();
    this._running = true;
    this._lastTime = performance.now();
    requestAnimationFrame(this._frame.bind(this));
  }

  _frame(now) {
    if (!this._running) return;
    const elapsed = Math.min(100, now - this._lastTime);  // clamp to avoid spiral-of-death
    this._lastTime = now;
    this._accumulator += elapsed;

    while (this._accumulator >= TICK_MS) {
      this._accumulator -= TICK_MS;
      this._tick();
    }
    this._draw();
    requestAnimationFrame(this._frame.bind(this));
  }

  _tick() {
    this._applyPending();
    if (this.state?.tick) this.state.tick(this);
    this.input.endTick();
  }

  _draw() {
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, VIRTUAL_W, VIRTUAL_H);
    if (this.state?.draw) this.state.draw(this, this.ctx);
  }

  // Helper for states: stretch-draw a 24bpp background image to fill the screen.
  drawFullscreen(imgKey) {
    const img = this.assets.img(imgKey);
    if (!img) return;
    this.ctx.drawImage(img, 0, 0, VIRTUAL_W, VIRTUAL_H);
  }
}
