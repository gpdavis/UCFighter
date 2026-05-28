import { VIRTUAL_W, VIRTUAL_H, ROSTER, CHARACTERS, KEYS } from '../constants.js';

// Character select: two cursors (P1, P2). Each player picks with their move keys
// and confirms with their attack1 key. When both have locked in, start match.
export class SelectState {
  constructor() {
    this.p1Idx = 0;
    this.p2Idx = ROSTER.length - 1;
    this.p1Locked = false;
    this.p2Locked = false;
    this.ticks = 0;
  }

  enter(game) {
    this.ticks = 0;
    this.p1Locked = false;
    this.p2Locked = false;
    game.audio.play('select', { volume: 0.6 });
  }

  tick(game) {
    this.ticks++;
    const input = game.input;

    if (!this.p1Locked) {
      if (input.wasPressed(KEYS.p1.left))  { this.p1Idx = (this.p1Idx + ROSTER.length - 1) % ROSTER.length; game.audio.play('select'); }
      if (input.wasPressed(KEYS.p1.right)) { this.p1Idx = (this.p1Idx + 1) % ROSTER.length; game.audio.play('select'); }
      if (input.wasPressed(KEYS.p1.attack1) || input.anyConfirm()) {
        this.p1Locked = true;
        game.audio.play('selected', { volume: 0.8 });
      }
    }
    if (!this.p2Locked) {
      if (input.wasPressed(KEYS.p2.left))  { this.p2Idx = (this.p2Idx + ROSTER.length - 1) % ROSTER.length; game.audio.play('select'); }
      if (input.wasPressed(KEYS.p2.right)) { this.p2Idx = (this.p2Idx + 1) % ROSTER.length; game.audio.play('select'); }
      if (input.wasPressed(KEYS.p2.attack1)) {
        this.p2Locked = true;
        game.audio.play('selected', { volume: 0.8 });
      }
    }

    if (input.anyPause()) {
      import('./title.js').then(m => game.setState(new m.TitleState()));
      return;
    }

    if (this.p1Locked && this.p2Locked) {
      game.session.p1Char = ROSTER[this.p1Idx];
      game.session.p2Char = ROSTER[this.p2Idx];
      game.session.p1Wins = 0;
      game.session.p2Wins = 0;
      game.session.round = 1;
      import('./match.js').then(m => game.setState(new m.MatchState()));
    }
  }

  draw(game, ctx) {
    // Solid backdrop with a faint title art behind
    ctx.fillStyle = '#101020';
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('CHARACTER SELECT', VIRTUAL_W / 2, 60);

    // Player labels
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#ffaa00';
    ctx.fillText('PLAYER 1', VIRTUAL_W * 0.25, 110);
    ctx.fillStyle = '#00aaff';
    ctx.fillText('PLAYER 2', VIRTUAL_W * 0.75, 110);

    this.drawCursor(game, ctx, this.p1Idx, this.p1Locked, VIRTUAL_W * 0.25, 280, '#ffaa00');
    this.drawCursor(game, ctx, this.p2Idx, this.p2Locked, VIRTUAL_W * 0.75, 280, '#00aaff');

    // Roster row at bottom
    const slotW = 200;
    const startX = VIRTUAL_W / 2 - (ROSTER.length * slotW) / 2;
    const y = VIRTUAL_H - 180;
    ROSTER.forEach((c, i) => {
      const x = startX + i * slotW + slotW / 2;
      this.drawThumb(game, ctx, c, x, y, 128, i === this.p1Idx || i === this.p2Idx);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px Arial';
      ctx.fillText(c.toUpperCase(), x, y + 100);
    });

    ctx.textAlign = 'left';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#aaa';
    ctx.fillText('P1: Arrows / Numpad1   P2: A/D / T', 20, VIRTUAL_H - 20);
  }

  drawCursor(game, ctx, charIdx, locked, cx, cy, color) {
    const char = ROSTER[charIdx];
    const thumb = game.assets.img(`${char}_thumb1`);
    if (thumb) {
      ctx.save();
      if (locked) ctx.globalAlpha = 1.0;
      ctx.drawImage(thumb, cx - 100, cy - 100, 200, 200);
      ctx.restore();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = locked ? 6 : 3;
    ctx.strokeRect(cx - 100, cy - 100, 200, 200);
    if (locked) {
      ctx.fillStyle = color;
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('LOCKED IN', cx, cy + 130);
    }
  }

  drawThumb(game, ctx, charKey, cx, cy, size, highlight) {
    const thumb = game.assets.img(`${charKey}_thumb2`) || game.assets.img(`${charKey}_thumb1`);
    if (thumb) ctx.drawImage(thumb, cx - size / 2, cy - size / 2, size, size);
    ctx.strokeStyle = highlight ? '#fff' : '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
  }
}
