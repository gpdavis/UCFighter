// Thin wrapper over HTMLAudioElement that handles polyphonic playback
// (browsers can't replay a single <audio> while it's already playing) and
// the autoplay-after-gesture browser policy.
export class AudioMgr {
  constructor(loader) {
    this.loader = loader;
    this.muted = false;
    this.unlocked = false;
    this.music = null;
    this.musicKey = null;
    this.musicVolume = 0.4;
    this.sfxVolume = 0.7;

    // Browsers block audio until the user interacts with the page.
    // Listen for the first interaction, then flip the unlock flag.
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      // Prime every preloaded clip with a silent play/pause so the browser
      // marks them as user-gesture-authorised. Without this, the FIRST play
      // of each clip is still blocked even after unlock on some browsers.
      for (const node of this.loader.sounds.values()) {
        try {
          node.muted = true;
          const p = node.play();
          if (p && p.then) {
            p.then(() => { node.pause(); node.currentTime = 0; node.muted = false; })
             .catch(() => { node.muted = false; });
          } else {
            node.pause(); node.currentTime = 0; node.muted = false;
          }
        } catch (_) { /* ignore */ }
      }
      // Replay queued music if any
      if (this.musicKey) this.playMusic(this.musicKey);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchstart', unlock, true);
    };
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('touchstart', unlock, true);
  }

  play(key, { volume = 1, loop = false } = {}) {
    if (this.muted || !this.unlocked) return null;
    const src = this.loader.snd(key);
    if (!src) return null;
    // Clone for polyphony; browsers serialize the same node otherwise.
    const node = src.cloneNode(true);
    node.volume = volume * this.sfxVolume;
    node.loop = loop;
    const p = node.play();
    if (p && p.catch) p.catch(() => {}); // suppress remaining autoplay rejections
    return node;
  }

  playMusic(key) {
    this.musicKey = key;
    if (!this.unlocked) return; // will retry on unlock
    this.stopMusic();
    const src = this.loader.snd(key);
    if (!src) return;
    this.music = src.cloneNode(true);
    this.music.volume = this.musicVolume;
    this.music.loop = true;
    const p = this.music.play();
    if (p && p.catch) p.catch(() => {});
  }

  stopMusic() {
    if (this.music) {
      this.music.pause();
      this.music.currentTime = 0;
      this.music = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) this.stopMusic();
  }
}
