import { AssetLoader } from './assets.js';
import { AudioMgr } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { TitleState } from './states/title.js';

async function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const loadingEl = document.getElementById('loading');
  const fillEl = document.getElementById('loadingFill');

  const assets = new AssetLoader();
  const result = await assets.loadAll((loaded, total, path) => {
    const pct = Math.round((loaded / total) * 100);
    fillEl.style.width = `${pct}%`;
  });

  if (result.failed.length > 0) {
    console.warn(`${result.failed.length} assets failed to load:`, result.failed.slice(0, 10));
  }

  // Hide the loading overlay
  loadingEl.classList.add('hidden');

  const audio = new AudioMgr(assets);
  const input = new Input();
  const game = new Game({ canvas, ctx, assets, audio, input });

  // First user gesture is required for audio in modern browsers.
  // The Title state's enter() will trigger audio on the first keypress anyway.
  game.start(new TitleState());

  // Expose for debugging
  window.__game = game;
}

boot().catch(err => {
  console.error('Boot failed:', err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = 'Failed to start: ' + err.message;
});
