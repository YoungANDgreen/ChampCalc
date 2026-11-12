# ChampCalc

Interactive SEC Championship Game path calculator for the 2026 season. Pick any of the 16 SEC teams to see its title-game odds, its five most likely paths, a path tree, a rooting guide, and a live scenario builder.

`index.html` is the whole site: one static file, no build step on Vercel.

## How the numbers are made

- `build/engine.js` holds results through Nov 7, 2026, the 20 remaining SEC games, and the SEC tiebreaker (steps A to D).
- `build/pre.js` enumerates all 1,048,576 outcomes and writes `build/data.json`. Run it with `node pre.js` from `build/`.
- `build/template.html` is the page; `index.html` is the template with `data.json` and the engine inlined.

Win probabilities come from ESPN SP+ ratings dated Nov 8, 2026, with 2.5 points of home field and a 16.5-point standard deviation.
