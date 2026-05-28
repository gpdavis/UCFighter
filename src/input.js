import { KEYS } from './constants.js';

// Keyboard state — tracks "down" and "pressed this tick" for edge-trigger checks.
export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();   // edge-triggered, cleared each tick
    this.released = new Set();

    window.addEventListener('keydown', (e) => {
      if (this.down.has(e.code)) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (this.shouldPreventDefault(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    // Clear state when window loses focus to prevent stuck keys
    window.addEventListener('blur', () => {
      this.down.clear();
      this.pressed.clear();
      this.released.clear();
    });
  }

  shouldPreventDefault(code) {
    // Block arrows + space from scrolling the page
    return code.startsWith('Arrow') || code === 'Space' || code === 'Tab';
  }

  // Call once per game tick AFTER all state updates have queried `pressed`.
  endTick() {
    this.pressed.clear();
    this.released.clear();
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  anyConfirm() {
    return KEYS.confirm.some(k => this.pressed.has(k));
  }
  anyPause() {
    return KEYS.pause.some(k => this.pressed.has(k));
  }

  // Convenience: player N's logical state this tick
  playerState(n) {
    const k = n === 1 ? KEYS.p1 : KEYS.p2;
    return {
      left: this.isDown(k.left),
      right: this.isDown(k.right),
      up: this.wasPressed(k.up),         // jump is edge-triggered
      attack1: this.wasPressed(k.attack1),
      attack2: this.wasPressed(k.attack2),
      attack3: this.wasPressed(k.attack3),
      attack4: this.wasPressed(k.attack4),
      block: this.isDown(k.block),
    };
  }
}
