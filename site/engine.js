/* ChampCalc tiebreak engine. Shared by the build (node) and the browser.
   conf = { slug, n, played:[[winner,loser]], rem:[[away,home]], pools:[[team idx]], spots, ab:[abbr],
            rate:[power rating], rank:[CFP rank or 0], nc:[non-conference wins, projected] }
   Each league's published procedure is encoded in RULES. Steps that depend on data nobody outside the
   league office has (SportSource ratings, future CFP rankings, computer composites) are estimated and flagged. */
(function (root, factory) { if (typeof module !== 'undefined') module.exports = factory(); else root.Engine = factory(); })(this, function () {
  const LABEL = {
    H2H: 'Head-to-head', H2H_B12: 'Head-to-head', H2H_RR: 'Head-to-head', H2H_PCT: 'Head-to-head', H2H_WIN: 'Head-to-head',
    COMMON: 'Record vs common opponents', WALK: 'Record vs highest-placed common opponent', SOS: "Opponents' combined conference win %",
    WINS: 'Total regular-season wins', CFP: 'CFP ranking', RATING: 'Team rating', DIVPCT: 'Division record', DIVWALK: 'Record vs next-highest division finisher', NONDIV: 'Record vs common cross-division opponents'
  };
  const EST = { CFP: 1, RATING: 1, WINS: 1 };
  // mode: 'elim' = lower teams drop out and the top group restarts; 'seed' = only a sole leader is seeded, everyone else carries on;
  //       'sunbelt' = lower teams drop out and three-plus survivors continue down the list; 'acc' = ACC 2026 policy.
  const RULES = {
    sec: { mode: 'elim', two: ['H2H', 'COMMON', 'WALK', 'SOS'], multi: ['H2H', 'COMMON', 'WALK', 'SOS'], stop: 'capped relative scoring margin', rating: null,
      src: 'SEC tiebreaking procedures', note: 'Ties that survive these four steps go to capped relative scoring margin, then a draw. Those are counted separately, not as in or out.' },
    bigten: { mode: 'elim', two: ['H2H', 'COMMON', 'WALK', 'SOS', 'RATING'], multi: ['H2H', 'COMMON', 'WALK', 'SOS', 'RATING'], rating: 'SportSource Analytics Team Rating Score',
      src: 'Big Ten championship game tiebreakers', note: 'The last step before a random draw is a SportSource Analytics rating that is not public.' },
    big12: { mode: 'seed', two: ['H2H', 'COMMON', 'WALK', 'SOS', 'WINS', 'RATING'], multi: ['H2H_B12', 'COMMON', 'WALK', 'SOS', 'WINS', 'RATING'], rating: 'SportSource Analytics rating',
      src: 'Big 12 tiebreaker policy', note: 'In a tie of three or more, the Big 12 only removes a team by seeding it. Teams that trail at a step stay in the group. Total wins counts one FCS win at most.' },
    acc: { mode: 'acc', two: ['H2H', 'RATING'], multi: ['H2H', 'RATING'], rating: 'SportSource Analytics Team Success Ranking',
      src: 'ACC football tiebreaker policy, amended July 2026', note: 'New for 2026. After head-to-head the ACC goes straight to the Team Success Ranking. A team with a different number of conference games counts as tied if it matches the leader in wins or in losses, and the procedure restarts after each team is chosen.' },
    american: { mode: 'elim', two: ['H2H', 'CFP', 'RATING'], multi: ['H2H', 'CFP', 'RATING'], rating: 'Composite of SP+, SportSource SOR, ESPN SOR and KPI',
      src: 'American Conference tiebreaking procedures (2025 edition; no 2026 revision found)', note: 'A ranked team only wins the CFP step if it also wins on the final weekend. ChampCalc does not model that condition.' },
    mwc: { mode: 'elim', two: ['H2H_PCT', 'CFP', 'RATING'], multi: ['H2H_PCT', 'CFP', 'RATING'], rating: 'Composite of computer rankings',
      src: 'Mountain West tiebreaker as described by the league and local reporting', note: 'A ranked team only wins the CFP step if it also wins on the final weekend. ChampCalc does not model that condition.' },
    pac12: { mode: 'seed', two: ['H2H', 'WALK', 'COMMON', 'CFP', 'RATING'], multi: ['H2H_RR', 'COMMON', 'WALK', 'SOS', 'RATING'], rating: 'SportSource Analytics Team Rating Score',
      src: 'Pac-12 2026 championship tiebreaker language', note: 'In a tie of three or more, head-to-head only counts when every tied team played every other. Once one team is seeded, the rest restart.' },
    sunbelt: { mode: 'sunbelt', two: ['H2H', 'DIVPCT', 'DIVWALK', 'NONDIV', 'CFP', 'RATING'], multi: ['H2H_PCT', 'DIVPCT', 'DIVWALK', 'NONDIV', 'CFP', 'RATING'], rating: 'Composite of SportSource, KPI, SP+ and ESPN SOR',
      src: 'Sun Belt football tie-breaking procedures', note: 'Each division is settled on its own. When a three-plus tie drops to two teams, the two-team list starts over.' },
    mac: { mode: 'elim', two: ['H2H', 'COMMON', 'RATING'], multi: ['H2H_WIN', 'COMMON', 'RATING'], rating: 'SportSource Analytics Team Rating Score',
      src: 'MAC championship tiebreaker (2025 edition; no 2026 revision found)', note: 'The SportSource rating comes third in the MAC, ahead of the standings walk and opponents\' win percentage, so those later steps rarely matter.' },
    cusa: { mode: 'elim', two: ['H2H', 'COMMON', 'WALK', 'RATING'], multi: ['H2H', 'COMMON', 'WALK', 'RATING'], rating: 'Average computer ranking',
      src: 'Conference USA championship tiebreaker policy (2025 edition; no 2026 revision found)', note: 'Opponents\' combined win percentage and a coin toss follow the computer ranking but are never reached here.' }
  };
  function make(conf) {
    const n = conf.n, rem = conf.rem, R = rem.length, pools = conf.pools, SP = conf.spots, rules = RULES[conf.slug] || RULES.sec;
    const rate = conf.rate || new Array(n).fill(0), rank = conf.rank || new Array(n).fill(0), nc = conf.nc || new Array(n).fill(0);
    const poolOf = new Int8Array(n); pools.forEach((p, i) => p.forEach(t => { poolOf[t] = i; }));
    const baseW = new Int16Array(n), G = new Int16Array(n), res = new Int8Array(n * n).fill(-1);
    conf.played.forEach(g => { baseW[g[0]]++; G[g[0]]++; G[g[1]]++; res[g[0] * n + g[1]] = 1; res[g[1] * n + g[0]] = 0; });
    rem.forEach(g => { G[g[0]]++; G[g[1]]++; });
    const W = new Int16Array(n), pct = new Float64Array(n);
    function apply(p) {
      W.set(baseW);
      for (let i = 0; i < R; i++) { const a = rem[i][0], h = rem[i][1]; if (p[i]) { W[h]++; res[h * n + a] = 1; res[a * n + h] = 0; } else { W[a]++; res[a * n + h] = 1; res[h * n + a] = 0; } }
      for (let t = 0; t < n; t++) pct[t] = G[t] ? W[t] / G[t] : 0;
    }
    const q = x => Math.round(1e9 * x);
    function h2h(group) { // per team: [wins, losses] among the tied teams, and whether everyone played everyone
      let rr = true; const wl = group.map(t => { let w = 0, l = 0; for (const o of group) if (o !== t) { const r = res[t * n + o]; if (r === 1) w++; else if (r === 0) l++; else rr = false; } return [w, l]; });
      return { rr, wl };
    }
    function tiers(group, opps) { // records vs each standings tier of opps, best tier first; tied opponents count as one group
      const out = [], ps = Array.from(new Set(opps.map(o => pct[o]))).sort((a, b) => b - a);
      for (const tp of ps) { const tier = opps.filter(o => pct[o] === tp); out.push(group.map(t => tier.reduce((s, o) => s + res[t * n + o], 0))); }
      return out;
    }
    const commonOf = (group, filter) => { const c = []; for (let o = 0; o < n; o++) { if (group.indexOf(o) >= 0 || (filter && !filter(o))) continue; let all = true; for (const t of group) if (res[t * n + o] === -1) { all = false; break; } if (all) c.push(o); } return c; };
    function metrics(name, group) { // returns a list of comparison arrays (most steps give one), or [] to skip
      const k = group.length;
      switch (name) {
        case 'H2H': { const h = h2h(group); if (k === 2) return h.wl[0][0] + h.wl[0][1] ? [h.wl.map(x => x[0])] : []; return [h.wl.map(x => h.rr ? x[0] : (x[0] === k - 1 ? 2 : (x[1] === k - 1 ? 0 : 1)))]; }
        case 'H2H_B12': { const h = h2h(group); return [h.wl.map(x => h.rr ? x[0] : (x[0] === k - 1 ? 1 : 0))]; }
        case 'H2H_WIN': { const h = h2h(group); return [h.wl.map(x => h.rr ? x[0] : (x[0] === k - 1 ? 1 : 0))]; }
        case 'H2H_RR': { const h = h2h(group); return h.rr ? [h.wl.map(x => x[0])] : []; }
        case 'H2H_PCT': { const h = h2h(group); return [h.wl.map(x => q(x[0] + x[1] ? x[0] / (x[0] + x[1]) : 0.5))]; }
        case 'COMMON': { const c = commonOf(group); return c.length ? [group.map(t => c.reduce((s, o) => s + res[t * n + o], 0))] : []; }
        case 'WALK': { const c = commonOf(group); return c.length ? tiers(group, c) : []; }
        case 'SOS': return [group.map(t => { let s = 0, c = 0; for (let o = 0; o < n; o++) if (res[t * n + o] !== -1) { s += pct[o]; c++; } return q(c ? s / c : 0); })];
        case 'WINS': return [group.map(t => nc[t] + W[t])];
        case 'CFP': return group.some(t => rank[t] > 0) ? [group.map(t => rank[t] > 0 ? 100 - rank[t] : 0)] : [];
        case 'RATING': return [group.map(t => q(rate[t]))];
        case 'DIVPCT': return [group.map(t => { let w = 0, g = 0; for (const o of pools[poolOf[t]]) if (o !== t && res[t * n + o] !== -1) { g++; w += res[t * n + o]; } return q(g ? w / g : 0); })];
        case 'DIVWALK': { const c = commonOf(group, o => poolOf[o] === poolOf[group[0]]); return c.length ? tiers(group, c) : []; }
        case 'NONDIV': { const c = commonOf(group, o => poolOf[o] !== poolOf[group[0]]); return c.length ? [group.map(t => c.reduce((s, o) => s + res[t * n + o], 0))] : []; }
      }
      return [];
    }
    const names = g => g.map(t => conf.ab[t]).join(', ');
    const lab = s => LABEL[s] + (EST[s] ? ' (estimated)' : '');
    // out = {sel:[], und:[], est:[]}
    function resolve(group, spots, out, log, est, start) {
      if (spots <= 0 || !group.length) return;
      if (group.length <= spots) { for (const t of group) { out.sel.push(t); if (est) out.est.push(t); } return; }
      const steps = group.length === 2 ? rules.two : rules.multi;
      for (let i = start || 0; i < steps.length; i++) {
        for (const m of metrics(steps[i], group)) {
          let mx = -Infinity; for (const v of m) if (v > mx) mx = v;
          const top = [], rest = []; group.forEach((t, j) => (m[j] === mx ? top : rest).push(t));
          if (!rest.length) continue;
          const e = est || !!EST[steps[i]];
          if (rules.mode === 'seed') {
            if (top.length !== 1) continue;
            if (log) log.push(lab(steps[i]) + ': ' + names(top) + ' is seeded');
            out.sel.push(top[0]); if (e) out.est.push(top[0]); return resolve(rest, spots - 1, out, log, est, 0);
          }
          if (top.length <= spots) {
            if (log) log.push(lab(steps[i]) + ': ' + names(top) + (top.length > 1 ? ' advance' : ' advances'));
            for (const t of top) { out.sel.push(t); if (e) out.est.push(t); } return resolve(rest, spots - top.length, out, log, est, 0);
          }
          if (log) log.push(lab(steps[i]) + ': ' + names(rest) + ' eliminated');
          return resolve(top, spots, out, log, e, rules.mode === 'sunbelt' && top.length > 2 ? i + 1 : 0);
        }
      }
      if (log) log.push('Still tied: ' + names(group) + (rules.stop ? ' go to ' + rules.stop : ' go to a draw'));
      out.und.push({ group: group.slice(), spots });
    }
    function accPick(group, out, log) { // choose one team from an ACC tie
      if (group.length === 1) return group[0];
      const h = h2h(group), k = group.length, byRate = g => g.slice().sort((a, b) => rate[b] - rate[a])[0];
      if (k === 2) { if (h.wl[0][0] !== h.wl[1][0]) { const t = group[h.wl[0][0] > h.wl[1][0] ? 0 : 1]; if (log) log.push('Head-to-head: ' + conf.ab[t] + ' is chosen'); return t; } }
      else if (h.rr) { let mx = -1; h.wl.forEach(x => { if (x[0] > mx) mx = x[0]; }); const top = group.filter((t, i) => h.wl[i][0] === mx); if (top.length === 1) { if (log) log.push('Head-to-head record among the tied teams: ' + conf.ab[top[0]] + ' is chosen'); return top[0]; } group = top; }
      else {
        const all = group.filter((t, i) => h.wl[i][0] === k - 1); if (all.length) { if (log) log.push('Head-to-head: ' + conf.ab[all[0]] + ' beat every other tied team'); return all[0]; }
        const none = group.filter((t, i) => h.wl[i][1] === k - 1); if (none.length) { if (log) log.push('Head-to-head: ' + conf.ab[none[0]] + ' lost to every other tied team and is removed'); return accPick(group.filter(t => t !== none[0]), out, log); }
      }
      const t = byRate(group); if (log) log.push('Team Success Ranking (estimated): ' + conf.ab[t] + ' is chosen from ' + names(group)); out.est.push(t); return t;
    }
    function accTitle(out, log) {
      let spots = SP, left = pools[0].slice();
      while (spots > 0 && left.length) {
        let mx = -1; for (const t of left) if (pct[t] > mx) mx = pct[t];
        const lead = left.filter(t => pct[t] === mx);
        const g = left.filter(t => pct[t] === mx || lead.some(o => G[o] !== G[t] && (W[o] === W[t] || G[o] - W[o] === G[t] - W[t])));
        if (g.length <= spots) { for (const t of g) out.sel.push(t); spots -= g.length; left = left.filter(t => g.indexOf(t) < 0); continue; }
        if (log) log.push(g.length + ' teams tied for ' + spots + ' spot' + (spots > 1 ? 's' : '') + ': ' + names(g));
        const t = accPick(g, out, log); out.sel.push(t); spots--; left = left.filter(x => x !== t);
      }
    }
    // call apply(p) first. returns {sel:[idx], und:[{group,spots}], est:[idx chosen through an estimated step]}
    function title(log) {
      const out = { sel: [], und: [], est: [] };
      if (rules.mode === 'acc') { accTitle(out, log); return out; }
      for (const pool of pools) {
        let spots = SP, left = pool.slice();
        while (spots > 0 && left.length) {
          let mx = -1; for (const t of left) if (pct[t] > mx) mx = pct[t];
          const g = left.filter(t => pct[t] === mx); left = left.filter(t => pct[t] !== mx);
          if (g.length <= spots) { for (const t of g) out.sel.push(t); spots -= g.length; continue; }
          if (log) log.push(g.length + ' teams tied at ' + W[g[0]] + '-' + (G[g[0]] - W[g[0]]) + ' for ' + spots + ' spot' + (spots > 1 ? 's' : '') + ': ' + names(g));
          resolve(g, spots, out, log, false, 0); break;
        }
      }
      return out;
    }
    return { n, R, W, G, pct, res, baseW, apply, title, rules };
  }
  return { make, RULES, LABEL, EST };
});
