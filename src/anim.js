import { POSES } from './constants.js';

// Resolves "given pose + tick", which sprite-sheet frame to draw.
// Sheet layout: all frames are 512px tall; columns count varies per pose.
export class Animator {
  constructor() {
    this.pose = 'Stance';
    this.ticksInPose = 0;
    this.done = false;
  }

  setPose(pose) {
    if (this.pose === pose) return;
    this.pose = pose;
    this.ticksInPose = 0;
    this.done = false;
  }

  tick() {
    if (this.done) return;
    this.ticksInPose++;
    const def = POSES[this.pose];
    if (!def) return;
    const totalTicks = def.sequence.length * def.ticksPerFrame;
    if (!def.loop && this.ticksInPose >= totalTicks) {
      this.done = true;
    }
  }

  // 0..len-1 — which entry of the sequence is currently showing
  currentSequenceIndex() {
    const def = POSES[this.pose];
    if (!def) return 0;
    const total = def.sequence.length;
    let i = Math.floor(this.ticksInPose / def.ticksPerFrame);
    if (def.loop) i = i % total;
    if (i >= total) i = total - 1;
    return i;
  }

  // Frame index inside the sprite sheet's columns (0..columns-1)
  currentFrame() {
    const def = POSES[this.pose];
    if (!def) return 0;
    return def.sequence[this.currentSequenceIndex()];
  }

  // Normalised progress 0..1 through the whole animation
  progress() {
    const def = POSES[this.pose];
    if (!def) return 0;
    const total = def.sequence.length * def.ticksPerFrame;
    return Math.min(1, this.ticksInPose / total);
  }

  isDone() { return this.done; }
}

// Draw one cell from a horizontal sprite sheet. frameW defaults to 512.
export function drawSpriteCell(ctx, img, frameIndex, dx, dy, dw, dh, flipX = false, frameW = 512, frameH = 512) {
  if (!img) return;
  const sx = frameIndex * frameW;
  if (flipX) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, 0, frameW, frameH, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(img, sx, 0, frameW, frameH, dx, dy, dw, dh);
  }
}
