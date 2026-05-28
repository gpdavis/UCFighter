import { VIRTUAL_W, VIRTUAL_H, ROUND_BANNER, GROUND_Y } from '../constants.js';
import { Fighter } from '../fighter.js';
import { drawSpriteCell } from '../anim.js';

// MatchState runs one full match: best-of-3 rounds. Within a round the phases are:
//   intro (round banner) -> "FIGHT!" -> live combat -> KO -> next round | match end
const PHASE = {
  ROUND_INTRO: 'round_intro',
  FIGHT_CALL: 'fight_call',
  LIVE: 'live',
  KO: 'ko',
  ROUND_END: 'round_end',
  MATCH_END: 'match_end',
};

export class MatchState {
  constructor() {
    this.p1 = null;
    this.p2 = null;
    this.phase = PHASE.ROUND_INTRO;
    this.phaseTicks = 0;
    this.bgKey = 'background1';
    this.bgScroll = 0;
  }

  enter(game) {
    const s = game.session;
    this.p1 = new Fighter(s.p1Char, 1);
    this.p2 = new Fighter(s.p2Char, 2);
    this.bgKey = `background${((s.round - 1) % 3) + 1}`;
    this.phase = PHASE.ROUND_INTRO;
    this.phaseTicks = 0;
    const announce = `round${s.round}_wav`;
    game.audio.play(announce, { volume: 0.9 });
  }

  tick(game) {
    this.phaseTicks++;

    if (game.input.anyPause()) {
      import('./pause.js').then(m => game.setState(new m.PauseState(this)));
      return;
    }

    switch (this.phase) {
      case PHASE.ROUND_INTRO:
        this.p1.anim.tick();
        this.p2.anim.tick();
        if (this.phaseTicks >= ROUND_BANNER.FIGHT_CALL) {
          this.phase = PHASE.FIGHT_CALL;
          this.phaseTicks = 0;
          game.audio.play('fight_wav', { volume: 0.9 });
        }
        break;

      case PHASE.FIGHT_CALL:
        this.p1.anim.tick();
        this.p2.anim.tick();
        if (this.phaseTicks >= ROUND_BANNER.FIGHT_BEGIN - ROUND_BANNER.FIGHT_CALL) {
          this.phase = PHASE.LIVE;
          this.phaseTicks = 0;
        }
        break;

      case PHASE.LIVE: {
        const i1 = game.input.playerState(1);
        const i2 = game.input.playerState(2);
        this.p1.tick(i1, this.p2);
        this.p2.tick(i2, this.p1);
        this.resolveHits(game);

        if (this.p1.hp <= 0 || this.p2.hp <= 0) {
          const loser = this.p1.hp <= 0 ? this.p1 : this.p2;
          const winner = loser === this.p1 ? this.p2 : this.p1;
          loser.setDefeated();
          winner.setVictorious();
          this.phase = PHASE.KO;
          this.phaseTicks = 0;
          this.koWinner = winner;
          this.koLoser = loser;
        }
        break;
      }

      case PHASE.KO:
        this.p1.anim.tick();
        this.p2.anim.tick();
        // Fatality window: winner can press attack4 to trigger fatality
        if (this.phaseTicks < ROUND_BANNER.FATALITY_WINDOW) {
          const i = game.input.playerState(this.koWinner.playerNum);
          if (i.attack4 && !this.koWinner.fataled) {
            this.koLoser.triggerFatality();
            game.audio.play('awesomedeath', { volume: 1 });
          }
        }
        if (this.phaseTicks >= ROUND_BANNER.NEXT_ROUND) {
          this.endRound(game);
        }
        break;
    }
  }

  resolveHits(game) {
    const tryHit = (attacker, target) => {
      const dmg = attacker.computeHitDamage(target);
      if (dmg > 0) {
        const hit = target.takeHit(dmg, attacker.x);
        if (hit) {
          attacker.attackHasHit = true;
          game.audio.play('hit', { volume: 0.6 });
          if (target.hp < target.maxHp * 0.3) game.audio.play('hurt', { volume: 0.6 });
        } else {
          // Blocked
          game.audio.play('miss', { volume: 0.4 });
        }
      }
    };
    tryHit(this.p1, this.p2);
    tryHit(this.p2, this.p1);
  }

  endRound(game) {
    const winner = this.koWinner;
    if (winner === this.p1) game.session.p1Wins++; else game.session.p2Wins++;
    game.session.round++;
    if (game.session.p1Wins >= 2 || game.session.p2Wins >= 2 || game.session.round > 3) {
      this.phase = PHASE.MATCH_END;
      this.phaseTicks = 0;
      // Linger briefly then go back to title
      setTimeout(() => {
        import('./title.js').then(m => game.setState(new m.TitleState()));
      }, 4000);
    } else {
      // Start the next round in-place
      this.enter(game);
    }
  }

  // === Drawing ===
  draw(game, ctx) {
    // Background — original is 2048×1024; scale to canvas
    const bg = game.assets.img(this.bgKey);
    if (bg) ctx.drawImage(bg, 0, 0, VIRTUAL_W, VIRTUAL_H);
    else { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H); }

    this.drawFighter(game, ctx, this.p1);
    this.drawFighter(game, ctx, this.p2);
    this.drawHud(game, ctx);
    this.drawPhaseBanner(game, ctx);
  }

  drawFighter(game, ctx, f) {
    const poseKey = f.anim.pose;
    const sheet = game.assets.img(`${f.char}_${poseKey}`);
    const drawW = 200, drawH = 200;
    const dx = f.x - drawW / 2;
    const dy = f.y - drawH;
    const frame = f.anim.currentFrame();
    drawSpriteCell(ctx, sheet, frame, dx, dy, drawW, drawH, f.facingLeft);

    // Floor shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND_Y + 4, 40, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHud(game, ctx) {
    const barW = 320, barH = 24, padY = 20;
    // Backplate
    ctx.fillStyle = '#222';
    ctx.fillRect(20, padY, barW, barH);
    ctx.fillRect(VIRTUAL_W - 20 - barW, padY, barW, barH);

    // HP fills
    const hp1Pct = this.p1.hp / this.p1.maxHp;
    const hp2Pct = this.p2.hp / this.p2.maxHp;
    ctx.fillStyle = '#ff3030';
    ctx.fillRect(20, padY, barW * hp1Pct, barH);
    ctx.fillRect(VIRTUAL_W - 20 - barW * hp2Pct, padY, barW * hp2Pct, barH);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, padY, barW, barH);
    ctx.strokeRect(VIRTUAL_W - 20 - barW, padY, barW, barH);

    // Player labels + round pips
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(this.p1.char.toUpperCase(), 20, padY - 4);
    ctx.textAlign = 'right';
    ctx.fillText(this.p2.char.toUpperCase(), VIRTUAL_W - 20, padY - 4);
    ctx.textAlign = 'left';

    // Round wins (pips)
    for (let i = 0; i < game.session.p1Wins; i++) {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(20 + barW + 14 + i * 18, padY + barH / 2, 6, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < game.session.p2Wins; i++) {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(VIRTUAL_W - 20 - barW - 14 - i * 18, padY + barH / 2, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawPhaseBanner(game, ctx) {
    const drawCenter = (imgKey) => {
      const img = game.assets.img(imgKey);
      if (!img) return;
      const w = 320, h = 320;
      ctx.drawImage(img, (VIRTUAL_W - w) / 2, (VIRTUAL_H - h) / 2 - 40, w, h);
    };
    if (this.phase === PHASE.ROUND_INTRO) {
      const r = game.session.round;
      drawCenter(`round${r}`);
    } else if (this.phase === PHASE.FIGHT_CALL) {
      drawCenter('fight');
    } else if (this.phase === PHASE.KO) {
      drawCenter('victory');
      if (this.phaseTicks < ROUND_BANNER.FATALITY_WINDOW) {
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('FATALITY: press your Attack4', VIRTUAL_W / 2, VIRTUAL_H - 50);
        ctx.textAlign = 'left';
      }
    } else if (this.phase === PHASE.MATCH_END) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      const winner = game.session.p1Wins > game.session.p2Wins ? 'PLAYER 1' : 'PLAYER 2';
      ctx.fillText(`${winner} WINS THE MATCH`, VIRTUAL_W / 2, VIRTUAL_H / 2);
      ctx.textAlign = 'left';
    }
  }
}
