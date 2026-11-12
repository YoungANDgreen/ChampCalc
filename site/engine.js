/* ChampCalc tiebreak engine. Shared by the build (node) and the browser.
   conf = { n, played:[[winner,loser]], rem:[[away,home]], pools:[[team idx]], spots, ab:[abbr] } */
(function (root, factory) { if (typeof module !== 'undefined') module.exports = factory(); else root.Engine = factory(); })(this, function () {
  function make(conf) {
    const n = conf.n, rem = conf.rem, R = rem.length, pools = conf.pools, SP = conf.spots;
    const baseW = new Int16Array(n), G = new Int16Array(n), res = new Int8Array(n * n).fill(-1);
    conf.played.forEach(g => { baseW[g[0]]++; G[g[0]]++; G[g[1]]++; res[g[0] * n + g[1]] = 1; res[g[1] * n + g[0]] = 0; });
    rem.forEach(g => { G[g[0]]++; G[g[1]]++; });
    const W = new Int16Array(n), pct = new Float64Array(n);
    function apply(p) {
      W.set(baseW);
      for (let i = 0; i < R; i++) { const a = rem[i][0], h = rem[i][1]; if (p[i]) { W[h]++; res[h * n + a] = 1; res[a * n + h] = 0; } else { W[a]++; res[a * n + h] = 1; res[h * n + a] = 0; } }
      for (let t = 0; t < n; t++) pct[t] = G[t] ? W[t] / G[t] : 0;
    }
    function steps(group) {
      const k = group.length, out = [];
      if (k === 2) { const r = res[group[0] * n + group[1]]; out.push(['Head-to-head', r === -1 ? null : [r, 1 - r]]); }
      else {
        let rr = true; for (const a of group) for (const b of group) if (a !== b && res[a * n + b] === -1) rr = false;
        out.push(['Head-to-head', group.map(t => {
          let w = 0, l = 0; for (const o of group) if (o !== t) { const r = res[t * n + o]; if (r === 1) w++; else if (r === 0) l++; }
          if (rr) return w; return w === k - 1 ? 2 : (l === k - 1 ? 0 : 1);
        })]);
      }
      const common = [];
      for (let o = 0; o < n; o++) { if (group.indexOf(o) >= 0) continue; let all = true; for (const t of group) if (res[t * n + o] === -1) { all = false; break; } if (all) common.push(o); }
      if (common.length) {
        out.push(['Record vs common opponents', group.map(t => common.reduce((s, o) => s + res[t * n + o], 0))]);
        const tiers = Array.from(new Set(common.map(o => pct[o]))).sort((a, b) => b - a);
        for (const tp of tiers) { const tier = common.filter(o => pct[o] === tp); out.push(['Record vs highest-placed common opponent', group.map(t => tier.reduce((s, o) => s + res[t * n + o], 0))]); }
      }
      out.push(["Opponents' combined conference win %", group.map(t => { let s = 0, c = 0; for (let o = 0; o < n; o++) if (res[t * n + o] !== -1) { s += pct[o]; c++; } return Math.round(1e9 * (c ? s / c : 0)); })]);
      return out;
    }
    function breakTie(group, spots, log) {
      if (spots <= 0) return { sel: [], und: null };
      if (group.length <= spots) return { sel: group.slice(), und: null };
      for (const st of steps(group)) {
        const m = st[1]; if (!m) continue;
        let mx = -Infinity, same = true; for (const v of m) { if (v > mx) mx = v; } for (const v of m) if (v !== mx) { same = false; break; }
        if (same) continue;
        const top = [], rest = []; group.forEach((t, i) => (m[i] === mx ? top : rest).push(t));
        if (top.length <= spots) { if (log) log.push(st[0] + ': ' + top.map(t => conf.ab[t]).join(', ') + (top.length > 1 ? ' advance' : ' advances')); const r = breakTie(rest, spots - top.length, log); return { sel: top.concat(r.sel), und: r.und }; }
        if (log) log.push(st[0] + ': ' + rest.map(t => conf.ab[t]).join(', ') + ' eliminated');
        return breakTie(top, spots, log);
      }
      if (log) log.push('Still tied after four steps: ' + group.map(t => conf.ab[t]).join(', ') + ' go to later tiebreakers');
      return { sel: [], und: { group: group.slice(), spots } };
    }
    // returns {sel:[idx], und:[{group,spots}]}; call apply(p) first
    function title(log) {
      const sel = [], und = [];
      for (const pool of pools) {
        let spots = SP, left = pool.slice();
        while (spots > 0 && left.length) {
          let mx = -1; for (const t of left) if (pct[t] > mx) mx = pct[t];
          const g = left.filter(t => pct[t] === mx); left = left.filter(t => pct[t] !== mx);
          if (g.length <= spots) { for (const t of g) sel.push(t); spots -= g.length; continue; }
          if (log) log.push(g.length + ' teams tied at ' + W[g[0]] + '-' + (G[g[0]] - W[g[0]]) + ' for ' + spots + ' spot' + (spots > 1 ? 's' : '') + ': ' + g.map(t => conf.ab[t]).join(', '));
          const r = breakTie(g, spots, log); for (const t of r.sel) sel.push(t); if (r.und) und.push(r.und); break;
        }
      }
      return { sel, und };
    }
    return { n, R, W, G, pct, res, baseW, apply, title, breakTie };
  }
  return { make };
});
