# UC FIGHTER 4.0 — Browser HTML5 Rebuild Design Specification

> A complete behavioural and structural specification of the 2004 DirectX 8
> fighting game "UC Fighter 4.0", reverse-engineered from the Ghidra
> decompilation at `decompiled/_all_functions.c` (1117 functions). This is
> intended to be a self-contained build doc — a developer should be able to
> reproduce the game in Canvas/JS using only this document and the original
> art/sound assets.
>
> Throughout, function names in the form `FUN_004xxxxx` refer to the absolute
> address inside the Win32 executable; the Ghidra decompilation file is
> indexed by these.

---

## 0. High-level overview

* **Engine**: Custom C++ engine using DirectX 8 for graphics
  (`Direct3DCreate8`, `IDirect3DDevice8`), DirectSound 8 for audio
  (`DirectSoundCreate8`), and the standard Win32 message pump for input.
* **Window**: Class `"SurfaceApp"`, title `"UC FIGHTER"`, style `0xCF0000`
  (`WS_OVERLAPPED|CAPTION|SYSMENU|MINIMIZEBOX|THICKFRAME|MAXIMIZEBOX`),
  desktop position `(50,50)`, size `648 × 507` pixels (CreateWindowExA args
  `0x288 × 0x1FB`). Note: the *back-buffer* is 800×600 (see §1.2); the
  game logically renders at 800×600 and the device stretches it into the
  window.
* **Backbuffer**: 800 × 600, 32-bit colour, hardware vertex processing
  (`D3DCREATE_HARDWARE_VERTEXPROCESSING = 0x20`).
* **Tick rate**: 50 Hz. A `SetTimer(hWnd, 1, 20, NULL)` fires `WM_TIMER`
  every 20 ms; on each timer the global tick counter
  `DAT_00454f54` is incremented and a `tickReady` flag (`DAT_00455268`) is
  raised. The peek-message loop runs the per-tick game logic when that
  flag is set and clears it.
* **Render**: 32-bit colour, sprite quads rendered via custom 4-vertex
  draw calls. All textures are 24- or 32-bit BMPs loaded by
  `D3DXCreateTextureFromFileEx`-equivalents (`FUN_00405080`,
  `FUN_00404fb0`).
* **Audio**: PCM `.WAV` files loaded by `mmio*` APIs and played via
  DirectSound 8 secondary buffers.

### 0.1 Browser translation summary

The entire game can run on a single `<canvas>` of fixed logical size
`800 × 600`. Use `requestAnimationFrame` to drive a fixed 50 Hz tick
(20 ms accumulator) and one render call per frame. The "DirectX device"
is just the 2D canvas context. Sprite sheets become `Image` objects,
sounds become `HTMLAudioElement` (or Web Audio buffers). The Win32 VK
keyboard state array (see §6) maps directly onto a `keydown`/`keyup`
listener that writes into a `boolean[256]` indexed by `event.keyCode`.

---

## 1. Boot / WinMain initialisation

### 1.1 `WinMain` — `FUN_004046d0`

```
FUN_004046d0(hInstance):
    FUN_00404030(hInstance)        # register window class "SurfaceApp"
    hwnd = CreateWindowExA(0, "SurfaceApp", "UC FIGHTER",
                            0xCF0000, 50, 50, 648, 507,
                            DesktopWnd, NULL, hInstance, NULL)
    DAT_00454f50 = hwnd            # global window handle
    ShowWindow(hwnd, SW_SHOWDEFAULT)
    UpdateWindow(hwnd)
    if (FUN_00404500() >= 0):      # init DX + game
        FUN_004040b0()             # message loop
    FUN_00404210()                 # shutdown
    CloseWindow(hwnd)
```

### 1.2 D3D / DirectSound init — `FUN_00404500`

Sequence:

1. `g_D3D = Direct3DCreate8()` → stored in `DAT_00455274`.
2. `g_D3D->SetCooperativeLevel(NULL)` — vtable slot `0x24` (param `0`).
3. Build `D3DPRESENT_PARAMETERS` on the stack (13 dwords cleared, first
   field set to `800` for BackBufferWidth).
4. `g_D3D->CreateDevice(0, D3DDEVTYPE_HAL=1, hwnd, 0x20, &pp, &g_Device)`
   — vtable slot `0x3C`. `g_Device` is stored in `DAT_00455278`.
5. `FUN_004043f0()`: `DirectSoundCreate8(0, &g_DSound, 0)` →
   `DAT_00455284`, then `g_DSound->SetCooperativeLevel(hwnd, DSSCL_PRIORITY=1)`.
6. `srand(time(NULL))` — `FID_conflict___time32`/`FUN_00438b9a`.
7. `g_Game = new Game()` (12 bytes via `operator_new(0xc)` →
   `FUN_004077b0`). Stored at global `DAT_00455280`.
8. Clear keyboard state array `DAT_00454f60[256]` (loop of 0x40 dwords).
9. `g_Game->vtable[0](g_Device, 0, gameThis)` — calls **OnInit**.
10. Tick counter `DAT_00454f54 = 0`.
11. `SetTimer(hwnd, 1, 0x14 /*20 ms*/, NULL)` — 50 Hz ticker.
12. `running = 1` (`DAT_00455270`); `tickReady = 1` (`DAT_00455268`).

### 1.3 Message loop — `FUN_004040b0`

```
while peekmessage(&msg, ...) doesn't see msg with id 0x12 (PostQuitMessage(0x12)):
    if no message pending AND running AND tickReady:
        tickReady = 0
        g_Game->vtable[2]()           # OnTick — 50 Hz
    TranslateMessage; DispatchMessageA
```

Note PostQuitMessage value `0x12` is used as a sentinel for "ESC pressed"
in the WndProc. Standard `WM_QUIT` is also handled via the normal path.

### 1.4 Shutdown — `FUN_00404210`

```
running = 0
KillTimer(hwnd, 1)
g_Game->vtable[1]()                   # OnDestroy
if (state.current) state.current->Release()
if (g_DSound)     g_DSound->Release()
if (g_KeyState)   g_KeyState->Release()        # DI keyboard device
if (g_DInput)     g_DInput->Release()
if (g_Device)     g_Device->Release()          # not in this exact order
if (g_D3D)        g_D3D->Release()
```

---

## 2. WndProc state machine — `FUN_00403ec0`

The window procedure is intentionally minimal — most game I/O happens
inside the per-tick loop. It only handles 8 messages.

| `uMsg` value | Hex   | Meaning           | Behaviour |
|--------------|-------|-------------------|-----------|
| `0x0001`     | `WM_CREATE`      | Window creation   | return 0 |
| `0x0002`     | `WM_DESTROY`     | Window closed     | `PostQuitMessage(0)` → return 0 |
| `0x0006`     | `WM_ACTIVATE`    | Focus change      | If `LOWORD(wParam) != 0` (activated/focus-lost), if `g_FocusValid` then call **FUN_00403e90** (pause). If `==0` (focus regained) similar resume. |
| `0x000F`     | `WM_PAINT`       | Repaint           | `ValidateRect(hwnd, NULL)`; return 0 (we render in OnTick) |
| `0x0100`     | `WM_KEYDOWN`     | Key pressed       | `keys[wParam & 0xFF] = 1`. If `wParam == VK_ESCAPE (0x1B)` → `PostQuitMessage(0x12)`. Else if `running`, call `g_Game->vtable[3](wParam)`. Falls through to DefWindowProcA. |
| `0x0101`     | `WM_KEYUP`       | Key released      | `keys[wParam & 0xFF] = 0`. Falls through to DefWindowProcA. |
| `0x0113`     | `WM_TIMER`       | 20 ms timer       | `g_TickCounter++`; if `running` call `g_Game->vtable[4]()` (OnTimer); `tickReady = 1`. Return 0. |
| `0x0201`     | `WM_LBUTTONDOWN` | Mouse click       | Treated identically to `WM_NCLBUTTONDOWN` (pause). |
| `0x0211`     | `WM_ENTERMENULOOP`     | Entering menu | Pause path. |
| `0x0231`     | `WM_ENTERSIZEMOVE`     | Drag/resize start | Pause path (FUN_00403e90). |
| `0x0232`     | `WM_EXITSIZEMOVE`      | Drag/resize end   | Resume path (FUN_00403e60). |
| anything else | — | — | `DefWindowProcA` |

Pause/resume helpers:

* `FUN_00403e90` (pause): if `g_FocusValid` AND `g_AllowPause` →
  `g_PausedState->vtable[0x20/4=8]()` and set `g_Paused = 0`. Effectively
  calls "stop" on the music object.
* `FUN_00403e60` (resume): if both flags set → call vtable[0x1C/4=7]
  (start music) and `g_Paused = 1`.

### 2.1 Browser implementation

```js
window.addEventListener('keydown', e => {
    keys[e.keyCode & 0xFF] = 1;
    if (e.keyCode === 27) { running = false; }      // ESC
    else if (running) game.onKeyDown(e.keyCode);
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.keyCode & 0xFF] = 0; });
window.addEventListener('blur',  () => game.pause());
window.addEventListener('focus', () => game.resume());
```

---

## 3. The Game class

### 3.1 Memory layout (12 bytes)

```
struct Game {                       // 0x0C bytes — operator_new(0xc)
    uint32_t  vtable;               // +0x00 → &PTR_FUN_004460f8
    uint32_t  textureManager;       // +0x04 — set in OnInit, size 0x324
    uint32_t  stateManager;         // +0x08 — set in OnInit, size 0x10  (DAT_00455614)
};
```

The constructor `FUN_004077b0` is trivial:

```
Game::Game():
    FUN_00403df0(this)          # sets *this = &PTR_LAB_00445494 (base "Object" vtable)
    *this = &PTR_FUN_004460f8   # override with derived Game vtable
```

`FUN_00403df0` (and the identical `FUN_00403e00`) just stamps a placeholder
base-class vtable pointer so that, if the derived class doesn't override
all slots, virtual calls still land on valid no-op functions.

### 3.2 Vtable layout — `PTR_FUN_004460f8`

The Game vtable has at least 5 slots, used as follows (each `* 4` byte
offset, called from `FUN_00404500`, `FUN_00404210`, `FUN_004040b0`,
`FUN_00403ec0`):

| Slot | Offset | Role                | Implementation |
|------|--------|---------------------|----------------|
| 0    | +0x00  | `OnInit(device, _, this)` | `FUN_00408160` |
| 1    | +0x04  | `OnDestroy()`       | `FUN_00408390` |
| 2    | +0x08  | `OnTick()`          | (per-state dispatch; not in code as one fn — see §3.3) |
| 3    | +0x0C  | `OnKeyDown(vk)`     | (forwards to current state vtable[3], or scratch) |
| 4    | +0x10  | `OnTimer()`         | (no-op or scratch in this build) |

The OnTick dispatcher takes the form `g_StateManager.current->OnTick(input)`.

### 3.3 Game::OnInit — `FUN_00408160`

```
OnInit(this, device, _, gameThis):
    this->textureManager = new TextureManager(0x324)   # FUN_00406a90, clears 201 slots
    FUN_00407940(this)                                  # preload all BMP textures (see §11)
    FUN_00406250(g_Device)                              # create 3 D3DXFonts
    g_StateManager = new StateManager(0x10)            # DAT_00455614
        layout: { int prevId; void* prevState; int curId; void* curState }
        zero-initialised
    DAT_00455610 = new MenuState(0x10);     vtable = &PTR_FUN_00446038  # state 1
    DAT_0045560c = new GameState(0x2dc);    vtable = &PTR_LAB_00446058  # state 2 (round/match controller)
    DAT_00455620 = new IntroState(0xc);     vtable = &PTR_FUN_00446078  # state 3
    DAT_00455608 = new TitleState(8);       vtable = &PTR_LAB_00446098  # state 4
    DAT_0045561c = new PauseState(8);       vtable = &PTR_LAB_004460b8  # state 5
    DAT_00455618 = new CreditsState(8);     vtable = &PTR_LAB_004460d8  # state 6
    StateManager::SetState(1)               # boot into menu — see §4
```

The seven distinct state objects are created up-front; switching states
is just a pointer swap — no allocation/free during play.

### 3.4 Game::OnDestroy — `FUN_00408390`

Releases fonts (`FUN_004062d0`), destroys the texture manager, calls
the current state's destructor, frees the StateManager.

---

## 4. The State Manager — `FUN_004077f0`

```c
struct StateManager {                                  // 0x10 bytes
    int        prevStateId;     // +0x00
    void*      prevState;       // +0x04
    int        curStateId;      // +0x08
    void*      curState;        // +0x0C — currently-active state object
};

// SetState(this, newId)
void FUN_004077f0(StateManager* sm, int newId) {
    if (newId == sm->curStateId) return;        // no-op for same state
    FUN_00404140();                              // running = false (pause game)
    void* newObj =
        newId == 1 ? DAT_00455610 :              // Menu
        newId == 2 ? DAT_0045560c :              // GameMatch
        newId == 3 ? DAT_00455620 :              // Intro
        newId == 4 ? DAT_00455608 :              // Title
        newId == 5 ? DAT_0045561c :              // Pause
        newId == 7 ? NULL        :               // Quit sentinel
        DAT_00455618;                            // 6: Credits (default fallthrough)
    sm->prevStateId = sm->curStateId;
    sm->prevState   = sm->curState;
    if (sm->curStateId != 0 && sm->prevState != NULL)
        sm->prevState->vtable[1]();              // call Exit on old state
    sm->curState   = newObj;
    sm->curStateId = newId;
    if (newId != 7 && newObj != NULL)
        newObj->vtable[0]();                     // call Enter on new state
    FUN_00404130();                              // running = true (unpause game)
}
```

* `FUN_00404130` sets `running = 1`; `FUN_00404140` clears it. So state
  transitions briefly suspend the simulation.
* State `7` is the "quit" sentinel — calling `SetState(7)` exits the
  active state without entering anything new.

### 4.1 State ID table

| ID  | Name           | Size | Created | Vtable        | Purpose |
|-----|----------------|------|---------|---------------|---------|
| 1   | **Menu**       | 0x10 | line 4439 | PTR_FUN_00446038 | Main menu (Play / Help / Credits / Quit) |
| 2   | **GameMatch**  | 0x2DC | line 4450 | PTR_LAB_00446058 | Wraps char-select + 3-round fight loop |
| 3   | **Intro**      | 0x0C | line 4461 | PTR_FUN_00446078 | Animated intro logo (after Title) |
| 4   | **Title**      | 0x08 | line 4472 | PTR_LAB_00446098 | Title splash (boot screen, "UC FIGHTER" logo) |
| 5   | **Pause**      | 0x08 | line 4483 | PTR_LAB_004460b8 | Pause overlay during gameplay |
| 6   | **Credits**    | 0x08 | line 4494 | PTR_LAB_004460d8 | End-credits scroll |
| 7   | (quit sentinel)| —   | —          | —              | causes graceful shutdown |

Each state object has a vtable with at least:
* `[0]` Enter()
* `[1]` Exit()
* `[2]` Tick(input)   — called from Game::OnTick via the current state ptr
* `[3]` OnKeyDown(vk) — called from Game::OnKeyDown forward

> **Note**: The vtable pointers `PTR_FUN_004460x8` are in the binary's
> `.rdata` section. Ghidra's labelling shows them only as data; their
> individual slot functions have to be discovered by other call-sites.
> The functions identified in the decompilation as plausible state
> methods (each pair (Enter, Tick) found near each other in the
> address-ordered listing) are described in §5 below.

### 4.2 Typical state flow

```
boot → Title (4) → press any key → Intro (3) → Menu (1)
                                                  ├─ PLAY  → GameMatch (2)
                                                  │           ├─ CharSelect phase
                                                  │           ├─ Round 1/2/3
                                                  │           └─ Win → Credits (6) → Menu
                                                  ├─ HELP  → (overlay, stays in Menu)
                                                  ├─ CREDITS → Credits (6) → Menu
                                                  └─ QUIT  → SetState(7)
GameMatch + ESC → Pause (5) → ESC → GameMatch
```

---

## 5. Per-state behaviour

### 5.1 Title state (id 4, size 8)

* Object fields: `{ vtable; uint flag/timer }`.
* **Enter** — `FUN_00408550`: allocates an `IntroMusic` object (size 0x110)
  that loads `intro.wav` (via `FUN_00403d90`/`FUN_00404170`), stores it
  at `(this+0xC)` and calls `FUN_00403d10(intro)` to start playback.
  Sets `(this+8) = 0` (animation phase).
* **Tick** — draws the `ucfighter.bmp` (texture slot 5) and `uclogo.bmp`
  (texture slot 6), wait for keypress.
* **OnKeyDown** — any key → `SetState(3)`.

### 5.2 Intro state (id 3, size 0x0C)

The 3-field object likely holds: `{ vtable; int frame; void* sprite }`.
Plays a few frames of animation using `credits.bmp` (slot 1) and
`uclogo.bmp` (slot 6) then transitions to Menu.

### 5.3 Menu state (id 1, size 0x10)

* Layout: `{ vtable; int cursor; int subStateOpen; int helpVisible }`
* Renders `intro.bmp` (slot 0) background plus a "selection arrow".
* Up/Down (VK_UP / VK_DOWN, or W/S) move cursor; Enter triggers item.
* Items:
  1. PLAY → `SetState(2)` (GameMatch)
  2. HELP → draws `help.bmp` (slot 7) on top, ESC to close
  3. CREDITS → `SetState(6)`
  4. QUIT → `SetState(7)`

### 5.4 Pause state (id 5, size 8)

* Draws `paused.bmp` (slot 8) over the existing fight backbuffer.
* Stops fight ticks (note: `FUN_00404140()` is called on state-switch).
* ESC → `SetState(prevState)` (resume).

### 5.5 Credits state (id 6, size 8)

* Renders `credits.bmp` (slot 1 or 4 — both loaded with same image)
  optionally scrolling vertically.

### 5.6 GameMatch state (id 2, size 0x2DC) — the big one

This is the master state for an entire match. It internally owns a
two-phase sub-state machine driven by `FUN_00403790`:

```c
// pseudo-fields of GameMatch (size 0x2dc)
struct GameMatch {                   // offsets are in 4-byte words for clarity
    void*  vtable;          // 0  →  PTR_LAB_00446058
    void*  inputProvider;   // 1     vtable slot 0x1C returns "input snapshot"
    void*  fightState;      // 2     current FightState* (NULL outside phase 2)
    void*  charSelect;      // 3     current CharSelect* (only in phase 1)
    int    phase;           // 4     1 = character-select, 2 = fight, 3 = match-over
    int    roundNo;         // 5     1, 2, 3
    int    p1Wins;          // 6     rounds won
    int    p2Wins;          // 7
    // remainder: scratch + cached sound objects
};
```

The Enter handler `FUN_00403670` allocates a `CharacterSelect` (size 0x70)
via `FUN_00402f30` and seeds `phase=1, roundNo=1, p1Wins=0, p2Wins=0`.

`FUN_00403790` is the per-tick dispatcher; full behaviour in §8.

---

## 6. Input system

### 6.1 Raw keyboard array

The WndProc maintains a global `uint8_t keyState[256]` at `DAT_00454f60`,
indexed by the VK code. `WM_KEYDOWN` sets `keyState[wParam & 0xFF] = 1`,
`WM_KEYUP` clears it.

### 6.2 InputSystem object

There is **also** a DirectInput device (allocated alongside the
TextureManager — see the operator_new(0x324) chain at the call to
`FUN_00407030`/`FUN_004070e0`). The DI keyboard is polled in
`FUN_004047f0`:

```
FUN_004047f0(this):
    this->diDevice->GetDeviceState(256, this+0x124)    # vtable slot 0x24
    *(this+0x12C) = *(this+0x128)
    this->acquired = 1
```

…and released in `FUN_00404820` (`Unacquire`, vtable slot 0x28).

The Win32 `WM_KEYDOWN` array is the primary source, and the DI device is
used as a fallback / for buffered scan-code reads. In the JS port a
single keyboard listener is sufficient.

### 6.3 Key bindings (VK codes — confirmed by FUN_00401c10 fight tick)

The fight-state tick (`FUN_00401c10`) reads the input array at the
following byte offsets. These are exactly Win32 VK codes:

| Offset | VK     | Key (US)       | Action |
|--------|--------|----------------|--------|
| 0x25 | VK_LEFT      | ← Arrow      | **P1 move left** |
| 0x26 | VK_UP        | ↑ Arrow      | **P1 jump**      |
| 0x27 | VK_RIGHT     | → Arrow      | **P1 move right**|
| 0x60 | VK_NUMPAD0   | Numpad 0     | **P1 attack 4** |
| 0x61 | VK_NUMPAD1   | Numpad 1     | **P1 attack 1** |
| 0x62 | VK_NUMPAD2   | Numpad 2     | **P1 attack 2** |
| 0x63 | VK_NUMPAD3   | Numpad 3     | **P1 attack 3** |
| 0x6E | VK_DECIMAL   | Numpad .     | **P1 block / guard** |

| Offset | VK     | Key       | Action |
|--------|--------|-----------|--------|
| 0x41 | `A`    | A | **P2 move left** |
| 0x44 | `D`    | D | **P2 move right** |
| 0x57 | `W`    | W | **P2 jump**       |
| 0x54 | `T`    | T | **P2 attack 1** |
| 0x55 | `U`    | U | **P2 attack 3** |
| 0x59 | `Y`    | Y | **P2 attack 2** |
| 0x47 | `G`    | G | **P2 attack 4** |
| 0x48 | `H`    | H | **P2 block / guard** |

| Offset | VK     | Key       | Action |
|--------|--------|-----------|--------|
| 0x1B | VK_ESCAPE | Esc | global QUIT (handled in WndProc) |
| 0x0D | VK_RETURN | Enter | menu confirm |

> Note on attack 3 vs attack 4 for P1: the lines 691–693 and 687–689 in
> `FUN_00401c10` make `VK_NUMPAD3 (0x63)` map to **attack 3**
> (`FUN_00402b50`) and `VK_NUMPAD0 (0x60)` map to **attack 4**
> (`FUN_00402bb0`). For P2, `T (0x54)` = attack1, `Y (0x59)` = attack2,
> `U (0x55)` = attack3, `G (0x47)` = attack4 (decoded by the analogous
> block lines 728–747). H (0x48) — block — uses `FUN_00402970`.

The fight controller’s `FUN_00403790` reads input by calling
`current->vtable[0x1C/4 = 7]()` which returns a pointer to a
snapshot-of-keystate; that pointer is **`param_1` inside `FUN_00401c10`**.
The byte at `param_1+vk` is `1` while held, `0` otherwise. There is no
"just-pressed" edge detection on movement keys — both arrows-and-numpad
are read continuously each tick.

---

## 7. Player class (`Character`, size 0xB4)

Allocated as `operator_new(0xb4)` by `FUN_00402570`. Six instances are
allocated by the CharacterSelect (`FUN_00402f30`) so the select screen
can render all 3 characters per side simultaneously. The instance for
the actual fight is allocated by `FUN_00401720`.

```c
struct Character {                  // 0xB4 bytes
    float    posX;                  // +0x00  (float; range ~0..600 logical units)
    float    posY;                  // +0x04
    bool     facingLeft;            // +0x08  set by relative position each tick
    uint8_t  animFrame;             // +0x09  current step within the current sequence (0..animLen)
    bool     hasBeenHitThisAnim;    // +0x0A  set to 1 when an attack frame connects
    bool     isInAnim;              // +0x0B  1 = currently in an interruptible attack/block/jump
    int      attackDamage;          // +0x0C  damage to deal on connect (copied from +0x4C..+0x5C)
    uint8_t  facingLockedLeft;      // +0x10  (cached previous direction)
    bool     isBlocking;            // +0x11  set by ATTACK4/BLOCK input
    bool     animDoneFlag;          // +0x12  set after defeat/fatality animation ends
    void*    hurtSound;             // +0x14  → "playerData\\hurt.wav"
    int      _0x18;
    float    landingY;              // +0x1C  ground Y = 250.0f (0x437a0000)
    int      jumpStartTick;         // +0x20  set to 4 to mark "begin jump arc"
    int      velX;                  // +0x24  walk velocity, clamped [-0x4B0, 0]
    int      animSeqPtr;            // +0x28  pointer to current sequence table (one of DAT_00450044/64/8C/80/4F48)
    int      animLength;            // +0x2C  number of entries in the table (4, 7, 8 ...)
    int      ticksPerFrame;         // +0x30  e.g. 1 (block, attack), 4 (idle/walk), 8 (fatality)
    int      _0x34;
    int      poseId;                // +0x38  0=Attack1, 1=Attack2, 2=Attack3, 3=Attack4,
                                    //         4=Stance,  5=Defeat, 6=Fatality, 7=Walk, 8=Defeat-anim, 9=Walk
    int      animLenAlt;            // +0x3C  alt count used by walk/jump/fatality
    void*    excertSound;           // +0x40  "playerData\\excert.wav"
    void*    agonySound;            // +0x44  "playerData\\agony.wav"
    int      atk1Damage;            // +0x4C
    int      atk2Damage;            // +0x50
    int      atk3Damage;            // +0x54
    int      atk4Damage;            // +0x58
    int      maxHP;                 // +0x5C  (last param of FUN_00402570 — 100 for fight, 10 for select preview)
    int      _0x60;
    Hitbox*  hitboxes[15];          // +0x64..+0x9C — pool of 15 blood/particle hitboxes
    int      characterId;           // +0xA0  0x1E=rob, 0x32=geoff, 0x46=trev
    int      jumpPeakDX;            // +0xA4  delta-X to apply during jump (signed)
    int      jumpPeakDY;            // +0xA8  delta-Y (peak height) — positive
    int      jumpLandDX;            // +0xAC  delta-X on landing
    bool     fatalityActive;        // +0xB1  set when KO'd by a fatality move
    bool     showBlood;             // +0xB2  render blood overlay (drawn by FUN_004027e0 when set + fatality pose)
    bool     defeated;              // +0xB3  player has died this round
};
```

### 7.1 Character constructor — `FUN_00402570`

```
FUN_00402570(this, charId, atk1, atk2, atk3, atk4, maxHP):
    this->atk1Damage = atk1
    this->atk2Damage = atk2
    this->atk3Damage = atk3
    this->atk4Damage = atk4
    this->maxHP      = maxHP
    this->_0x60      = 0
    this->facingLeft = 1
    this->facingLockedLeft = 0
    this->fatalityActive = 0
    this->animSeqPtr (jump dx)      = 4
    this->landingY   = 250.0f       (float 0x437a0000)
    this->posX       = 50.0f        (float 0x42480000)
    this->posY       = 250.0f       (0x437a0000)
    this->velX       = 0
    this->poseId     = 0
    this->characterId = charId
    this->isInAnim   = 0
    this->jumpPeakDX = 0
    this->jumpLandDX = 0
    this->jumpPeakDY = 0
    this->isBlocking = 0
    this->showBlood  = 0
    this->defeated   = 0
    this->animDoneFlag = 0
    this->hurtSound   = new SoundBuffer("playerData\\hurt.wav")
    this->excertSound = new SoundBuffer("playerData\\excert.wav")
    this->agonySound  = new SoundBuffer("playerData\\agony.wav")
    // 15 hitbox slots, each 0x21C bytes (FUN_00401000)
    for (i = 15..1) this->hitboxes[i-1] = new Hitbox()
```

### 7.2 Character stats per fighter

Set at the start of each round by `FUN_00401720` (FightState ctor):

| Character | ID    | atk1 | atk2 | atk3 | atk4 | HP |
|-----------|-------|------|------|------|------|-----|
| **rob**   | 0x1E (30) | 0x32 = 50  | 0x4B = 75  | 0x64 = 100 | 0x64 = 100 | 500 |
| **geoff** | 0x32 (50) | 0x4B = 75  | 0x4B = 75  | 0x4B = 75  | 0x64 = 100 | 500 |
| **trev**  | 0x46 (70) | 0x4B = 75  | 0x4B = 75  | 0x32 = 50  | 0x64 = 100 | 500 |

(In char-select preview, all stats are set to `10` and HP to `10` so a
mistimed punch can KO the dummy quickly for animation testing.)

* All characters have the **same HP = 500**.
* `rob` is the lightest hitter (50/75/100/100).
* `geoff` is balanced (75/75/75/100).
* `trev` has the highest base damage (75/75/50/100) — actually the 4-stat
  reading from the function call is:
  * rob:   (50, 75, 100, 100)
  * geoff: (75, 75, 75,  100)
  * trev:  (75, 75, 50,  100)
  All have a strong attack-4 of 100. The 100 in slot 4 (max-HP-percent
  modifier) is consistent across all three — it's not a damage value
  but a HP-pool ratio used by the HUD bar (see §10).

### 7.3 Action functions

Each action sets the animation pose, frame count and ticks-per-frame.
The `isInAnim` flag (`+0xB`) gates new actions while one is in progress.

| Func         | Pose | poseId | animLen | tpf | Anim table | Effect |
|--------------|------|--------|---------|-----|------------|--------|
| `FUN_00402930` | Stance (idle)| 7 | 4 | 3 | `DAT_00450064` (Walk seq) | sets animSeq=Walk; idle |
| `FUN_00402970` | Block        | 4 | 1 | 7 | `&DAT_00454f48` | sets isBlocking=1 |
| `FUN_004029b0` | Defeat       | 8 | 1 | 6 | `&DAT_00454f48` | death animation start |
| `FUN_00402a00` | Defeat-final | 5 | 1 | 6 | `&DAT_00454f48` | sets defeated=1 |
| `FUN_00402aa0` | Attack 1     | 0 | 4 | 2 | `DAT_00450044`  | dmg = atk1Damage; plays excert |
| `FUN_00402af0` | Attack 2     | 1 | 4 | 2 | `DAT_00450044`  | dmg = atk2Damage |
| `FUN_00402b50` | Attack 3     | 2 | 4 | 2 | `DAT_00450044`  | dmg = atk3Damage |
| `FUN_00402bb0` | Attack 4     | 3 | 4 | 2 | `DAT_00450044`  | dmg = atk4Damage |
| `FUN_00402c10` | Fatality     | 6 | 8 | 3 | `DAT_0045008c`  | sets showBlood=1; uses agonySound |
| `FUN_00402c70` | Walk (DX=±15..20) | 9 | 4 | 3 | `DAT_00450080`  | sets jumpPeakDX/jumpLandDX |
| `FUN_00402a40` | Jump (DX, peakDY, landDX) | — | — | — | — | sets jumpPeakDX/Y/jumpLandDX; plays excertSound |
| `FUN_00402cd0` | Run / dash forward | — | 1 | 7 | `&DAT_00454f40` + `DAT_00450040` | shifts posX ±20 |
| `FUN_00402d80` | take-hit       | — | — | — | — | calls `02CD0` + spawn random hitboxes + jump-back |

#### 7.3.1 Animation sequence tables (in `.data`)

| Symbol | Bytes (ints) | Use | Frame count |
|--------|--------------|-----|-------------|
| `DAT_00450040` | `[0]` (extends?) | Run dash (1 frame loop) | 1 |
| `DAT_00450044` | `[0,1,2,3,2,1,0]`  | Attack sequence (ping-pong)  | **7** |
| `DAT_00450060` | length = 4 (??) | Attack length value | — |
| `DAT_00450064` | `[0,1,2,3,2,1,6,0]` (length 8) | Walk + idle (idle uses only [0]) | **8** |
| `DAT_0045007c` | length = 7 (DAT_0045007c stored at +0x2c) | Walk length | — |
| `DAT_00450080` | `[0,1,2,3]` length 4 | Walk movement | **4** |
| `DAT_00450088` | length = 4 | (walk length) | — |
| `DAT_0045008c` | `[0,1,2,3,4,5,6,7]` length 8 | Fatality (uses 8-frame sheet) | **8** |
| `DAT_004500ac` | length = 8 | (fatality length) | — |
| `DAT_004500b0` | length = 1 | block/defeat length | — |
| `DAT_00454f48` | `[0]` (zero) | single-frame poses (Block, Defeat, Victory) | **1** |

`Attack` ping-pongs through 4 sheet frames as 7 displayed frames — frame
index 0..3 then back down — making the strike "wind up, peak, recover".

`Walk` cycles 0,1,2,3,2,1,6,0 — note frame 6 is used for an idle pose
spliced in.

`Fatality` uses all 8 sheet frames sequentially (sheet is 4096×512 = 8
frames of 512×512 — matches sheet width given in the project context).

### 7.4 Movement / physics

* Horizontal walking: `FUN_00402c70(self, ±15..±20)` sets `jumpPeakDX`
  to the dx (positive=right, negative=left), keeps player on ground.
  Velocity ramp clamped to `[-0x4B0, 0]` = `[-1200, 0]` units.
* Jumping: `FUN_00402a40(dxStart, peakDY, dxLand)` — at +0xA4/A8/AC the
  three values are filled in; subsequent ticks subtract and apply,
  walking through the trajectory.
* Ground: `y >= 250.0f` (landingY). When player reaches Y > 250 they
  snap back.
* World bounds (from `FUN_00401c10`):
  * Right wall: `posX > 600.0f` → posX clamped to 600 (`0x44160000`),
    pushes opponent left by the overflow if they aren't past 600 too.
  * Left wall: `posX < 0` → snapped to 0, pushes opponent right.

### 7.5 Per-tick update — `FUN_00402de0`

```
FUN_00402de0(p):
    // advance animation frame every (ticksPerFrame)th tick
    if (g_TickCounter % p->ticksPerFrame == 1)
        p->animFrame++
    if (p->animFrame >= p->animLength) {
        if (p->showBlood) {
            p->animFrame = 0; p->isInAnim = 0; p->animDoneFlag = 1
        } else {
            p->isInAnim = 0; p->animFrame = 0; p->animDoneFlag = 0; p->hasBeenHit = 0
        }
    }
    if (p->jumpActive /*+0xB0=1*/) {
        // walk through jump arc this tick
        peakDY = p->jumpPeakDY
        p->jumpPeakDY -= p->_0x20
        p->posY -= peakDY
        p->posX = posX - jumpStartDX + jumpLandDX
    }
    clamp posY <= landingY (250)
    when posY hits landingY, finish jump (clear DY) and apply landing impulse
    for each of the 15 hitbox particles, advance their physics (FUN_00401280)
    if (defeated /*0xB3*/) p->respawnPhase()
```

`DAT_00454f54` is the global 50-Hz tick counter; using `g_TickCounter %
ticksPerFrame == 1` gives stride-based animation (no float accumulators).

---

## 8. Round / Fight state — `FUN_00401720` ctor + `FUN_00401c10` tick

### 8.1 FightState fields (size 0x48)

```c
struct FightState {                  // 0x48 bytes via operator_new(0x48)
    bool       roundOver;             // +0x00
    bool       p1Won;                 // +0x01  set if p2 fell
    bool       fightActive;           // +0x02  set when "ready" anim done
    void*      p1;                    // +0x04  Character*
    void*      p2;                    // +0x08  Character*
    void*      roundSound1;           // +0x10  "round1.wav"
    void*      roundSound2;           // +0x14  "round2.wav"
    void*      roundSound3;           // +0x18  "round3.wav"
    void*      fightSound;            // +0x1C  "fight.wav"
    void*      awesomeDeathSound;     // +0x20  "awesomedeath.wav"
    int        gravityDeltaY;         // +0x24  starts at 0xFFFFFF38 = -200
    int        gravityMax;            // +0x28  starts at 5
    void*      scoreBoard;            // +0x2C  4-byte int pair {p1HP, p2HP}; FUN_004014e0
    bool       showRoundBanner;       // +0x30  (1 if round-intro is playing)
    bool       showVictoryBanner;     // +0x31  set on KO until match end
    int        bannerTick;            // +0x34  banner counter
    int        roundIndex;            // +0x38  (1=round1, 2=round2, 3=round3)
    bool       playedRound;           // +0x3C
    bool       playedFight;           // +0x3D
    bool       playedAwesome;         // +0x3E
    bool       playedDefeatSound;     // +0x3F
    void*      musicPlayer;           // +0x40  music selection object (FUN_00402370)
    int        bgTextureSlot;         // +0x44  20 + (random % 3) → background1-3 (slots 0x14..0x16)
};
```

`scoreBoard` (`FUN_004014e0`) is `int[2]` = `{ p1score, p2score }` with
defaults `0` and `100`. Damage is dealt by *subtracting* from `[0]`
(p1) and *adding* to it (p2). The fight ends when either:
* `scoreBoard[0]` exceeds 100 → p2 wins (he subtracted p1's HP into the
  positive),
* `scoreBoard[1]` falls below 0 → p1 wins.

So the scoreboard stores HP delta with a 0..100 baseline; **internal HP
is scaled to 100 (percent), not 500**. The 500 in the character struct
is the literal "fight HP" used for animation length scaling; the
percent bar is what determines win/loss.

### 8.2 FightState constructor — `FUN_00401720`

```
FUN_00401720(this, roundNum, p1CharId, p2CharId):
    this->showRoundBanner = 1; this->bannerTick = 0
    this->p1 = new Character(p1CharId, ...stats from §7.2)
    this->p2 = new Character(p2CharId, ...stats from §7.2)
    p1->posX = 50;  p1->facingLeft = ?  (start values from ctor)
    p2->posX = 490 (0x43F50000)
    roundSound1 = SoundBuffer("levelData\\round1.wav")  // round announcement
    roundSound2 = SoundBuffer("levelData\\round2.wav")
    roundSound3 = SoundBuffer("levelData\\round3.wav")
    fightSound  = SoundBuffer("levelData\\fight.wav")   // "FIGHT!"
    awesomeDeathSound = SoundBuffer("levelData\\awesomedeath.wav")
    gravityDeltaY = -200; gravityMax = 5
    scoreBoard = new {p1=0, p2=100}
    roundIndex = roundNum
    musicPlayer = new MusicSystem (FUN_00402370 — enumerates data\\music\\*.* and loads each .wav)
    bgTextureSlot = 0x14 + (rand() % 3)   // background1/2/3
```

### 8.3 FightState tick — `FUN_00401c10`

Pseudo-code:

```
FightState::Tick(this, input):
    if (this->showVictoryBanner) {     // KO; running victory anim
        bannerTick++
        if (bannerTick > 600):
            this->fightActive = true
            triggerNextRound(musicPlayer)
        elif (bannerTick > 400):
            ensure playedDefeatSound; play awesomeDeathSound
            if (p1Won) { p2.defeatFinal(); p1.victory() } else { p1.defeatFinal(); p2.victory() }
        elif (bannerTick > 150):
            if (!playedAwesome) {
                playedAwesome = 1
                if (p1Won) p2.fatalityAnim() else p1.fatalityAnim()
                play(playedAwesome sound)
            }
            if (p1.animDone) p2.defeatFinal()
            if (p2.animDone) p1.defeatFinal()
    elif (this->showRoundBanner) {     // round-intro banner sequence
        p1.idle(); p2.idle()
        if (bannerTick < 70):
            if (!playedRound) {
                play roundSound[roundIndex-1]
                playedRound = 1
            }
            bannerTick++
        elif (bannerTick < 120):
            if (!playedFight) { play fightSound; playedFight = 1 }
            bannerTick++
        elif (bannerTick < 150):
            this->showRoundBanner = 0       // fight begins
        else:
            bannerTick++
    else:
        // ---- normal combat ----

        // ---- P1 controls ----
        if (VK_UP held) {
            if (VK_LEFT  held) p1.jump(0, 40, 0)        // jump back  (vk0x26+0x25)
            elif (VK_RIGHT held) p1.jump(0, 40, 15)     // jump fwd
            else                  p1.jump(0, 40, 0)     // straight up
        } else if (VK_RIGHT held) p1.walk(+20)
        else if (VK_LEFT  held)   p1.walk(-20)

        if      (VK_NUMPAD1 held) p1.attack1()
        else if (VK_NUMPAD2 held) p1.attack2()
        else if (VK_NUMPAD3 held) p1.attack3()
        else if (VK_NUMPAD0 held) p1.attack4()
        else if (VK_DECIMAL held) p1.block()
        else                       p1.idle()

        // ---- P2 controls ----
        (mirror with 'W'/'A'/'D' for movement, 'T'/'Y'/'U'/'G'/'H'
         for attacks, see §6.3)
```

After running both controllers the tick advances per-character physics
(`FUN_00402de0`), updates facing based on relative X, then runs
collision (§9), then clamps to world bounds.

The round timer is implicit — there is no clock; rounds end on KO.

### 8.4 Match controller — `FUN_00403790`

```
match.Tick(input):
    in = inputProvider.vtable[7]()             // get keystate snapshot
    if (phase == 1) {                          // character-select
        CharacterSelect::Tick(in)
        if (charSelect->p1Done && p2Done) {
            new FightState(round=1, p1=charSelect.p1Pick, p2=p2Pick)
            phase = 2
        }
    } else if (phase == 2) {                   // fight
        FightState::Tick(in)
        if (fight->roundOver) {                // someone KO'd
            if (fight->p1Won) p1Wins++ else p2Wins++
            if (round < 3) {
                round++
                allocate new FightState(round, picks) // see §8.5
            } else {
                if (p1Wins == 2 || p1Wins == 0) {   // match-decided
                    phase = 1
                    new CharacterSelect()
                    round = 1; p1Wins = 0; p2Wins = 0
                    return
                }
                round++
                new FightState(round, picks)
            }
        }
    }
```

* Best-of-3 — first to 2 round wins takes the match.
* After a complete match (3 rounds played) → drops back to character
  select with stats reset. Final match → enter Credits state.

### 8.5 FightState draw — `FUN_00401ad0`

Per-frame drawing order (when fight is active):

1. **Background**: `background[bgTextureSlot - 0x14]` drawn at
   `(velX_offset .. velX_offset + 0x800, 0..0x320)` — full 2048×800
   strip, scrolled horizontally by `velX_offset`.
2. **P1 and P2**: `FUN_004027e0(p)` for each (player + 14 blood-particle
   sprites).
3. **Score HUD**: `FUN_00401510(scoreBoard)` — see §10.
4. **Round banner** (if `showRoundBanner`):
   * If `bannerTick < 70`: draw `round[roundIndex-1].bmp` (slot 0x0E+).
   * If `70 ≤ bannerTick < 120`: draw `fight.bmp` (slot 0x0D).
   * (After 120: nothing — fight begins.)
   * Banner is drawn at quad `(0,0)→(512,512)` with rotation `170.0f`
     (presumably degrees).
5. **Victory banner** (if `showVictoryBanner` AND `bannerTick > 50`):
   draw `victory.bmp` (slot 0x11) at `(0,0)→(512,512)` rotated `170`.

---

## 9. Combat / collision logic

### 9.1 Hit detection (in `FUN_00401c10`, lines ~867–901)

For *each* attacker A and victim V (run twice with sides swapped):

```
if (A.isInAnim AND A.hasBeenHit==0 AND A.poseId is an attack pose):
    // bounding-box hit
    if (V.x lies inside [A.x .. A.x + A.attackRange]   // attacker to the right
        AND V.y >= A.y - 30):
        // HIT
    else if (V.x lies inside [A.x - A.attackRange .. A.x]   // attacker to the left
            AND V.y >= A.y - 30):
        // HIT
    else: no hit
    if hit AND V.isBlocking == 0:
        scoreBoard[A_side] += 4      # reduce victim HP by 4 per connect frame
        A.hasBeenHit = 1
    apply V.takeDamage()             # play hurt sound, knock back
```

So the attack range is `A.attackDamage` units of horizontal distance —
the damage value doubles as a range value! Larger damage attacks reach
further. The hit threshold is `±70` in Y (V.y must be within 30 pixels
above A.y; the elseif checks the symmetric case).

The HP-bar damage is **fixed at -4 per connecting frame** regardless of
which attack — but stronger attacks deal more *because they have a
longer range and a longer animation*, meaning they can hit on more
frames per swing.

The `hasBeenHit` latch prevents one swing from registering more than
once per anim cycle. The block check turns guard into immunity (no
damage subtracted, no knockback applied).

### 9.2 Take-damage — `FUN_00402d80`

```
takeDamage(p):
    runDash(p)                              # 0x402CD0
    if (!p.isBlocking) {
        p.facingLockedLeft = 1
        play(p.agonySound)
        spawnBloodParticles(p)              # 0x402D30 — randomises 14 blood hitboxes
        if (p.posY < landingY):             # airborne
            p.fatalityActive = 1
            knockback-jump(±30, 30, ±25)    # full arc
    }
```

`spawnBloodParticles` (`FUN_00402D30`) iterates the 14 hitbox slots,
finds the first free one (via `FUN_00401310`) and seeds it with a
random velocity:

```
particle.posX = p.posX + 0x96 + random(-25..25)
particle.posY = p.posY + 30 + random(-15..15)
particle.life = 10
particle.spreadXY = 10 - rand()%5, ...
```

Each particle is then ticked by `FUN_00401280` (gravity + decay) and
drawn by `FUN_00401150` using `blood.bmp`.

### 9.3 Blocking

Pressing **DECIMAL (P1)** or **H (P2)** calls `FUN_00402970` (block).
This sets `Character.isBlocking = 1` and overrides any incoming hit to
have **no effect** for both HP and animation. Block lasts a single
frame per keypress — to maintain guard you must hold the key.

### 9.4 KO detection

In `FUN_00401c10` (line 956–962):

```
if (scoreBoard[0] > 100 OR scoreBoard[1] < 0):
    if scoreBoard[1] < 0: p1Won = 1
    else: p1Won = 0
    showVictoryBanner = 1
```

### 9.5 Fatality

The "fatality" pose (`FUN_00402c10`) is *not* directly trigger-able by
input. It is invoked by the FightState when `bannerTick` between 150
and 400, on the *losing* player. The sequence after KO:

| bannerTick | Effect |
|------------|--------|
| 0   | (start victory banner) |
| 50  | Victory banner becomes visible |
| 150 | Loser enters Fatality animation (`FUN_00402c10`); `playedAwesome` set; play awesome-death sound on the FightState |
| 400 | `awesomedeath.wav` plays; loser switches to `Defeat` final pose; winner switches to `Victory` |
| 600 | Round officially over; controller advances to next round / credits |

So after every KO, the loser is automatically gibbed with the
character's fatality sprite sheet (`Fatality.bmp`, 8 frames), the global
"awesome death" sound plays, and only then does the round end.

---

## 10. HUD / score display — `FUN_00401510`

Draws the health bars across the top:

```
bar.bmp     (slot 0x0A) — empty bar background — drawn at (0..512, 0..80) for both sides
barback.bmp (slot 0x0B) — coloured fill bar — clipped/scaled to current HP
```

Layout:

```
P1 bar : x ∈ [0 .. 0+512], y ∈ [0 .. 80]
         the fill width is scoreBoard[0] * 2.56 + 450... actually:
P2 bar : x ∈ [450 .. 0+512], y ∈ [0 .. 80]
```

Detailed call sequence (from FUN_00401510):

```
draw barback.bmp (slot 11) at (0,0)→(512, 80)    // empty bar back
draw bar.bmp     (slot 10) at (0,0)→(512, 80)    // colour fill (left to right)
draw barback.bmp (slot 11) at (450,0)→(0,512)..  // empty bar back, mirrored for P2
draw bar.bmp     (slot 10) at (scoreBoard[0]*2.56 + 450, 0)→(512, 0)→…  // P2 fill (right-to-left)
```

The HP runs `0..100`. The width-multiplier `2.56` scales the
percentage into pixel units — 100 HP × 2.56 ≈ 256 pixels per bar.

Additional HUD elements:

* `player1.bmp` (slot 0x12) — "P1" label, 128×32 at top-left.
* `player2.bmp` (slot 0x13) — "P2" label, 128×32 at top-right.
* Round number — character thumbnail at centre of HUD (slot `6`,
  drawn at `(330, 0)`, 128×128).
* Character portraits are drawn beside their HP bar (slot `0x12`/`0x13`
  is a generic banner, not per-character).

There is no in-game timer.

---

## 11. Texture / asset slot table

Every asset is loaded once in `FUN_00407940` and assigned a numeric
slot (1..200) in the global TextureManager. The fight state and player
classes look textures up by slot via `FUN_004077a0(g_Game, slot)`
(which is `*((char*)g_Game + 8) + slot*4 + 4`).

| Slot | File path | Size | Notes |
|------|-----------|------|-------|
| 0   | `intro.bmp`              | full-screen | menu/intro background |
| 1   | `credits.bmp`            | full-screen | credits page |
| 2   | `leftArrow.bmp`          | 64×64       | menu cursor |
| 3   | `rightArrow.bmp`         | 64×64       | menu cursor (alt) |
| 4   | `credits.bmp`            | full-screen | duplicate alias |
| 5   | `ucfighter.bmp`          | 1024×1024   | title big-logo |
| 6   | `uclogo.bmp`             | 256×256     | small logo |
| 7   | `help.bmp`               | full-screen | help overlay |
| 8   | `paused.bmp`             | full-screen | pause overlay |
| 10  | `levelData/bar.bmp`      | 512×80      | HP bar fill |
| 11  | `levelData/barback.bmp`  | 512×80      | HP bar background |
| 13  | `levelData/fight.bmp`    | 512×512     | "FIGHT!" banner |
| 14  | `levelData/round1.bmp`   | 512×512     | "ROUND 1" banner |
| 15  | `levelData/round2.bmp`   | 512×512     | "ROUND 2" banner |
| 16  | `levelData/round3.bmp`   | 512×512     | "ROUND 3" banner |
| 17  | `levelData/victory.bmp`  | 512×512     | post-KO banner |
| 18  | `levelData/player1.bmp`  | 128×32      | "P1" label |
| 19  | `levelData/player2.bmp`  | 128×32      | "P2" label |
| 20  | `levelData/background1.bmp` | 2048×800 | fight bg #1 |
| 21  | `levelData/background2.bmp` | 2048×800 | fight bg #2 |
| 22  | `levelData/background3.bmp` | 2048×800 | fight bg #3 |
| 30  | `playerData/rob/Attack1.bmp` | 2048×512 (4 frames) |
| 31  | `playerData/rob/Attack2.bmp` | 2048×512 |
| 32  | `playerData/rob/Attack3.bmp` | 2048×512 |
| 33  | `playerData/rob/Attack4.bmp` | 2048×512 |
| 34  | `playerData/rob/Block.bmp`   | 512×512 (1 frame) |
| 35  | `playerData/rob/Defeat.bmp`  | 512×512 |
| 36  | `playerData/rob/Fatality.bmp`| 4096×512 (8 frames) |
| 37  | `playerData/rob/Stance.bmp`  | 2048×512 (4 frames) |
| 38  | `playerData/rob/Victory.bmp` | 512×512 |
| 39  | `playerData/rob/Walk.bmp`    | 2048×512 (4 frames) |
| 40  | `playerData/rob/thumbnail2.bmp` | 256×256 (large portrait) |
| 41  | `playerData/rob/thumbnail1.bmp` | 64×64 (small icon) |
| 50  | `playerData/geoff/Attack1.bmp` | 2048×512 |
| 51  | `playerData/geoff/Attack2.bmp` | 2048×512 |
| 52  | `playerData/geoff/Attack3.bmp` | 2048×512 |
| 53  | `playerData/geoff/Attack4.bmp` | 2048×512 |
| 54  | `playerData/geoff/Block.bmp`   | 512×512 |
| 55  | `playerData/geoff/Defeat.bmp`  | 512×512 |
| 56  | `playerData/geoff/Fatality.bmp`| 4096×512 |
| 57  | `playerData/geoff/Stance.bmp`  | 2048×512 |
| 58  | `playerData/geoff/Victory.bmp` | 512×512 |
| 59  | `playerData/geoff/Walk.bmp`    | 2048×512 |
| 60  | `playerData/geoff/thumbnail2.bmp` | 256×256 |
| 61  | `playerData/geoff/thumbnail1.bmp` | 64×64 |
| 70  | `playerData/trev/Attack1.bmp` | 2048×512 |
| 71  | `playerData/trev/Attack2.bmp` | 2048×512 |
| 72  | `playerData/trev/Attack3.bmp` | 2048×512 |
| 73  | `playerData/trev/Attack4.bmp` | 2048×512 |
| 74  | `playerData/trev/Block.bmp`   | 512×512 |
| 75  | `playerData/trev/Defeat.bmp`  | 512×512 |
| 76  | `playerData/trev/Fatality.bmp`| 4096×512 |
| 77  | `playerData/trev/Stance.bmp`  | 2048×512 |
| 78  | `playerData/trev/Victory.bmp` | 512×512 |
| 79  | `playerData/trev/Walk.bmp`    | 2048×512 |
| 80  | `playerData/trev/thumbnail2.bmp` | 256×256 |
| 81  | `playerData/trev/thumbnail1.bmp` | 64×64 |
| 82  | `playerData/trev/eski.bmp`     | special "eski" sprite — used in trev fatality blood overlay (FUN_004027e0 line 1213 selects slot 0x52 when fatality+blood) |
| 100 | `preloading.bmp`             | shown during boot |

> The 9-pose layout per character is consistent. The base slot for
> each character is:  `rob = 0x1E (30)`, `geoff = 0x32 (50)`,
> `trev = 0x46 (70)`. Within the 12-slot block the offset is:
> Attack1=0, Attack2=1, Attack3=2, Attack4=3, Block=4, Defeat=5,
> Fatality=6, Stance=7, Victory=8, Walk=9, thumb2=10, thumb1=11.
> The poseId at `+0x38` is the same offset (0..6), so the lookup is
> `tex = textureManager.get(characterId + poseId + 0xD)` — the `+0xD`
> base aligns to "Attack1" because of how `FUN_004027e0` adds 0xD when
> drawing (see line 1213: `param_1[0xe] + param_1[0x28]`).

### 11.1 Sprite-sheet frame layout

* **Stance, Walk, Attack1–4**: 2048×512 px → 4 frames of 512×512
  arranged horizontally.
* **Fatality**: 4096×512 px → 8 frames of 512×512.
* **Block, Defeat, Victory**: 512×512 single frame.
* The sprite is drawn at `(posX, posY - 512)` to `(posX + 128, posY)`
  (player sprite is 128 logical units wide on screen, full-height 512
  cropped). The actual draw call is `FUN_00405870(device, tex,
  frameIndex, totalFrames, posX)` — which computes the sub-rectangle
  inside the sheet as `(u0=frameIdx/total * sheetW, u1=(frameIdx+1)/total *
  sheetW)`.

---

## 12. Sound table

Loaded as `SoundBuffer` objects (size 0x110) via `FUN_00403d90`
(constructor) / `FUN_00403a90` (Load) / `FUN_00403d10` (Play).

| File | Owned by | Triggered when |
|------|----------|----------------|
| `intro.wav`                  | TitleState | state Enter() — looped or one-shot |
| `playerData/hurt.wav`        | Each Character (at +0x14) | Currently allocated but **playback hookup not located** in the studied subset — likely played on minor hit |
| `playerData/excert.wav`      | Each Character (at +0x40) | Per attack swing / start of action |
| `playerData/agony.wav`       | Each Character (at +0x44) | On take-hit (via FUN_00402d80) — heavy hit / blood spawn |
| `levelData/select.wav`       | CharacterSelect (at +0x68) | Cursor moves (per arrow-key press) |
| `levelData/selected.wav`     | CharacterSelect (at +0x6C) | Player confirms selection (Numpad1 / T) |
| `levelData/round1.wav`       | FightState (at +0x10) | Round 1 intro |
| `levelData/round2.wav`       | FightState (at +0x14) | Round 2 intro |
| `levelData/round3.wav`       | FightState (at +0x18) | Round 3 intro |
| `levelData/fight.wav`        | FightState (at +0x1C) | "FIGHT!" call (after round banner) |
| `levelData/awesomedeath.wav` | FightState (at +0x20) | bannerTick > 400 (post-fatality) |

Background music is enumerated by `FUN_00402370`: the directory
`data\\music\\*` is scanned with `FindFirstFile`/`FindNextFile`. Each
discovered file is wrapped as a DirectShow `IGraphBuilder` source
(see `FUN_00409020` — creates `FilgraphManager` `IID 00455400…`) and
plays a random track via the music-system (FUN_00408b40..FUN_00408fa0).
Music playback uses DirectShow (Filter Graph) — implying the assets are
likely `.mp3` or `.wav` files (DirectShow supports both natively).

In the JS port, music is just `new Audio()` cycled through the music
folder.

---

## 13. Character-select state (size 0x70)

Constructor `FUN_00402f30`. Tick `FUN_00403400`.

### 13.1 Layout (selected fields)

```
struct CharacterSelect {
    bool   bothConfirmed;        // +0x00 — set when both players locked in
    int    p1CharId;             // +0x04 — final 0x1E / 0x32 / 0x46
    int    p2CharId;             // +0x08
    int    p1ThumbnailSlot;      // +0x10 — texture slot for cursor blink
    int    p2ThumbnailSlot;      // +0x14
    int    p1Cursor;             // +0x18 — 0,1,2 (rob, geoff, trev)
    int    p2Cursor;             // +0x1C
    int    cursorSlots[3];       // +0x20..+0x28 — preset slots 0x41, 0x109, 0x1D1
    bool   p1Moved;              // +0x2C — cooldown for arrow key
    int    p1MoveTick;           // +0x30
    bool   p2Moved;              // +0x34
    int    p2MoveTick;           // +0x38
    int    p1Highlight;          // +0x3C — 1 if currently on column 0
    int    p2Highlight;          // +0x40
    int    p2Highlight2;         // +0x44 — column 2
    bool   p1Confirmed;          // +0x48
    bool   p2Confirmed;          // +0x49
    Character* preview_p1col0;   // +0x4C — rob preview (animated stance)
    Character* preview_p1col1;   // +0x50 — geoff
    Character* preview_p1col2;   // +0x54 — trev
    Character* preview_p2col0;   // +0x58 — rob (P2 side, mirrored)
    Character* preview_p2col1;   // +0x5C — geoff
    Character* preview_p2col2;   // +0x60 — trev
    SoundBuffer* selectSound;    // +0x68 — select.wav (move cursor)
    SoundBuffer* selectedSound;  // +0x6C — selected.wav (confirm)
};
```

The cursor slot table `[0x41, 0x109, 0x1D1]` is the X positions in
pixels for the 3 character thumbnails (65, 265, 465).

### 13.2 Tick

```
if (!p1Moved && !p1Confirmed):
    if (VK_RIGHT) p1Cursor++; p1Moved=1; play selectSound
    elif (VK_LEFT) p1Cursor--; p1Moved=1; play selectSound
    elif (VK_NUMPAD1) p1Confirmed=1; play selectedSound
    p1Cursor = ((p1Cursor % 3) + 3) % 3       // wrap
if (p1Moved):
    if (p1MoveTick > 10): p1Moved = 0; reset
    p1MoveTick++
[mirror for P2 with A/D/T]

set highlight flags depending on cursor columns
draw 6 character previews with the selected one enlarged (200% scale)
if (p1Confirmed && p2Confirmed): set bothConfirmed=1
   p1CharId = [0x1E, 0x32, 0x46][p1Cursor]
   p2CharId = [0x1E, 0x32, 0x46][p2Cursor]
advance all 6 character preview animations
```

### 13.3 Render — `FUN_004031f0`

Background `ucfighter.bmp` (slot 5), three thumbnail slots, two cursor
arrows (left/right), six animated character previews. Each preview is
drawn at one of six positions — top row P1, bottom row P2 (Y = 0x447a0000
= 1000.0/4 = 250 logical Y, scaled).

---

## 14. Rendering subsystem

### 14.1 Frame structure

Each tick the render path is roughly:

```
g_Device->Clear(0, NULL, Z_BUFFER|TARGET, 0xFF000000, 1.0f, 0)
FUN_004050C0(device)    # BeginScene + alpha-blend state
g_StateManager.current->Render()   # draws everything for current state
FUN_004050E0(device)    # EndScene
g_Device->Present(0,0,0,0)
```

`FUN_004050c0` sets:
* AlphaBlendEnable = true
* SrcBlend = SRCALPHA, DestBlend = INVSRCALPHA
* AlphaTestEnable = true, AlphaRef = 0x80, AlphaFunc = GREATER
* Z disable

…all configured with `SetRenderState`. Texture stage states force
modulate-with-alpha. (Decoded from FUN_004052e0 / FUN_004055e0 etc.)

`FUN_004055e0(device, texture, u0, v0, u1, v1, x_or_rot)`: builds 4
vertex buffer in `DAT_00455398..0x004553f4` (4 vertices, 6 floats each)
representing a screen-aligned quad and draws as `D3DPT_TRIANGLESTRIP`.

`FUN_00405870(device, tex, frame, total, x_or_rot)`: convenience —
selects sub-region of a horizontally-strip sheet based on
`frame/total`.

`FUN_00406560`: textured quad with rotation (param_7=1 enables
rotated UVs).

`FUN_00405d30`: solid colour quad (used for health-bar tinting).

### 14.2 Coordinate system

* Logical screen is 800×600.
* Origin top-left, Y down.
* Ground level for fighters is `y = 250` (so they appear in the lower
  half of the screen, "above ground" rendered as 512-tall sprites that
  bottom at `posY + 512` clamped).
* Health bars: y=0..80.
* Round banner: drawn full-quad at (0,0)→(512,512), rotated 170°.
  Actually 170 is likely an alpha/scale param given how render APIs work.

### 14.3 Font drawing — `FUN_00405920`

Three D3DXFont objects (12pt, 24pt, 48pt approx, indexed 1/2/3) live in
`DAT_004553F8/FC/00455400`. Text is rendered with `ID3DXFont::DrawText`
(vtable slot 0x18). Used for menu labels and any in-game numeric text.

In JS, use `ctx.font = '...'; ctx.fillText(...)`.

---

## 15. Browser implementation skeleton

A complete JS port should structure as:

```js
class Game {
    constructor() {
        this.tickHz = 50;
        this.lastTick = performance.now();
        this.accum = 0;
        this.keys = new Uint8Array(256);
        this.textures = {};         // slot → Image
        this.sounds = {};           // path → HTMLAudioElement
        this.state = null;          // current state instance
        this.states = {};           // 1..6 → singleton state
        this.tickCounter = 0;
    }
    async boot() {
        await this.loadAll();
        this.states = {
            1: new MenuState(this),
            2: new GameMatchState(this),
            3: new IntroState(this),
            4: new TitleState(this),
            5: new PauseState(this),
            6: new CreditsState(this),
        };
        this.setState(4);
        addEventListener('keydown', e => this.onKey(e, 1));
        addEventListener('keyup',   e => this.onKey(e, 0));
        requestAnimationFrame(t => this.loop(t));
    }
    setState(id) {
        if (this.state === this.states[id]) return;
        if (this.state) this.state.exit();
        this.state = id === 7 ? null : this.states[id];
        if (this.state) this.state.enter();
    }
    loop(now) {
        this.accum += now - this.lastTick;
        this.lastTick = now;
        while (this.accum >= 20) {
            this.accum -= 20;
            this.tickCounter++;
            if (this.state) this.state.tick(this.keys);
        }
        if (this.state) this.state.render(this.ctx);
        requestAnimationFrame(t => this.loop(t));
    }
    onKey(e, down) {
        this.keys[e.keyCode & 0xFF] = down;
        if (down && e.keyCode === 27) this.setState(7);   // ESC
        else if (down && this.state) this.state.onKeyDown(e.keyCode);
        e.preventDefault();
    }
}
```

Each state encapsulates `enter() / exit() / tick(keys) / render(ctx) /
onKeyDown(vk)`.

The fight-state class follows the FUN_00401c10 logic in §8.3; the
Character class follows §7.

---

## 16. Build / asset checklist

To rebuild this game in the browser:

1. **Assets**: copy the original `data/playerData/{rob,geoff,trev}/*.bmp`,
   `data/levelData/*.bmp`, `data/music/*.{wav,mp3}` and the top-level
   .wav files (intro.wav, hurt.wav, etc.) into `public/data/`.
   Convert BMPs to PNG (transparent magenta if any) for best browser
   support. Slot numbers can be replaced by string paths.

2. **Code**: structure as in §15 — one Game class, six State classes,
   one Character class, one Hitbox/Particle class.

3. **Controls**: implement the exact VK mapping from §6.3. Arrow keys
   and numpad for P1, WASD/TUYG/H for P2. Map JS `event.keyCode`
   directly (note `event.code` is *not* what you want — VK codes are
   numeric).

4. **Tick**: fixed 20-ms accumulator; physics in `tick()`, rendering in
   `render()`. Use `Math.floor(tickCounter % ticksPerFrame) === 1` to
   step through animation sequences exactly like the original.

5. **Sprite frames**: each animated sheet is `N` frames of 512×512
   arranged horizontally. Compute source rect as:
   ```
   const sw = sheet.width / total;
   ctx.drawImage(sheet, frame*sw, 0, sw, 512, posX, posY-512, 128, 512);
   ```
   `128` is the on-screen logical width (decoded from FUN_004027e0
   draw call at `*(int)fVar4 = 128 (0x80)`).

6. **Backgrounds**: `background1/2/3` are 2048×800 wide-strips. Scroll
   them by `velX_offset` (camera pan, decoded as `int*(this+0x24)` in
   FUN_00401ad0).

7. **HUD bar**: draw `bar.bmp` once for back, then clip a portion of
   `barback.bmp` to the current HP for each player. Width =
   `(scoreBoard[i] / 100) * 256` pixels approximately.

---

## 17. Reference: complete relevant function table

| Address | Symbol/role | Notes |
|---------|-------------|-------|
| `FUN_00401000` | Hitbox / blood-particle ctor (0x21C bytes) | 14 per player; FUN_004027e0 iterates and draws |
| `FUN_00401090` | Hitbox init `(x, y, life, alive)` | randomises spread |
| `FUN_00401150` | Hitbox draw (blood.bmp slot 0) | 14 sprites |
| `FUN_00401280` | Hitbox physics tick (gravity) | |
| `FUN_00401310` | "first free hitbox" search | returns 1 if found a slot |
| `FUN_00401350` | GlobalUnlock/Free wave-data block | |
| `FUN_00401380` | WaveLoad from .wav file (mmio) | |
| `FUN_00401480..AB` | accessors on WaveData | |
| `FUN_004014C0` | WaveData ctor | |
| `FUN_004014E0` | ScoreBoard ctor `{0, 100}` | per-fight |
| `FUN_00401510` | Health-bar HUD draw | §10 |
| `FUN_00401720` | FightState ctor | §8.2 |
| `FUN_00401AD0` | FightState render | §8.5 |
| `FUN_00401C10` | FightState tick (main combat loop) | §8.3 |
| `FUN_00402370` | MusicSystem ctor — enumerates `data\\music\\*` | §12 |
| `FUN_00402540` | MusicSystem play random | |
| `FUN_00402560` | MusicSystem stop | |
| `FUN_00402570` | Character ctor (HP, stats) | §7.1 |
| `FUN_004027E0` | Character draw (with blood overlay) | §7.5 |
| `FUN_00402930` | Action: Idle / Stance | §7.3 |
| `FUN_00402970` | Action: Block | |
| `FUN_004029B0` | Action: Defeat (taking-damage anim) | |
| `FUN_00402A00` | Action: Defeat-final | |
| `FUN_00402A40` | Action: Jump(dx, dy, landDx) | |
| `FUN_00402AA0` | Action: Attack 1 | |
| `FUN_00402AF0` | Action: Attack 2 | |
| `FUN_00402B50` | Action: Attack 3 | |
| `FUN_00402BB0` | Action: Attack 4 | |
| `FUN_00402C10` | Action: Fatality | |
| `FUN_00402C70` | Action: Walk(±dx) | |
| `FUN_00402CD0` | Action: Dash forward (20-unit step) | |
| `FUN_00402D30` | Spawn blood particles | |
| `FUN_00402D80` | Take damage | §9.2 |
| `FUN_00402DE0` | Character physics + anim advance | §7.5 |
| `FUN_00402F30` | CharacterSelect ctor (6 previews, 2 sounds) | §13 |
| `FUN_004031F0` | CharacterSelect render | §13.3 |
| `FUN_00403400` | CharacterSelect tick | §13.2 |
| `FUN_00403670` | GameMatch::Enter — alloc CharacterSelect | §5.6 |
| `FUN_00403790` | GameMatch::Tick — phase dispatcher | §8.4 |
| `FUN_00403A40..A90` | MusicSystem destructor & loader | |
| `FUN_00403D10` | Sound::Play | |
| `FUN_00403D70` | Sound::IsPlaying | |
| `FUN_00403D90` | Sound ctor `(this, path)` | |
| `FUN_00403DC0` | Sound dtor | |
| `FUN_00403DF0/E00` | base "Object" vtable stamper | §3.1 |
| `FUN_00403E60` | resume (FUN_00403E60) | pause/resume helpers |
| `FUN_00403E90` | pause | |
| `FUN_00403EC0` | **WndProc** | §2 |
| `FUN_00404030` | RegisterClass "SurfaceApp" | |
| `FUN_004040B0` | message loop | §1.3 |
| `FUN_00404130/140` | running flag setters | |
| `FUN_00404170` | string-into-static-buffer (path normaliser) | |
| `FUN_00404210` | shutdown | §1.4 |
| `FUN_004042A0` | MessageBox + PostQuit | error display |
| `FUN_00404350` | sprintf + MessageBox | |
| `FUN_004043F0` | DirectSound init | |
| `FUN_00404500` | D3D + Game init | §1.2 |
| `FUN_004046D0` | **WinMain** | §1.1 |
| `FUN_004047F0` | DirectInput Acquire + GetDeviceState | |
| `FUN_00404820` | DirectInput Unacquire | |
| `FUN_004049F0` | helper (FUN_00409750 wrap) — probably string-find | |
| `FUN_004050C0` | renderstate begin (alpha blending) | |
| `FUN_004050E0` | renderstate end | |
| `FUN_00405130` | renderstate restore | |
| `FUN_004055E0` | DrawTexturedQuad | §14.1 |
| `FUN_00405870` | DrawSpriteFrame | §14.1 |
| `FUN_00405920` | DrawText (via D3DXFont) | §14.3 |
| `FUN_00405D30` | DrawSolidQuad | |
| `FUN_00406250` | CreateFonts (3 sizes) | |
| `FUN_004062D0` | DestroyFonts | |
| `FUN_00406530..00406590` | DrawQuad variants (rotated, alpha) | |
| `FUN_00406A90` | TextureManager ctor | |
| `FUN_00406AB0/B00` | TextureManager dtor variants | |
| `FUN_00406AF0` | TextureManager::Get(idx) | |
| `FUN_00406B30` | TextureManager::Load(idx, path) | |
| `FUN_00406D40` | TextureManager::Unload | |
| `FUN_00406EA0` | "find sprite under cursor" — for menu hover | |
| `FUN_00407030` | reset hitbox visibility | |
| `FUN_004070C0/E0` | InputSystem ctor/init | |
| `FUN_00407150/1B0` | InputSystem dtor | |
| `FUN_00407620` | (related to InputSystem) | |
| `FUN_00407640` | TextureManager::Reload | |
| `FUN_004077A0` | Game::GetTexture(slot) wrapper | |
| `FUN_004077B0` | **Game ctor** | §3.1 |
| `FUN_004077F0` | **StateManager::SetState** | §4 |
| `FUN_00407880/890` | save/restore previous state (pause) | |
| `FUN_00407940` | **PreloadAllAssets** | §11 |
| `FUN_00408160` | **Game::OnInit** | §3.3 |
| `FUN_00408390` | **Game::OnDestroy** | §3.4 |
| `FUN_00408470` | DirectShow MusicPlayer ctor | §12 |
| `FUN_00408550` | TitleState::Enter (intro.wav) | §5.1 |
| `FUN_00408780` | MusicSystem::ctor (wraps FilgraphManager) | |
| `FUN_00408AD0` | MusicSystem::dtor | |
| `FUN_00408B40` | MusicSystem::Init (CoCreateInstance) | |
| `FUN_00408B90` | MusicSystem::LoadFile | |
| `FUN_00408C70` | MusicSystem::Play | |
| `FUN_00408CE0` | MusicSystem::Stop | |
| `FUN_00408FA0` | MusicSystem::IsPlaying | |
| `FUN_00409020` | MusicSystem::FilgraphMgr init | |
| `FUN_00409110..1D0` | helpers | |

---

## 18. Verified findings vs. assumptions

To make rebuilding straightforward, here is what is **confirmed** vs.
what is **inferred** by code-pattern matching:

### Confirmed

* WinMain, window class, window dimensions, D3D init parameters
  (`FUN_004046D0`, `FUN_00404030`, `FUN_00404500`).
* 50 Hz tick (`SetTimer(..., 20)`).
* All BMP/WAV file paths and their slot numbers (`FUN_00407940`).
* The complete `FUN_00401C10` fight-state logic, including the exact
  VK codes for both players.
* Character stats per fighter (rob/geoff/trev) from the literal
  immediate args at `FUN_00401720`.
* Round-banner timer phases (70 / 120 / 150 / 400 / 600).
* Damage per hit = 4 HP per connecting frame.
* World bounds 0..600 with snap-back, ground Y=250.
* Walk DX = ±20, attack-anim length = 7 frames at 2 ticks/frame.
* Animation sequence tables `[0,1,2,3,2,1,0]` for attack and
  `[0,1,2,3,2,1,6,0]` for walk.
* Match is best-of-3 rounds.
* Fatality fires automatically post-KO at bannerTick=150.

### Inferred (high confidence)

* The 6 state objects' names (Title, Intro, Menu, GameMatch, Pause,
  Credits). Their vtable functions weren't fully traced but their sizes
  and creation order match a typical fighting-game flow.
* Background scrolling — the camera follows `*(this+0x24)` (velX) but
  the exact follow rule wasn't re-derived.
* Player on-screen size of 128 px wide (from `fVar4 = 128.0f` in
  FUN_004027e0 draw call).
* Asset slot numbers 30/50/70 for the 3 characters' base offsets
  (consistent with the loop in `FUN_00407940`).

### Unknown

* Whether music tracks are randomised or sequential per round.
* Exact menu rendering — the menu state's tick wasn't dissected but it
  almost certainly draws `intro.bmp` plus a selection arrow.
* Exact help screen content (just blits `help.bmp`).
* Whether `hurt.wav` (per-character) is actually wired up to play —
  it's allocated but no `FUN_00403D10` call against `+0x14` was located
  in the studied subset.
* Numpad-decimal vs. numpad-period: `VK_DECIMAL (0x6E)` is used. In
  practice this is the period key on the numeric keypad.
* The function pointers in `PTR_FUN_004460x8` aren't in the
  decompilation output as separate symbols; they have to be derived
  from call-sites for full implementation.

When uncertain, fall back to the simplest sensible behaviour — the
game is small (1117 functions, ~1.6 MB binary) so most "missing"
details are minor.
