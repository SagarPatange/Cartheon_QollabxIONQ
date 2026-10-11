# Handoff: Shor's Key and its review listener, 2026-10-11

## The app

**Shor's Key** teaches Shor's algorithm as a pin tumbler lock. The project lives in `Project_3_QDayLockpick/` and is built with Vite, React 19, TypeScript and GSAP.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # vitest, arithmetic only
npm run build    # static site in dist/
```

### How it is organised

The structure is borrowed from Super Mario Bros. 3:

1. **Title screen.** It shows "Shor's Key" and a Start button. Enter also starts.
2. **World map.** The map is Shor's circuit in standard notation. The |0⟩⊗8 wire runs along the top and the |1⟩⊗4 wire along the bottom. Each gate is a stop:
   - gcd (dashed, because it is classical)
   - init
   - H⊗8
   - U_f, spanning both wires
   - QFT†
   - two meters
   - the padlock, at the end of the wires

   A purple key marker walks between the stops. Wires light up in purple as far as you have reached. The only control is one big Play button. You can also click a stop, or use ←, → and Enter.
3. **Levels.** The lock fills the screen. A single panel at the bottom centre holds the level name (click it or press Esc to return to the map), the "i" button for instructions, and Continue. Instructions open on each level and hide when you click anywhere else. Continue flashes "Course clear", returns to the map and walks the key to the next stop.
4. **The last level, "Crack the Lock".** "Open the lock" pops the shackle and shows "World clear". A false set (k = 0, or a sub-harmonic k) sends you back to measure again. A bad key, such as a = 14, sends you back to the start.

The seven levels, one per step of the algorithm:

| Level | Name             | Step                |
| ----- | ---------------- | ------------------- |
| 1-1   | Pick a Key       | gcd                 |
| 1-2   | Blank Slate      | init                |
| 1-3   | All at Once      | H                   |
| 1-4   | The Lock Answers | U_f                 |
| 1-5   | Turn the Key     | QFT†                |
| 1-6   | Pins Drop        | M                   |
| 1-7   | Crack the Lock   | continued fractions |

### Deep links

| URL | Opens |
| --- | --- |
| `/` | Title screen |
| `/?map` | World map |
| `/?level=3&a=7` | Level 1-4 |
| `/?level=6&a=7&k=192&d=2` | Last level with a fixed measurement |

### Look

The look is Cartheon's design system from the `feat/neue-frutiger` branch:
- dark, warm palette
- purple accent for selection and the primary action
- green for open, amber for "yours next", red for failure
- square corners
- Neue Frutiger

**Font licence.** Neue Frutiger is licensed. The dev server reads it from the Cartheon worktree with `tools/cartheon-fonts.ts`, and it is never copied into this repo or a build.
- To use another folder, set `CARTHEON_FONTS` to a folder holding the `NeueFrutigerWorld-*.woff2` files.
- Without the font, the page falls back to Source Sans 3.

### Code

| Path | What |
| --- | --- |
| `src/shor/math.ts` | Pure arithmetic: period, exact inverse-QFT distribution, continued fractions, `readKey`. Tested. |
| `src/shor/model.ts` | Algorithm state mapped to lock state. The metaphor lives here. |
| `src/shor/levels.ts` | Level names, gates, and the text generated from the run. |
| `src/App.tsx` | Screens (title, map, level), progress, clears, keyboard. |
| `src/components/WorldMap.tsx` | The circuit map and the walking key. |
| `src/components/LockStage.tsx` | The SVG padlock, GSAP motion and camera. |
| `src/components/Hud.tsx` | The bottom-centre panel. |
| `src/components/Readout.tsx` | Level data shown inside the instructions. |
| `src/styles/tokens.css`, `src/styles/app.css` | Cartheon tokens and all styles. |

### Out of date or unchecked

- `README.md` and `CLAUDE.md` still describe an earlier layout. Only the README's title was updated.
- The last three changes were not lint-checked, type-checked or tested, because the user asked to skip that. They were the circuit map, the bottom panel and title screen, and the big Play button. The big Play button was also not looked at in a browser.
- The phone layout works but is cramped. The expanded panel covers most of the lock.
- `Project_3_QDayLockpick/` is untracked in git. The parent repo's working tree showed every tracked file staged as deleted, and that state was left alone.

## The review listener (Alt+right-click)

This mirrors the user's Cartheon tool in `~/.cartheon-review`, but it is built into the Vite dev server: no extension and no Python. It exists on the dev server only and is not in `npm run build`.

### How it works

1. With `npm run dev` running, Alt+right-click any element on the page. A note box opens. Pick Change, Bug or Design, type the note, and press Ctrl+Enter.
2. `tools/review/vite-plugin.ts` does three things:
   - It tags every JSX element with `data-src="src/file.tsx:line"`.
   - It injects `tools/review/client.ts`, the note box.
   - It serves `/__review`.
3. Each note is appended to `.review/reviews.jsonl`, and a screenshot is saved to `.review/shots/<id>.png`. The `.review/` folder is gitignored.
4. Each note records:
   - the source lines (`sources`)
   - the React components
   - the selector and text
   - the screen and level (`state`)
   - a `repro` URL
   - the screenshot path

### Commands

```sh
npm run review:watch                       # prints a line for each new open note
npm run review:list                        # every open note
npm run review:done -- <id> "what changed"
```

### Claude's loop

1. Run `review:watch` under the Monitor tool. Each note arrives as:
   ```
   REVIEW <id> [kind] <Component> <src:line> :: <note>
   ```
2. Read the entry in `reviews.jsonl` and look at the shot.
3. Edit the code, starting at `sources[0]`.
4. Mark the note done.

The Monitor expires every 30 minutes and has to be re-armed.

### Current state

- All notes are done. The inbox has 0 open.
- The listener was stopped at the end of this session.
