import { VIRTUAL_W, VIRTUAL_H } from '../constants.js';

// Pause overlays the previous state and resumes on any confirm.
export class PauseState {
  constructor(previous) {
    this.previous = previous;
  }

  enter(game) {
    game.audio.stopMusic();
  }

  tick(game) {
    if (game.input.anyConfirm() || game.input.anyPause()) {
      // Resume by re-setting the previous state object (no re-init needed).
      game.setState(this.previous);
    }
  }

  draw(game, ctx) {
    // Draw the previous state's snapshot underneath
    if (this.previous?.draw) this.previous.draw(game, ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
    const pausedImg = game.assets.img('paused');
    if (pausedImg) {
      const w = 320, h = 160;
      ctx.drawImage(pausedImg, (VIRTUAL_W - w) / 2, (VIRTUAL_H - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 64px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', VIRTUAL_W / 2, VIRTUAL_H / 2);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#ccc';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Press Enter or Esc to resume', VIRTUAL_W / 2, VIRTUAL_H / 2 + 100);
    ctx.textAlign = 'left';
  }
}
