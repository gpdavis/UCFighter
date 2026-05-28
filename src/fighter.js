import { Animator } from './anim.js';
import {
  CHARACTERS, POSES, HITBOX_Y_TOL, HIT_DAMAGE,
  WALK_SPEED, JUMP_VY, GRAVITY, GROUND_Y, VIRTUAL_W
} from './constants.js';

// Fighter represents one combatant. Mirrors the 0xB4-byte struct from the
// original binary as closely as is practical, but in JS-ergonomic form.
export class Fighter {
  constructor(charKey, playerNum) {
    const c = CHARACTERS[charKey];
    this.char = charKey;
    this.playerNum = playerNum;       // 1 or 2
    this.x = playerNum === 1 ? 200 : VIRTUAL_W - 200;
    this.y = GROUND_Y;
    this.vy = 0;
    this.facingLeft = playerNum === 2;
    this.hp = c.maxHp;
    this.maxHp = c.maxHp;
    // Per-attack damage scaling: the original "stats" tuple gates attack reach.
    // We use it as both the lateral attack reach and damage scale.
    this.attackReach = c.stats.slice();   // [a1, a2, a3, a4] reach in px
    this.anim = new Animator();
    this.anim.setPose('Stance');
    this.controlsLocked = false;
    this.activeAttack = null;             // 1..4 if currently attacking
    this.attackHasHit = false;            // 1 hit per attack
    this.blocking = false;
    this.defeated = false;
    this.fataled = false;
    this.victorious = false;
  }

  faceTowards(otherX) {
    if (this.controlsLocked) return;
    this.facingLeft = otherX < this.x;
  }

  // Called once per game tick by MatchState.
  tick(input, opponent) {
    this.anim.tick();

    if (this.defeated || this.victorious) {
      this.gravity();
      return;
    }

    // Update facing if not mid-attack
    if (!this.activeAttack) this.faceTowards(opponent.x);

    // Mid-attack: just tick animation; finalize when done
    if (this.activeAttack) {
      if (this.anim.isDone()) {
        this.activeAttack = null;
        this.attackHasHit = false;
        this.anim.setPose('Stance');
      }
      this.gravity();
      return;
    }

    // Block: hold-to-block, full immunity
    this.blocking = input.block;
    if (this.blocking) {
      this.anim.setPose('Block');
      this.gravity();
      return;
    }

    // Attacks (edge-triggered)
    const attackIdx = input.attack1 ? 1 : input.attack2 ? 2 : input.attack3 ? 3 : input.attack4 ? 4 : 0;
    if (attackIdx) {
      this.activeAttack = attackIdx;
      this.attackHasHit = false;
      this.anim.setPose(`Attack${attackIdx}`);
      this.gravity();
      return;
    }

    // Jump (edge-triggered)
    if (input.up && this.y >= GROUND_Y) {
      this.vy = JUMP_VY;
    }

    // Movement
    const moving = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (moving !== 0 && this.y >= GROUND_Y) {
      this.x += moving * WALK_SPEED;
      this.anim.setPose('Walk');
    } else if (this.y < GROUND_Y) {
      this.anim.setPose('Stance');
    } else {
      this.anim.setPose('Stance');
    }

    // Clamp to arena
    this.x = Math.max(80, Math.min(VIRTUAL_W - 80, this.x));

    this.gravity();
  }

  gravity() {
    if (this.y < GROUND_Y || this.vy !== 0) {
      this.vy += GRAVITY;
      this.y += this.vy;
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
      }
    }
  }

  // Check if `this` is hitting `target` this frame. Returns damage to apply.
  // Mirrors design spec §9: ±70 Y tolerance, lateral reach = attack stat.
  computeHitDamage(target) {
    if (!this.activeAttack || this.attackHasHit) return 0;
    const reach = this.attackReach[this.activeAttack - 1];
    const dx = target.x - this.x;
    const wantsLeft = this.facingLeft;
    const targetInFront = wantsLeft ? dx < 0 : dx > 0;
    if (!targetInFront) return 0;
    if (Math.abs(dx) > reach) return 0;
    if (Math.abs(target.y - this.y) > HITBOX_Y_TOL) return 0;
    // The active-frame window: middle third of the attack animation
    const p = this.anim.progress();
    if (p < 0.25 || p > 0.75) return 0;
    return HIT_DAMAGE;
  }

  takeHit(dmg, fromX) {
    if (this.blocking) return false;
    this.hp = Math.max(0, this.hp - dmg);
    // Tiny knockback impulse
    this.x += (fromX < this.x ? 1 : -1) * 4;
    return true;
  }

  setDefeated() {
    this.defeated = true;
    this.controlsLocked = true;
    this.anim.setPose('Defeat');
  }

  setVictorious() {
    this.victorious = true;
    this.controlsLocked = true;
    this.anim.setPose('Victory');
  }

  triggerFatality() {
    this.fataled = true;
    this.controlsLocked = true;
    this.anim.setPose('Fatality');
  }
}
