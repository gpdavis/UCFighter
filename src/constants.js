// Game constants extracted from the decompiled UCFighter.exe.
// See DESIGN_SPEC.md for sourcing detail.

export const VIRTUAL_W = 800;
export const VIRTUAL_H = 600;

// Original game runs at 50 FPS (20ms WM_TIMER).
export const TICK_MS = 20;

// Character roster — stat tuples confirmed via Ghidra decompile.
// (hp, stat1, stat2, stat3, stat4, maxHp) where stat fields drive attack damage / range.
export const CHARACTERS = {
  rob:   { name: 'rob',   hp: 500, stats: [30, 50, 75, 100], maxHp: 100 },
  geoff: { name: 'geoff', hp: 500, stats: [50, 75, 75, 75],  maxHp: 100 },
  trev:  { name: 'trev',  hp: 500, stats: [70, 75, 75, 50],  maxHp: 100 },
};

export const ROSTER = ['rob', 'geoff', 'trev'];

// Sprite sheet frame layouts. Each cell is 512×512.
// poses: { sheetWidth, frameCount, sequence (frames to play in order) }
const ATTACK_SEQ = [0, 1, 2, 3, 2, 1, 0];           // 7-frame boomerang
const WALK_SEQ   = [0, 1, 2, 3, 2, 1, 6, 0];        // 8-frame walk (frame 6 used for snapback)
const STANCE_SEQ = [0, 1, 2, 3];                    // 4-frame idle loop
const FATALITY_SEQ = [0, 1, 2, 3, 4, 5, 6, 7];      // 8-frame fatality

export const POSES = {
  Stance:   { columns: 4, sequence: STANCE_SEQ,   ticksPerFrame: 8,  loop: true  },
  Walk:     { columns: 4, sequence: WALK_SEQ,     ticksPerFrame: 4,  loop: true  },
  Block:    { columns: 1, sequence: [0],          ticksPerFrame: 1,  loop: true  },
  Attack1:  { columns: 4, sequence: ATTACK_SEQ,   ticksPerFrame: 3,  loop: false },
  Attack2:  { columns: 4, sequence: ATTACK_SEQ,   ticksPerFrame: 3,  loop: false },
  Attack3:  { columns: 4, sequence: ATTACK_SEQ,   ticksPerFrame: 3,  loop: false },
  Attack4:  { columns: 4, sequence: ATTACK_SEQ,   ticksPerFrame: 3,  loop: false },
  Victory:  { columns: 1, sequence: [0],          ticksPerFrame: 1,  loop: true  },
  Defeat:   { columns: 1, sequence: [0],          ticksPerFrame: 1,  loop: true  },
  Fatality: { columns: 8, sequence: FATALITY_SEQ, ticksPerFrame: 6,  loop: false },
};

// Hitbox tolerance — design spec §9 "±70 Y".
export const HITBOX_Y_TOL = 70;

// Per-frame damage when an attack connects (design spec §9).
export const HIT_DAMAGE = 4;

// Round timing markers in game ticks (50 Hz). Design spec §8.
export const ROUND_BANNER = {
  ROUND_CALL: 30,     // show "ROUND N"
  FIGHT_CALL: 70,     // show "FIGHT!"
  FIGHT_BEGIN: 120,   // controls unlocked
  FATALITY_WINDOW: 150, // brief window after KO where heavy attack triggers fatality
  DEFEAT_FINAL: 400,  // end of defeat animation
  NEXT_ROUND: 600,    // auto-advance to next round
};

// Movement physics
export const WALK_SPEED = 3.5;         // pixels per tick
export const JUMP_VY = -12;            // initial jump velocity
export const GRAVITY = 0.6;            // tick-squared
export const GROUND_Y = 460;           // floor line for fighters (sprite anchor)

// Input — see DESIGN_SPEC.md §6
export const KEYS = {
  p1: {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    attack1: 'Numpad1',
    attack2: 'Numpad2',
    attack3: 'Numpad3',
    attack4: 'Numpad0',
    block: 'NumpadDecimal',
  },
  p2: {
    left: 'KeyA',
    right: 'KeyD',
    up: 'KeyW',
    attack1: 'KeyT',
    attack2: 'KeyY',
    attack3: 'KeyU',
    attack4: 'KeyG',
    block: 'KeyH',
  },
  confirm: ['Enter', 'Space'],
  pause: ['Escape'],
};

// Game-screen states
export const STATE = {
  TITLE: 'title',
  INTRO: 'intro',
  SELECT: 'select',
  MATCH: 'match',
  PAUSE: 'pause',
  CREDITS: 'credits',
};
