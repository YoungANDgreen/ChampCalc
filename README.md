# ChampCalc

Every mathematically possible path to every FBS conference championship game, plus College Football Playoff odds. Live at https://champcalc.vercel.app.

## How it works

- `build/build.js` runs on Vercel at deploy time. It pulls results, schedules, FPI ratings, CFP rankings, colors and logos from ESPN's public API, then writes the static site to `public/`.
- `site/engine.js` is the tiebreak engine (head-to-head, common opponents, highest-placed common opponent, opponents' win percentage). The build and the browser's scenario builder share it.
- Conferences with 22 or fewer conference games left are enumerated exactly. Larger ones are simulated until the field narrows.
- The CFP tab simulates every remaining game and conference title game, ranks teams with a committee model refit to the latest CFP ranking, and fills the 12-team bracket under the 2026 rules.
- `.github/workflows/rebuild.yml` pushes a timestamp commit on a schedule so Vercel rebuilds with fresh data.

## Local test

`MOCK=1 node build/build.js` builds with a fake offline fixture (`build/mock.js`), then serve `public/`.
