# UC Fighter (Browser Port)

A browser-based recreation of **UC Fighter 4.0**, originally a 2004 native Windows / DirectX 8 / C++ fighting game.

## Play

- **Title screen**: Press Enter / Space to start.
- **Character select**: Each player picks one of three fighters (rob, geoff, trev).
- **Match**: Best-of-3 rounds. First to 2 round wins takes the match.

## Controls

| Action | Player 1 | Player 2 |
|---|---|---|
| Move left / right | ← / → | A / D |
| Jump | ↑ | W |
| Attack 1–4 | Numpad 1 / 2 / 3 / 0 | T / Y / U / G |
| Block | Numpad . | H |

Press Enter to confirm menu choices, Esc to pause / quit a screen.

## Stack

- Vanilla JavaScript (ES modules), HTML5 Canvas2D, Web Audio.
- No build step. Static files only — deployed via GitHub Pages.
- Original C++ binary analysed with Ghidra; mechanics ported per [DESIGN_SPEC.md](DESIGN_SPEC.md).

## Repo layout

```
index.html              entry point
style.css               page styling
src/                    game source (ES modules)
  main.js               boot + asset loading
  game.js               fixed-step game loop + state manager
  fighter.js            Fighter class (combat, animation state)
  input.js              keyboard tracker
  audio.js              SFX playback
  anim.js               sprite-sheet animator
  assets.js             asset manifest + loader
  constants.js          all game tuning constants
  states/               game states (title, select, match, pause, ...)
assets/data/            converted PNG sprites + WAV sounds
tools/convert-assets.ps1  PowerShell BMP→PNG conversion script
LegacyApp/              (gitignored) original game binary + raw BMPs
DESIGN_SPEC.md          architecture extracted from the decompiled C++
```

## Local dev

Any static file server will do. With Python:

```sh
python -m http.server 8000
# open http://localhost:8000
```

ES modules require HTTP — opening `index.html` via `file://` will not work.

## Deployment

The included `.github/workflows/pages.yml` deploys the site to GitHub Pages automatically on every push to `main`. Enable Pages in the repo settings → Pages → Source: GitHub Actions.
