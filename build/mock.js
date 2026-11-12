/* Offline fixture for local testing: MOCK=1 node build/build.js. Not real data. */
module.exports = function () {
  let a = 12345; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const sizes = { 8: 16, 5: 18, 4: 16, 1: 17, 151: 14, 17: 10, 9: 8, 37: 14, 15: 13, 12: 10, 18: 2 }, teams = {}, games = [], fpi = {}, div = {}, cfpRank = {};
  let id = 1000, gid = 1; const byConf = {}, cols = ['a51d24', '0033a0', 'ff8200', '461d7c', '000000', 'f1b82d', '14213d', '006747', 'ffffff', '500000'];
  for (const c in sizes) { byConf[c] = []; for (let i = 0; i < sizes[c]; i++) { const t = String(c === '18' && i === 0 ? 87 : id++); teams[t] = { id: t, ab: 'T' + t.slice(-3), loc: 'Team ' + t, nick: 'Mocks', color: cols[(+t) % 10], alt: cols[(+t + 3) % 10], logo: 'x', conf: +c }; fpi[t] = +(rnd() * 40 - 12).toFixed(1); byConf[c].push(t); } }
  teams.fcs = { id: 'fcs', ab: 'FCS', loc: 'FCS U', nick: 'x', color: '333333', alt: 'cccccc', logo: 'x', conf: 29 };
  const play = (h, a2, wk, conf) => { const done = wk <= 10, d = fpi[h] - (fpi[a2] === undefined ? -18 : fpi[a2]) + 2.5 + (rnd() - 0.5) * 34, hw = d > 0; games.push({ id: String(gid++), date: `2026-${wk <= 5 ? '09' : wk <= 9 ? '10' : '11'}-${String(1 + ((wk * 7) % 27)).padStart(2, '0')}T20:00Z`, wk, h, a: a2, hs: done ? (hw ? 28 : 17) : 0, as: done ? (hw ? 17 : 28) : 0, done, conf, neutral: false, ccg: false }); };
  for (const c in byConf) { const T = byConf[c]; T.forEach(t => { play(t, 'fcs', 1, false); });
    if (c === '18') continue; const n = T.length, seen = new Set();
    for (let wk = 4; wk <= 13; wk++) { const order = T.slice().sort(() => rnd() - 0.5); for (let i = 0; i + 1 < n; i += 2) { const k = [order[i], order[i + 1]].sort().join('|'); if (seen.has(k)) continue; seen.add(k); play(order[i], order[i + 1], wk, true); } } }
  div[37] = [{ name: 'East', ids: byConf[37].slice(0, 7) }, { name: 'West', ids: byConf[37].slice(7) }];
  Object.keys(fpi).sort((x, y) => fpi[y] - fpi[x]).slice(0, 25).forEach((t, i) => { cfpRank[t] = i + 1; });
  return { teams, games, fpi, div, cfpRank, rankName: 'Mock rankings' };
};
