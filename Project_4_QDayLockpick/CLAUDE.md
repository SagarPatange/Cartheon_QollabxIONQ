# QDay Lockpick: notes for Claude

## Review notes (Alt+right-click)

The user leaves notes on the running dev app by Alt+right-clicking an element. Each note is one line in
`.review/reviews.jsonl` (gitignored, local only) with a screenshot in `.review/shots/<id>.png`.

To pick them up live, run `npm run review:watch` with the Monitor tool. Each new note prints one line:

    REVIEW <id> [change|bug|design] <Component> <src/file.tsx:line> :: <note>

For each note:

1. Read its full entry in `.review/reviews.jsonl`. The useful fields are `sources` (nearest JSX element first,
   exact file and line), `components` (React components, nearest first), `selector`, `text`, `state`
   (the level and key the user was on) and `repro` (a URL that reopens that exact state).
2. Look at `shot`. The element the note is about has a brass outline.
3. Make the change in the source. `sources[0]` is where to start.
4. Verify: `npx tsc -b`, `npm test`, and a headless screenshot of `repro` if the change is visual.
5. Mark it done: `npm run review:done -- <id> "what changed"`.

`npm run review:list` prints every open note. The dev server must be running (`npm run dev`) for notes to save.

## Layout

- `src/shor/math.ts` is pure arithmetic and is unit tested. Keep it free of lock or React concepts.
- `src/shor/model.ts` maps the algorithm's state to the lock's state. The metaphor lives here.
- `src/shor/levels.ts` holds one entry per level, with text generated from the run.
- `tools/review/` is the review loop. It runs on the dev server only and never ships in `npm run build`.
