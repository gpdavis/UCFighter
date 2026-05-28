import { ROSTER } from './constants.js';

const BASE = 'assets/data';

// Manifest of every asset the game loads. Order is roughly load-priority.
function buildManifest() {
  const m = [];
  const img = (key, path) => m.push({ kind: 'img', key, path: `${BASE}/${path}` });
  const snd = (key, path) => m.push({ kind: 'snd', key, path: `${BASE}/${path}` });

  // UI / screens
  img('intro',       'intro.png');
  img('ucfighter',   'ucfighter.png');
  img('uclogo',      'uclogo.png');
  img('credits',     'credits.png');
  img('help',        'help.png');
  img('paused',      'paused.png');
  img('preloading',  'preloading.png');
  img('leftArrow',   'leftArrow.png');
  img('rightArrow',  'rightArrow.png');

  // Level overlays
  img('round1',      'levelData/round1.png');
  img('round2',      'levelData/round2.png');
  img('round3',      'levelData/round3.png');
  img('fight',       'levelData/fight.png');
  img('victory',     'levelData/victory.png');
  img('bar',         'levelData/bar.png');
  img('barback',     'levelData/barback.png');
  img('player1Lbl',  'levelData/player1.png');
  img('player2Lbl',  'levelData/player2.png');
  img('background1', 'levelData/background1.png');
  img('background2', 'levelData/background2.png');
  img('background3', 'levelData/background3.png');

  // Player sprites
  for (const c of ROSTER) {
    const poses = ['Stance', 'Walk', 'Block', 'Attack1', 'Attack2', 'Attack3', 'Attack4', 'Defeat', 'Victory', 'Fatality'];
    for (const p of poses) {
      img(`${c}_${p}`, `playerData/${c}/${p}.png`);
    }
    img(`${c}_thumb1`, `playerData/${c}/thumbnail1.png`);
    img(`${c}_thumb2`, `playerData/${c}/thumbnail2.png`);
  }
  img('blood', 'playerData/blood.png');

  // Sounds — UI
  snd('intro_wav',    'intro.wav');
  snd('select',       'levelData/Select.wav');
  snd('selected',     'levelData/selected.wav');
  // Round announcements
  snd('round1_wav',   'levelData/Round1.wav');
  snd('round2_wav',   'levelData/Round2.wav');
  snd('round3_wav',   'levelData/Round3.wav');
  snd('fight_wav',    'levelData/Fight.wav');
  snd('awesomedeath', 'levelData/awesomedeath.wav');
  // Combat hits
  snd('hit',          'levelData/hit.wav');
  snd('miss',         'levelData/Miss.wav');
  // Per-character voice (shared in original)
  snd('hurt',         'playerData/hurt.wav');
  snd('agony',        'playerData/agony.wav');
  snd('excert',       'playerData/excert.wav');

  return m;
}

export class AssetLoader {
  constructor() {
    this.images = new Map();
    this.sounds = new Map();
    this.failed = [];
  }

  async loadAll(onProgress) {
    const manifest = buildManifest();
    let loaded = 0;
    const total = manifest.length;

    await Promise.all(manifest.map(item =>
      this.loadOne(item).then(() => {
        loaded++;
        onProgress?.(loaded, total, item.path);
      })
    ));

    return { loaded, total, failed: this.failed.slice() };
  }

  loadOne(item) {
    if (item.kind === 'img') {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { this.images.set(item.key, img); resolve(); };
        img.onerror = () => { this.failed.push(item.path); resolve(); };
        img.src = item.path;
      });
    } else {
      return new Promise((resolve) => {
        const audio = new Audio();
        audio.oncanplaythrough = () => { this.sounds.set(item.key, audio); resolve(); };
        audio.onerror = () => { this.failed.push(item.path); resolve(); };
        audio.preload = 'auto';
        audio.src = item.path;
        // canplaythrough sometimes never fires; fall back after a delay
        setTimeout(() => {
          if (!this.sounds.has(item.key) && !this.failed.includes(item.path)) {
            this.sounds.set(item.key, audio);
            resolve();
          }
        }, 5000);
      });
    }
  }

  img(key) { return this.images.get(key); }
  snd(key) { return this.sounds.get(key); }
}
