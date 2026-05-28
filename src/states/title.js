import { VIRTUAL_W, VIRTUAL_H } from '../constants.js';

// Title screen: shows the "UC FIGHTER" logo art. Press any key to enter character select.
export class TitleState {
  constructor() {
    this.ticks = 0;
    this.musicStarted = false;
  }

  enter(game) {
    this.ticks = 0;
    if (!this.musicStarted) {
      // intro.wav was the original splash sound; play once on first entry
      game.audio.play('intro_wav', { volume: 0.6 });
      this.musicStarted = true;
    }
  }

  tick(game) {
    this.ticks++;
    if (game.input.anyConfirm() || game.input.wasPressed('Space')) {
      // Dynamic import to break circular dep
      import('./select.js').then(m => game.setState(new m.SelectState()));
    }
  }

  draw(game, ctx) {
    game.drawFullscreen('ucfighter');
    // Pulsing "Press Enter to start"
    const pulse = (Math.sin(this.ticks * 0.1) + 1) * 0.5;
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = `rgba(255, ${Math.floor(170 + 85 * pulse)}, 0, ${0.6 + 0.4 * pulse})`;
    ctx.textAlign = 'center';
    ctx.fillText('PRESS ENTER TO START', VIRTUAL_W / 2, VIRTUAL_H - 60);
    ctx.textAlign = 'left';
  }
}
