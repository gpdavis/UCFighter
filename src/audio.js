// Thin wrapper over HTMLAudioElement that handles polyphonic playback
// (browsers can't replay a single <audio> while it's already playing).
export class AudioMgr {
  constructor(loader) {
    this.loader = loader;
    this.muted = false;
    this.music = null;
    this.musicVolume = 0.4;
    this.sfxVolume = 0.7;
  }

  play(key, { volume = 1, loop = false } = {}) {
    if (this.muted) return null;
    const src = this.loader.snd(key);
    if (!src) return null;
    // Clone for polyphony; browsers serialize the same node otherwise.
    const node = src.cloneNode(true);
    node.volume = volume * this.sfxVolume;
    node.loop = loop;
    const p = node.play();
    if (p && p.catch) p.catch(() => {}); // suppress autoplay rejections
    return node;
  }

  playMusic(key) {
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
