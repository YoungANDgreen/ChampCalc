/* ChampCalc build. Runs on Vercel at deploy time (needs network).
   Pulls results, schedules, FPI ratings and CFP rankings from ESPN, then writes public/. */
const fs = require('fs'), path = require('path');
const Engine = require('../site/engine.js');

const now = new Date();
const SEASON = +process.env.SEASON || (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);
const B = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const CONFS = { 8: ['SEC', 'sec'], 5: ['Big Ten', 'bigten'], 4: ['Big 12', 'big12'], 1: ['ACC', 'acc'], 151: ['American', 'american'], 17: ['Mountain West', 'mwc'], 9: ['Pac-12', 'pac12'], 37: ['Sun Belt', 'sunbelt'], 15: ['MAC', 'mac'], 12: ['Conference USA', 'cusa'] };
const ORDER = [8, 5, 4, 1, 151, 17, 9, 37, 15, 12];
const P4 = [8, 5, 4, 1], IND = 18, NOTRE_DAME = '87';
const HFA = 2.5, SD = 15, FCS_RATING = -18;
const EXACT_MAX = +process.env.EXACT_MAX || 22, MC_N = +process.env.MC_N || 1500000, CFP_N = +process.env.CFP_N || 30000;
const OUT = path.join(__dirname, '..', 'public');

function Phi(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
function rng32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const r4 = x => +(+x).toPrecision(4);
async function get(url) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url, { headers: { 'user-agent': 'champcalc-build' } }); if (r.ok) return await r.json(); console.log('http', r.status, url); }
    catch (e) { console.log('fetch error', e.message, url); }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error('Could not fetch ' + url);
}

async function load() {
  const teams = {}, games = [];
  for (let wk = 1; wk <= 16; wk++) {
    const s = await get(`${B}/scoreboard?groups=80&limit=400&week=${wk}&seasontype=2&dates=${SEASON}`);
    for (const e of s.events || []) {
      const c = e.competitions[0], h = c.competitors.find(x => x.homeAway === 'home'), a = c.competitors.find(x => x.homeAway === 'away');
      if (!h || !a || h.team.abbreviation === 'TBD' || a.team.abbreviation === 'TBD' || +h.team.id < 0 || +a.team.id < 0) continue;
      const st = e.status.type;
      if (!st.completed && st.name !== 'STATUS_SCHEDULED') continue; // canceled, postponed, in progress
      for (const x of [h, a]) { const t = x.team; teams[t.id] = teams[t.id] || { id: t.id, ab: t.abbreviation, loc: t.location, nick: t.name, color: t.color || '555555', alt: t.alternateColor || 'cccccc', logo: t.logo || `https://a.espncdn.com/i/teamlogos/ncaa/500/${t.id}.png`, conf: +t.conferenceId }; }
      const note = (c.notes && c.notes[0] && c.notes[0].headline) || '';
      games.push({ id: e.id, date: e.date, wk, h: h.team.id, a: a.team.id, hs: +h.score, as: +a.score, done: !!st.completed, conf: !!c.conferenceCompetition, neutral: !!c.neutralSite, ccg: /championship/i.test(note) && !/FCS|Division/i.test(note) && h.team.conferenceId === a.team.conferenceId && !!CONFS[+h.team.conferenceId] });
    }
  }
  const fpi = {};
  try {
    const g = await get('https://site.web.api.espn.com/apis/fitt/v3/sports/football/college-football/powerindex?region=us&lang=en&limit=200');
    for (const t of g.teams) { const c = t.categories.find(x => x.name === 'fpi'); if (c) fpi[t.team.id] = +c.values[0]; }
  } catch (e) { console.log('FPI unavailable', e.message); }
  if (Object.keys(fpi).length < 100) throw new Error('FPI ratings missing; refusing to build with bad data');
  const div = {};
  try {
    const st = await get(`https://site.api.espn.com/apis/v2/sports/football/college-football/standings?season=${SEASON}&group=80`);
    for (const c of st.children || []) {
      const kids = (c.children || []).filter(k => k.standings && k.standings.entries && k.standings.entries.length);
      if (kids.length === 2) div[+c.id] = kids.map(k => ({ name: k.name.replace(/^.* - /, ''), ids: k.standings.entries.map(e => e.team.id) }));
    }
  } catch (e) { console.log('standings unavailable', e.message); }
  let cfpRank = {}, rankName = '';
  try {
    const r = await get(`${B}/rankings`);
    const pick = r.rankings.find(x => /playoff/i.test(x.name)) || r.rankings.find(x => /AP/i.test(x.name));
    if (pick) { rankName = pick.shortHeadline || pick.name; for (const x of pick.ranks) cfpRank[x.team.id] = x.current; }
  } catch (e) { console.log('rankings unavailable', e.message); }
  return { teams, games, fpi, div, cfpRank, rankName };
}

function analyze(C, ph) {
  const E = Engine.make(C), n = C.n, R = C.rem.length, exact = R <= EXACT_MAX, total = exact ? Math.pow(2, R) : MC_N;
  const poolOf = new Int8Array(n); C.pools.forEach((p, i) => p.forEach(t => { poolOf[t] = i; }));
  const MW = 16, SZ = n + 1, I4 = (t, w, k, s) => ((t * MW + w) * 3 + k) * SZ + s, I3 = (t, w, k) => (t * MW + w) * 3 + k;
  const cT = new Float64Array(n * MW * 3 * SZ), cI = new Float64Array(n * MW * 3 * SZ), cM = new Float64Array(n * MW * 3), mI = new Float64Array(n * MW * 3), mT = new Float64Array(n * MW);
  const totP = new Float64Array(n), marP = new Float64Array(n), lev = new Float64Array(n * R * 2), sig = Array.from({ length: n }, () => new Map());
  const p = new Uint8Array(R), status = new Int8Array(n);
  let tally = null;
  function scenario(wt, doCount, doModel) {
    E.apply(p); const r = E.title(); status.fill(0);
    for (const t of r.sel) status[t] = 1; for (const u of r.und) for (const t of u.group) status[t] = 2;
    for (let t = 0; t < n; t++) {
      const st = status[t]; if (!doCount && st === 0) { if (doModel && !tally) mT[t * MW + E.W[t]] += wt; continue; }
      const pc = E.pct[t], pool = C.pools[poolOf[t]]; let better = 0, tied = 0, am = 0, tm = 0;
      for (const o of pool) { const d = E.pct[o]; if (d > pc) { better++; am += 1 << o; } else if (d === pc) { tied++; if (o !== t) tm += 1 << o; } }
      const w = E.W[t], k = better > 2 ? 2 : better;
      if (doCount) { cT[I4(t, w, k, tied)]++; if (st === 1) cI[I4(t, w, k, tied)]++; else if (st === 2) cM[I3(t, w, k)]++; }
      if (doModel) {
        if (!tally) mT[t * MW + w] += wt;
        if (st === 1) {
          const key = w * 1099511627776 + am * 1048576 + tm;
          if (tally) { const o = tally[t].get(key); if (o) { o.prob += wt; for (let g = 0; g < R; g++) if (p[g]) o.hw[g] += wt; } }
          else { mI[I3(t, w, k)] += wt; totP[t] += wt; for (let g = 0; g < R; g++) lev[(t * R + g) * 2 + p[g]] += wt; sig[t].set(key, (sig[t].get(key) || 0) + wt); }
        } else if (st === 2 && !tally) marP[t] += wt;
      }
    }
  }
  function modelPass() {
    if (exact) { for (let m = 0; m < total; m++) { let wt = 1; for (let i = 0; i < R; i++) { const b = (m >>> i) & 1; p[i] = b; wt *= b ? ph[i] : 1 - ph[i]; } scenario(wt, !tally, true); } }
    else { const rnd = rng32(20261); for (let s = 0; s < MC_N; s++) { for (let i = 0; i < R; i++) p[i] = rnd() < ph[i] ? 1 : 0; scenario(1 / MC_N, false, true); } }
  }
  if (!exact) { const rnd = rng32(777); for (let s = 0; s < MC_N; s++) { for (let i = 0; i < R; i++) p[i] = rnd() < 0.5 ? 1 : 0; scenario(0, true, false); } }
  modelPass();
  tally = sig.map(m => new Map([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => [e[0], { prob: 0, hw: new Float64Array(R) }])));
  if (R > 0) modelPass();
  // assemble
  const stats = [];
  for (let t = 0; t < n; t++) {
    const rec = {}; let c = 0, mc = 0;
    for (let w = 0; w < MW; w++) {
      let T = 0, I = 0, M = 0, IP = 0; const b = {};
      for (let k = 0; k < 3; k++) {
        let bt = 0, bi = 0; const s = {};
        for (let z = 1; z < SZ; z++) { const x = cT[I4(t, w, k, z)]; if (x) { s[z] = [cI[I4(t, w, k, z)], x]; bt += x; bi += cI[I4(t, w, k, z)]; } }
        if (bt) b[k] = { t: bt, i: bi, ip: r4(mI[I3(t, w, k)]), m: cM[I3(t, w, k)], s };
        T += bt; I += bi; M += cM[I3(t, w, k)]; IP += mI[I3(t, w, k)];
      }
      if (T) rec[w] = { t: T, tp: r4(mT[t * MW + w]), i: I, ip: r4(IP), m: M, b };
      c += I; mc += M;
    }
    const paths = [...tally[t].entries()].filter(e => e[1].prob > 0).sort((a, b) => b[1].prob - a[1].prob).map(([key, o]) => {
      const w = Math.floor(key / 1099511627776), am = Math.floor(key / 1048576) % 1048576, tm = key % 1048576, bits = m => { const a = []; for (let i = 0; i < n; i++) if (m & (1 << i)) a.push(i); return a; };
      const g = []; for (let i = 0; i < R; i++) { const s = o.hw[i] / o.prob; if (s > 0.99999) g.push([i, 1]); else if (s < 0.00001) g.push([i, 0]); }
      return { w, above: bits(am), tied: bits(tm), prob: r4(o.prob), g };
    });
    stats.push({ p: r4(totP[t]), c, mp: r4(marP[t]), mc, dead: false, rec, paths, lev: Array.from({ length: R }, (_, g) => [r4(lev[(t * R + g) * 2] / (1 - ph[g])), r4(lev[(t * R + g) * 2 + 1] / ph[g])]) });
  }
  // elimination: exact mode is a proof; sampled mode runs a targeted search for any team with no hits
  for (let t = 0; t < n; t++) {
    const s = stats[t]; if (s.c || s.mc || s.p || s.mp) continue;
    if (exact) { s.dead = true; continue; }
    const rnd = rng32(9000 + t); let found = false;
    for (let it = 0; it < 250000 && !found; it++) {
      const bias = it % 2 ? 0.5 : 0.8;
      for (let i = 0; i < R; i++) { const a = C.rem[i][0], h = C.rem[i][1]; if (h === t) p[i] = 1; else if (a === t) p[i] = 0; else { const fav = E.baseW[h] / (E.G[h] || 1) >= E.baseW[a] / (E.G[a] || 1) ? 1 : 0; p[i] = rnd() < bias ? 1 - fav : fav; } }
      E.apply(p); const r = E.title(); if (r.sel.includes(t) || r.und.some(u => u.group.includes(t))) found = true;
    }
    if (found) s.rare = true; else s.dead = true;
  }
  return { exact, total, stats };
}

function cfp(D, confs, prob) {
  const { teams, games, fpi, cfpRank } = D;
  const fbs = Object.values(teams).filter(t => CONFS[t.conf] || t.conf === IND).map(t => t.id), isF = new Set(fbs);
  const rate = id => fpi[id] !== undefined ? fpi[id] : FCS_RATING;
  const sorted = fbs.map(rate).sort((a, b) => b - a), REF = sorted[Math.min(11, sorted.length - 1)];
  const qref = (opp, site) => Phi((REF - rate(opp) + site * HFA) / SD); // site: +1 home, -1 away, 0 neutral
  const base = {}; fbs.forEach(id => { base[id] = { w: 0, l: 0, res: 0 }; });
  const ccgDone = {}, ccgSet = {};
  for (const g of games) {
    if (g.ccg) { const c = teams[g.h].conf; if (g.done) ccgDone[c] = g.hs > g.as ? g.h : g.a; else ccgSet[c] = [g.h, g.a]; }
    if (!g.done) continue;
    const hw = g.hs > g.as, s = g.neutral ? 0 : 1;
    if (isF.has(g.h)) { const b = base[g.h]; hw ? b.w++ : b.l++; b.res += (hw ? 1 : 0) - qref(g.a, s); }
    if (isF.has(g.a)) { const b = base[g.a]; hw ? b.l++ : b.w++; b.res += (hw ? 0 : 1) - qref(g.h, -s); }
  }
  const RG = games.filter(g => !g.done && !g.ccg).map(g => ({ h: g.h, a: g.a, ph: prob(g.h, g.a, g.neutral), qh: qref(g.a, g.neutral ? 0 : 1), qa: qref(g.h, g.neutral ? 0 : -1), ci: -1, gi: -1 }));
  const CE = confs.map(c => { const E = Engine.make(c.C); const key = new Map(c.C.rem.map((r, i) => [c.C.ids[r[0]] + '@' + c.C.ids[r[1]], i])); return { c, E, p: new Uint8Array(c.C.rem.length), key }; });
  RG.forEach(g => { CE.forEach((ce, ci) => { const i = ce.key.get(g.a + '@' + g.h); if (i !== undefined) { g.ci = ci; g.gi = i; } }); });
  // committee model: resume above a bubble-level team, plus rating, minus a per-loss penalty. Fit to this week's ranking.
  const CH = 0.25; let WF = 0.05, LP = 0.3, fit = null;
  const rankedIds = Object.keys(cfpRank).filter(id => isF.has(id));
  if (rankedIds.length >= 20) {
    let best = Infinity;
    for (let wf = 0; wf <= 0.1201; wf += 0.01) for (let lp = 0; lp <= 0.801; lp += 0.1) {
      const sc = fbs.map(id => [id, base[id].res + wf * rate(id) - lp * base[id].l]).sort((a, b) => b[1] - a[1]), pos = {}; sc.forEach((x, i) => { pos[x[0]] = i + 1; });
      let err = 0; for (const id of rankedIds) err += Math.min(20, Math.abs(pos[id] - cfpRank[id]));
      if (err < best) { best = err; WF = wf; LP = lp; }
    }
    fit = r4(best / rankedIds.length);
  }
  const st = {}; fbs.forEach(id => { st[id] = { make: 0, auto: 0, atl: 0, bye: 0, host: 0, title: 0, fin: 0, champ: 0, ccg: 0, seed: new Array(12).fill(0), byL: {}, wo: [0, 0] }; });
  const cur = {}; fbs.forEach(id => { cur[id] = { w: 0, l: 0, res: 0, lost: false, champ: false }; });
  const G6 = Object.keys(CONFS).map(Number).filter(c => !P4.includes(c));
  function season(rnd, chalk) {
    for (const id of fbs) { const b = base[id], c = cur[id]; c.w = b.w; c.l = b.l; c.res = b.res; c.lost = false; c.champ = false; }
    for (const g of RG) {
      const hw = chalk ? g.ph >= 0.5 : rnd() < g.ph;
      if (g.ci >= 0) CE[g.ci].p[g.gi] = hw ? 1 : 0;
      const H = cur[g.h], A = cur[g.a];
      if (H) { if (hw) H.w++; else { H.l++; H.lost = true; } H.res += (hw ? 1 : 0) - g.qh; }
      if (A) { if (hw) { A.l++; A.lost = true; } else A.w++; A.res += (hw ? 0 : 1) - g.qa; }
    }
    const champs = {};
    for (const ce of CE) {
      const cid = ce.c.id; let fin;
      if (ccgDone[cid]) { champs[cid] = ccgDone[cid]; cur[ccgDone[cid]].champ = true; continue; }
      if (ccgSet[cid]) fin = ccgSet[cid];
      else {
        ce.E.apply(ce.p); const r = ce.E.title(); const sel = r.sel.slice();
        for (const u of r.und) { const g = u.group.slice().sort((x, y) => rate(ce.c.C.ids[y]) - rate(ce.c.C.ids[x])); for (let i = 0; i < u.spots && i < g.length; i++) sel.push(g[i]); }
        fin = sel.slice(0, 2).map(i => ce.c.C.ids[i]);
      }
      if (fin.length < 2) { if (fin[0]) { champs[cid] = fin[0]; cur[fin[0]].champ = true; } continue; }
      const pa = prob(fin[0], fin[1], true), aw = chalk ? pa >= 0.5 : rnd() < pa, A = cur[fin[0]], Bt = cur[fin[1]];
      if (!chalk) { st[fin[0]].ccg++; st[fin[1]].ccg++; }
      A.res += (aw ? 1 : 0) - qref(fin[1], 0); Bt.res += (aw ? 0 : 1) - qref(fin[0], 0);
      if (aw) { A.w++; Bt.l++; } else { A.l++; Bt.w++; }
      const ch = aw ? fin[0] : fin[1]; champs[cid] = ch; cur[ch].champ = true;
    }
    const sc = fbs.map(id => { const c = cur[id]; return [id, c.res + WF * rate(id) - LP * c.l + (c.champ ? CH : 0)]; }).sort((a, b) => b[1] - a[1]);
    const pos = {}; sc.forEach((x, i) => { pos[x[0]] = i; });
    const autos = new Map(); P4.forEach(c => { if (champs[c]) autos.set(champs[c], CONFS[c][0] + ' champion'); });
    let g6 = null; for (const c of G6) if (champs[c] && (g6 === null || pos[champs[c]] < pos[g6[0]])) g6 = [champs[c], CONFS[c][0] + ' champion']; if (g6 && !autos.has(g6[0])) autos.set(g6[0], g6[1]);
    if (pos[NOTRE_DAME] !== undefined && pos[NOTRE_DAME] < 12) autos.set(NOTRE_DAME, 'Top-12 Notre Dame');
    const field = [...autos.keys()]; for (const x of sc) { if (field.length >= 12) break; if (!autos.has(x[0])) field.push(x[0]); }
    field.sort((a, b) => pos[a] - pos[b]);
    return { field, autos, pos };
  }
  const game = (rnd, a, b, homeA) => (rnd() < Phi((rate(a) - rate(b) + (homeA ? HFA : 0)) / SD) ? a : b);
  const rnd = rng32(424242);
  for (let s = 0; s < CFP_N; s++) {
    const { field, autos } = season(rnd, false), inF = new Set(field);
    field.forEach((id, i) => { const x = st[id]; x.make++; x.seed[i]++; if (autos.has(id)) x.auto++; else x.atl++; if (i < 4) x.bye++; else if (i < 8) x.host++; });
    for (const id of fbs) { const c = cur[id], x = st[id]; if (c.champ) x.champ++; const b = x.byL[c.l] || (x.byL[c.l] = [0, 0]); b[0]++; if (inF.has(id)) b[1]++; if (!c.lost) { x.wo[0]++; if (inF.has(id)) x.wo[1]++; } }
    const f = field, r1 = [game(rnd, f[7], f[8], true), game(rnd, f[4], f[11], true), game(rnd, f[5], f[10], true), game(rnd, f[6], f[9], true)];
    const q = [game(rnd, f[0], r1[0]), game(rnd, f[3], r1[1]), game(rnd, f[2], r1[2]), game(rnd, f[1], r1[3])];
    const s1 = game(rnd, q[0], q[1]), s2 = game(rnd, q[2], q[3]); st[s1].fin++; st[s2].fin++; st[game(rnd, s1, s2)].title++;
  }
  const ch = season(null, true);
  const list = fbs.filter(id => st[id].make > 0 || cfpRank[id]).map(id => { const x = st[id], t = teams[id]; return { id, ab: t.ab, loc: t.loc, nick: t.nick, color: t.color, alt: t.alt, logo: t.logo, conf: CONFS[t.conf] ? CONFS[t.conf][1] : 'ind', confName: CONFS[t.conf] ? CONFS[t.conf][0] : 'Independent', w: base[id].w, l: base[id].l, rk: cfpRank[id] || null, fpi: r4(rate(id)), make: r4(x.make / CFP_N), auto: r4(x.auto / CFP_N), atl: r4(x.atl / CFP_N), bye: r4(x.bye / CFP_N), host: r4(x.host / CFP_N), title: r4(x.title / CFP_N), fin: r4(x.fin / CFP_N), champ: r4(x.champ / CFP_N), ccg: r4(x.ccg / CFP_N), seed: x.seed.map(v => r4(v / CFP_N)), byL: x.byL, wo: x.wo }; }).sort((a, b) => b.make - a.make || (a.rk || 99) - (b.rk || 99));
  return { n: CFP_N, fit, wf: r4(WF), lp: r4(LP), rankName: D.rankName, teams: list, chalk: ch.field.map((id, i) => ({ seed: i + 1, id, ab: teams[id].ab, loc: teams[id].loc, color: teams[id].color, alt: teams[id].alt, logo: teams[id].logo, tag: ch.autos.get(id) || 'At-large' })) };
}

module.exports = { analyze, Phi };
if (require.main === module) (async () => {
  const t0 = Date.now(), D = process.env.MOCK ? require('./mock.js')() : await load(), { teams, games, fpi, div, cfpRank } = D;
  console.log('season', SEASON, 'games', games.length, 'teams', Object.keys(teams).length, 'fpi', Object.keys(fpi).length, 'ranked', Object.keys(cfpRank).length);
  const rate = id => fpi[id] !== undefined ? fpi[id] : FCS_RATING;
  const prob = (h, a, neutral) => Math.min(0.995, Math.max(0.005, Phi((rate(h) - rate(a) + (neutral ? 0 : HFA)) / SD)));
  const day = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  const overall = {}; for (const g of games) if (g.done) { const hw = g.hs > g.as; for (const [id, won] of [[g.h, hw], [g.a, !hw]]) { const o = overall[id] || (overall[id] = [0, 0]); o[won ? 0 : 1]++; } }
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
  const confs = [], index = [];
  for (const cid of ORDER) {
    const ids = Object.values(teams).filter(t => t.conf === cid).sort((a, b) => a.loc.localeCompare(b.loc)).map(t => t.id), ix = new Map(ids.map((id, i) => [id, i]));
    const cg = games.filter(g => g.conf && !g.ccg && ix.has(g.h) && ix.has(g.a)).sort((a, b) => a.date.localeCompare(b.date));
    const played = cg.filter(g => g.done).map(g => g.hs > g.as ? [ix.get(g.h), ix.get(g.a)] : [ix.get(g.a), ix.get(g.h)]);
    const remG = cg.filter(g => !g.done), rem = remG.map(g => [ix.get(g.a), ix.get(g.h)]), ph = remG.map(g => prob(g.h, g.a, g.neutral));
    let pools = [ids.map((_, i) => i)], divNames = null;
    if (div[cid] && div[cid].every(d => d.ids.every(id => ix.has(id))) && div[cid][0].ids.length + div[cid][1].ids.length === ids.length) { pools = div[cid].map(d => d.ids.map(id => ix.get(id))); divNames = div[cid].map(d => d.name); }
    const C = { n: ids.length, ids, ab: ids.map(id => teams[id].ab), played, rem, pools, spots: pools.length === 2 ? 1 : 2 };
    const t1 = Date.now(), A = analyze(C, ph);
    console.log(CONFS[cid][0], 'teams', C.n, 'played', played.length, 'left', rem.length, A.exact ? 'exact' : 'sampled', (Date.now() - t1) + 'ms', 'top:', A.stats.map((s, i) => [C.ab[i], s.p]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0] + ' ' + (100 * x[1]).toFixed(1) + '%').join(', '), 'dead:', A.stats.filter(s => s.dead).length);
    const now = ids.map((_, i) => [0, 0]); played.forEach(g => { now[g[0]][0]++; now[g[1]][1]++; });
    const out = { id: cid, slug: CONFS[cid][1], name: CONFS[cid][0], exact: A.exact, total: A.total, spots: C.spots, pools, divNames, played, rem: remG.map((g, i) => [rem[i][0], rem[i][1], day(g.date), r4(ph[i])]),
      teams: ids.map((id, i) => { const t = teams[id]; return { id, ab: t.ab, loc: t.loc, nick: t.nick, color: t.color, alt: t.alt, logo: t.logo, fpi: r4(rate(id)), rk: cfpRank[id] || null, w: now[i][0], l: now[i][1], ow: (overall[id] || [0, 0])[0], ol: (overall[id] || [0, 0])[1] }; }), stats: A.stats };
    fs.writeFileSync(path.join(OUT, 'data', CONFS[cid][1] + '.json'), JSON.stringify(out));
    confs.push({ id: cid, C });
    index.push({ slug: CONFS[cid][1], name: CONFS[cid][0], exact: A.exact, left: rem.length, teams: ids.length, best: A.stats.map((s, i) => [ids[i], s.p]).sort((a, b) => b[1] - a[1])[0][0] });
  }
  const P = cfp(D, confs, prob);
  console.log('CFP fit', P.fit, 'wf', P.wf, 'lp', P.lp, 'top:', P.teams.slice(0, 14).map(t => t.ab + ' ' + (100 * t.make).toFixed(0)).join(', '));
  console.log('chalk:', P.chalk.map(x => x.seed + '.' + x.ab + '[' + x.tag + ']').join(' '));
  fs.writeFileSync(path.join(OUT, 'data', 'cfp.json'), JSON.stringify(P));
  const lastDone = games.filter(g => g.done).map(g => g.date).sort().pop();
  fs.writeFileSync(path.join(OUT, 'data', 'index.json'), JSON.stringify({ season: SEASON, built: new Date().toISOString(), through: lastDone ? day(lastDone) : null, confs: index, model: { hfa: HFA, sd: SD, exactMax: EXACT_MAX, mcN: MC_N, cfpN: CFP_N } }));
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'site'))) fs.copyFileSync(path.join(__dirname, '..', 'site', f), path.join(OUT, f));
  console.log('built in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
})().catch(e => { console.error('BUILD FAILED', e); process.exit(1); });
