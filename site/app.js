/* ChampCalc front end. Data comes from /data/*.json, written by build/build.js at deploy time. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), view = $('view');
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pc = x => { const v = 100 * x; return (v === 0 ? '0' : v >= 99.95 ? '100' : v >= 1 ? v.toFixed(1) : v >= 0.01 ? v.toFixed(2) : '<0.01') + '%'; };
  const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  let INDEX = null, D = null, E = null, CFP = null, cur = 0, slug = '', flying = null;
  const cache = {};
  const load = f => cache[f] ? Promise.resolve(cache[f]) : fetch('data/' + f + '.json').then(r => { if (!r.ok) throw new Error(f); return r.json(); }).then(j => (cache[f] = j));

  /* colors */
  const rgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
  const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  function palette(t) {
    let c = rgb(t.color || '555555'), a = rgb(t.alt || 'cccccc');
    if ((lum(c) < 0.03 && lum(a) > 0.06) || (lum(c) > 0.8 && lum(a) < 0.6)) { const x = c; c = a; a = x; }
    let hi = c, n = 0; while (lum(hi) < 0.2 && n++ < 12) hi = mix(hi, [255, 255, 255], 0.14);
    let ac = a; n = 0; while (lum(ac) < 0.42 && n++ < 12) ac = mix(ac, [255, 255, 255], 0.16);
    if (dist(ac, hi) < 70) ac = [236, 228, 210];
    return { brand: hex(c), hi: hex(hi), accent: hex(ac), on: lum(c) > 0.36 ? '#141414' : '#ffffff' };
  }
  function theme(p) { const s = document.documentElement.style; s.setProperty('--brand', p.brand); s.setProperty('--brand-hi', p.hi); s.setProperty('--accent', p.accent); s.setProperty('--on-brand', p.on); }
  const logo = t => { const p = palette(t); return `<span class="logo" style="--lb:${p.brand};--lo:${p.on}"><img src="${t.logo}" alt="${t.loc} logo" loading="lazy" onerror="this.parentNode.classList.add('nologo')"><b aria-hidden="true">${t.ab}</b></span>`; };
  const meter = (a, b, extra) => `<span class="meter"><em><b style="width:${Math.max(a ? 1.5 : 0, 100 * a / b)}%"></b></em><span class="num">In: ${fmt(a)} of ${fmt(b)} ${unit()} · ${pc(a / b)}${extra ? ' · ' + extra : ''}</span></span>`;
  const unit = () => D.exact ? 'combinations' : 'simulations';

  /* tabs + routing */
  function drawTabs() {
    $('tabs').innerHTML = `<button class="tab cfp" data-s="cfp" aria-pressed="${slug === 'cfp'}">CFP</button>` + INDEX.confs.map(c => `<button class="tab" data-s="${c.slug}" aria-pressed="${slug === c.slug}">${c.name}</button>`).join('');
    const on = $('tabs').querySelector('[aria-pressed="true"]'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  $('tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) go(b.dataset.s); });
  function setHash(h) { try { history.replaceState(null, '', '#' + h); } catch (e) { location.hash = h; } try { localStorage.setItem('champcalc', h); } catch (e) { } }
  function go(s, teamId, animate) {
    if (flying) flying();
    if (s === 'cfp') { slug = 'cfp'; drawTabs(); setHash('cfp'); view.innerHTML = '<p class="loading">Loading playoff odds…</p>'; return load('cfp').then(j => { CFP = j; drawCFP(); }).catch(fail); }
    const meta = INDEX.confs.find(c => c.slug === s) || INDEX.confs[0];
    slug = meta.slug; drawTabs();
    if (!cache[slug]) view.innerHTML = '<p class="loading">Loading ' + meta.name + '…</p>';
    return load(slug).then(j => {
      D = j; E = Engine.make({ n: D.teams.length, played: D.played, rem: D.rem.map(r => [r[0], r[1]]), pools: D.pools, spots: D.spots, ab: D.teams.map(t => t.ab) });
      let i = D.teams.findIndex(t => t.id === String(teamId)); if (i < 0) i = D.teams.findIndex(t => t.id === meta.best); if (i < 0) i = 0;
      shell(); select(i, animate);
    }).catch(fail);
  }
  const fail = e => { view.innerHTML = '<p class="loading">Could not load data (' + (e && e.message) + '). Try again in a minute.</p>'; };

  /* conference page */
  const NOW = i => D.teams[i], left = i => D.rem.map((g, k) => ({ k, g })).filter(x => x.g[0] === i || x.g[1] === i);
  const dead = i => D.stats[i].dead, name = i => D.teams[i].loc;
  const total = i => D.teams[i].w + D.teams[i].l + left(i).length;
  const recOf = (i, w) => w + '-' + (total(i) - w);
  const poolOf = i => D.pools.findIndex(p => p.includes(i));
  const goal = () => 'the ' + D.name + ' title game';
  function shell() {
    view.innerHTML = `<nav class="picker" id="picker" aria-label="Pick a school"></nav><header class="top" id="top"></header>
    <section id="s-paths"><h2>Five most likely paths <small>Ranked by ESPN FPI win probabilities</small></h2><div class="paths" id="paths"></div></section>
    <section id="s-tree"><h2>The path tree <small>Tap a node to open its branches</small></h2>
      <div class="legend"><span class="t-ok"><i class="dot"></i>Viable path</span><span class="t-warn"><i class="dot"></i>Requires tiebreaker</span><span class="t-bad"><i class="dot"></i>Eliminated</span>
      <span><span data-tip="${D.exact ? 'One combination is one full set of winners for every remaining conference game. Counts treat each game as a coin flip. Model chance weights each game by FPI.' : 'This conference has too many games left to list every combination, so counts come from ' + fmt(D.total) + ' coin-flip simulations. Model chance weights each game by FPI.'}" tabindex="0">${D.exact ? 'Combinations' : 'Simulations'} vs model chance</span></span></div>
      <div class="toolbar"><button class="btn" id="expand">Expand all</button><button class="btn" id="collapse">Collapse all</button></div><div id="tree"></div></section>
    <section><h2>Scenario builder <small>Pick winners and the tiebreaker runs live</small></h2>
      <div class="toolbar"><button class="btn" id="winout">Selected school wins out</button><button class="btn" id="chalk">Pick all favorites</button><button class="btn" id="reset">Clear all</button></div>
      <div class="builder"><div class="games" id="games"></div><div class="verdict" id="verdict" aria-live="polite"></div></div></section>
    <section id="s-guide"><h2>Rooting guide <small id="guide-sub"></small></h2>
      <div class="legend"><span class="t-ok"><i class="dot"></i>Title-game chance if the listed team wins</span><span class="t-bad"><i class="dot"></i>If it loses</span></div><div class="guide" id="guide"></div></section>
    <section><h2>${D.name} standings <small>Tap a row to switch schools</small></h2><div class="tbl"><table id="table"></table></div></section>
    <section><details><summary>How ties are broken here</summary>
      <ol type="A"><li><b>Head-to-head</b> among the tied teams. In a tie of three or more where not everyone played everyone, a team advances only by beating all the others and is dropped only by losing to all of them.</li>
      <li><b>Record against common conference opponents.</b></li><li><b>Record against the highest-placed common opponent</b>, then the next one down the standings.</li>
      <li><b>Combined conference winning percentage of each team's conference opponents.</b></li></ol>
      <p style="margin:0 0 14px;color:var(--muted);font-size:14px">${D.slug === 'sec' ? 'These are the first four steps of the SEC procedure. Ties that survive them go to capped scoring margin and are counted separately, not as in or out.' : 'This is the SEC sequence, applied to every league so the math is comparable. The ' + D.name + ' follows the same opening steps, but its later steps differ, so close multi-team ties here are an approximation. Ties that survive all four steps are counted separately, not as in or out.'}${D.spots === 1 ? ' The ' + D.name + ' sends its two division winners to the title game, so each tie is broken inside a division.' : ''}</p></details></section>
    <section><div class="note" id="note"></div></section>`;
    $('picker').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) select(+b.dataset.t, true); });
    $('table').addEventListener('click', e => { const r = e.target.closest('tr.row'); if (r) select(+r.dataset.t, true); });
    $('table').addEventListener('keydown', e => { if (e.key === 'Enter') { const r = e.target.closest('tr.row'); if (r) select(+r.dataset.t, true); } });
    $('expand').onclick = () => setAll(true);
    $('collapse').onclick = () => { setAll(false); const b = document.querySelector('#tree button'); if (b) b.click(); };
    $('games').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.g, s = +b.dataset.s; picks[i] = picks[i] === s ? null : s; drawGames(); evaluate(); });
    $('reset').onclick = () => { picks.fill(null); drawGames(); evaluate(); };
    $('winout').onclick = () => { winOut(); drawGames(); evaluate(); };
    $('chalk').onclick = () => { D.rem.forEach((g, i) => { picks[i] = g[3] >= 0.5 ? 1 : 0; }); drawGames(); evaluate(); };
    picks = D.rem.map(() => null);
  }
  const odds = i => { const s = D.stats[i]; return s.dead ? 'OUT' : (s.p === 0 && (s.rare || s.c || s.mc) ? '<0.01%' : pc(s.p)); };
  function drawPicker() {
    const order = D.teams.map((_, i) => i).sort((a, b) => D.stats[b].p - D.stats[a].p || D.teams[b].w - D.teams[a].w);
    $('picker').innerHTML = order.map(i => `<button type="button" class="chip${dead(i) ? ' dead' : ''}" data-t="${i}" aria-pressed="${i === cur}" style="--sz:38px" title="${name(i)}">${logo(D.teams[i])}<span>${D.teams[i].ab}</span><small class="num">${odds(i)}</small></button>`).join('');
    $('table').innerHTML = `<tr><th>Team</th><th>Conf</th><th>Overall</th><th class="r">FPI</th><th>Left</th><th class="r">Title game, model</th><th class="r">${D.exact ? 'Combinations' : 'Sim share'}</th></tr>` +
      order.map(i => { const t = D.teams[i], s = D.stats[i]; return `<tr class="row${i === cur ? ' sel' : ''}" data-t="${i}" tabindex="0"><td class="tm">${logo(t)}${t.loc}${t.rk ? ' <span style="color:var(--muted);font-weight:400">#' + t.rk + '</span>' : ''}</td><td class="num">${t.w}-${t.l}</td><td class="num">${t.ow}-${t.ol}</td><td class="r num">${t.fpi.toFixed(1)}</td>
      <td>${left(i).map(x => (x.g[0] === i ? 'at ' + D.teams[x.g[1]].ab : 'vs ' + D.teams[x.g[0]].ab)).join(', ') || 'Done'}</td><td class="r num">${s.dead ? '<span style="color:var(--bad)">Eliminated</span>' : odds(i)}</td><td class="r num">${D.exact ? fmt(s.c) : pc(s.c / D.total)}</td></tr>`; }).join('');
  }
  function quote(i) { return D.slug === 'sec' ? `In the SEC it just means more, it didn't mean enough to ${name(i)} this year.` : `The ${D.name} title game goes on without ${name(i)} this year.`; }
  function drawTop(i) {
    const t = D.teams[i], d = D.stats[i], L = left(i), mx = t.w + L.length, R = d.rec, gone = dead(i);
    const live = Object.keys(R).map(Number).filter(w => R[w].i || R[w].m).sort((a, b) => b - a), top = R[mx];
    let badge = 'Eliminated';
    if (!gone) badge = !L.length ? (d.p > 0.5 ? 'Clinched' : 'Waiting on tiebreakers') : (top && top.i === top.t ? 'Wins out and it is in' : (live.length <= 1 || (R[live[1]].i / R[live[1]].t < 0.02) ? 'Win Out Required' : 'Needs help'));
    const tiles = gone ? '' : `<div class="tiles">
      <div class="tile"><b class="num">${odds(i)}</b><span>model chance to reach ${goal()}, from ESPN FPI win probabilities</span></div>
      <div class="tile"><b class="num">${pc(d.c / D.total)}</b><span>of all ${unit()} put ${t.loc} in${D.exact ? ' (' + fmt(d.c) + ' of ' + fmt(D.total) + ')' : ''}</span></div>
      <div class="tile"><b class="num">${top ? pc(top.i / top.t) : 'n/a'}</b><span>of ${unit()} work if ${t.loc} wins out to finish ${recOf(i, mx)}</span></div></div>`;
    $('top').innerHTML = `<div class="hero"><div class="herologo" id="herologo">${logo(t)}${gone ? '<div class="stamp">Eliminated</div>' : ''}</div>
      <div><div class="eyebrow">${D.name} · results through ${INDEX.through || 'this week'} · ${INDEX.season}</div>
      <h1>${t.loc} ${t.nick} <span>${D.name} Championship</span> Paths</h1></div></div>
      ${gone ? `<p class="quote">${quote(i)}</p><p class="lede">${t.loc} is ${t.w}-${t.l} in the ${D.name} and can finish no better than ${recOf(i, mx)}. ${D.exact ? 'None of the ' + fmt(D.total) + ' ways the remaining conference games can finish puts it in ' + goal() + '.' : 'No path turned up in ' + fmt(D.total) + ' simulations or in a targeted search of its best cases.'}</p>`
        : `<p class="lede">${t.loc} is ${t.w}-${t.l} in the ${D.name} (${t.ow}-${t.ol} overall) with ${L.length} conference game${L.length === 1 ? '' : 's'} left. ${D.exact ? 'Every one of the ' + fmt(D.total) + ' ways the last ' + D.rem.length + ' conference games can finish was run through the tiebreaker.' : 'With ' + D.rem.length + ' conference games left there are too many combinations to list, so these numbers come from ' + fmt(D.total) + ' simulations.'}</p>`}
      <p style="margin:14px 0 0"><span class="badge"><i></i>${badge}</span></p>
      <div class="wins">${L.map(x => `<div><small>${x.g[2]} · ${x.g[1] === i ? 'Home' : 'Away'}</small>${x.g[1] === i ? 'vs ' + name(x.g[0]) : 'at ' + name(x.g[1])} <span style="color:var(--muted)" class="num">· ${pc(x.g[1] === i ? x.g[3] : 1 - x.g[3])}</span></div>`).join('')}</div>
      ${tiles}<div class="yard" aria-hidden="true"></div>`;
    const head = gone ? 'Eliminated' : d.p >= 0.5 ? 'Favorite to get there' : d.p >= 0.1 ? 'Live contender' : d.p >= 0.01 ? 'Long shot, mathematically open' : 'Extremely low probability but mathematically open';
    $('note').innerHTML = `<h3>${head}</h3><p>${gone ? `No ${D.exact ? 'combination of results' : 'simulated season'} gets ${t.loc} to ${goal()}.` :
      `${t.loc} reaches ${goal()} in ${D.exact ? fmt(d.c) + ' of ' + fmt(D.total) + ' remaining combinations (' + pc(d.c / D.total) + ')' : pc(d.c / D.total) + ' of coin-flip simulations'}${d.mc ? `, plus ${D.exact ? fmt(d.mc) : pc(d.mc / D.total)} that would come down to later tiebreakers` : ''}. Weighted by FPI win probabilities, that is a ${odds(i)} chance, which is the better estimate of real odds.`}</p>`;
  }
  function drawPaths(i) {
    const d = D.stats[i], div = D.spots === 1 ? D.divNames[poolOf(i)] : null;
    $('paths').innerHTML = d.paths.length ? d.paths.map((p, k) => {
      const rec = recOf(i, p.w), ab = p.above.map(name), ti = p.tied.map(name), n = ti.length + 1; let h, sub;
      if (div) { if (!ti.length) { h = `Finish ${rec}, win the ${div} outright`; sub = 'No tiebreaker needed.'; } else { h = `Finish ${rec}, win a ${n}-way tiebreak for the ${div}`; sub = `Tied at the top of the division with ${list(ti)}.`; } }
      else if (!ab.length && !ti.length) { h = `Finish ${rec}, alone in first`; sub = 'No tiebreaker. The top seed.'; }
      else if (!ab.length && ti.length === 1) { h = `Finish ${rec}, tied for first with ${ti[0]}`; sub = 'Both teams go. The tiebreaker only sets the seeding.'; }
      else if (!ab.length) { h = `Finish ${rec}, survive a ${n}-way tie for first`; sub = `Tied with ${list(ti)}. Top two of the group advance.`; }
      else if (!ti.length) { h = `Finish ${rec}, second outright behind ${ab[0]}`; sub = 'No tiebreaker needed.'; }
      else { h = `Finish ${rec} behind ${ab[0]}, win a ${n}-way tiebreak for second`; sub = `Tied with ${list(ti)}. One spot for the group.`; }
      const must = p.g.map(x => { const g = D.rem[x[0]], w = x[1] ? g[1] : g[0], l = x[1] ? g[0] : g[1]; return `<span>${name(w)} over ${name(l)} <i class="num">${g[2]} · ${pc(x[1] ? g[3] : 1 - g[3])}</i></span>`; });
      return `<article class="path"><div class="rk num">${k + 1}</div><div><h3>${h}</h3><p>${sub}</p>
        <div class="pr"><span><b class="num">${pc(p.prob)}</b> model chance</span><span><b class="num">${pc(p.prob / d.p)}</b> of ${name(i)}'s title-game chance</span></div>
        ${must.length ? `<p style="margin-top:8px;color:var(--cream)">Required in every ${D.exact ? '' : 'simulated '}version of this path:</p><div class="must">${must.join('')}</div>` : '<p style="margin-top:8px">No single game is required. Several different result sets produce these final standings.</p>'}</div></article>`;
    }).join('') : '<div class="empty">No path showed up in the model-weighted runs. Any remaining route is too unlikely to rank.</div>';
  }

  /* tree */
  let uid = 0;
  function renderNode(n) {
    const id = 'n' + (++uid), has = !!(n.detail || (n.kids && n.kids.length)), el = document.createElement('div');
    el.className = 'node t-' + n.tone + (has ? '' : ' leaf');
    el.innerHTML = `<button type="button" ${has ? `aria-expanded="${!!n.open}" aria-controls="${id}"` : 'aria-disabled="true"'}><span class="mark" aria-hidden="true">${n.mark}</span>
      <span><span class="nt">${n.title}</span>${n.pill ? `<span class="pill">${n.pill}</span>` : ''}<span class="ns">${n.sub || ''}</span>${n.meter || ''}</span>${has ? '<span class="chev" aria-hidden="true">▶</span>' : '<span></span>'}</button>`;
    if (has) {
      const fold = document.createElement('div'); fold.className = 'fold' + (n.open ? ' open' : ''); fold.id = id;
      const inner = document.createElement('div'), kids = document.createElement('div'); kids.className = 'kids';
      if (n.detail) { const dd = document.createElement('div'); dd.className = 'detail'; dd.innerHTML = n.detail; kids.appendChild(dd); }
      (n.kids || []).forEach(k => kids.appendChild(renderNode(k)));
      inner.appendChild(kids); fold.appendChild(inner); el.appendChild(fold);
      el.firstElementChild.addEventListener('click', e => { const b = e.currentTarget, o = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', o); fold.classList.toggle('open', o); });
    }
    return el;
  }
  const setAll = o => document.querySelectorAll('#tree button[aria-expanded]').forEach(b => { b.setAttribute('aria-expanded', o); $(b.getAttribute('aria-controls')).classList.toggle('open', o); });
  function sizeRows(B, tone) { const ks = Object.keys(B.s).map(Number).sort((a, b) => a - b); return `<div class="rows t-${tone}">` + ks.map(k => `<div><span>${k === 1 ? 'Alone at this record' : k + ' teams tied'}</span><em><b style="width:${100 * B.s[k][0] / B.s[k][1]}%"></b></em><span class="num">${fmt(B.s[k][0])} / ${fmt(B.s[k][1])}</span></div>`).join('') + '</div>'; }
  function branch(B, k, rec, i) {
    if (!B) return null; const nm = name(i), S = D.spots, where = S === 1 ? ' in the division' : '';
    if (k >= S) return { tone: 'bad', mark: '✕', title: `${S === 1 ? '1+' : '2+'} teams better than ${rec}${where}`, pill: 'Eliminated', sub: `${S === 1 ? 'A better record takes the division.' : 'Two teams ahead fill both spots.'} ${fmt(B.t)} ${unit()}, zero for ${nm}. No further paths.` };
    const tone = B.i === 0 ? (B.m ? 'warn' : 'bad') : (B.i === B.t ? 'ok' : 'warn');
    return { tone, mark: k ? 'B' : 'A', title: (k ? 'Branch B · Exactly 1 team' : 'Branch A · 0 teams') + ` better than ${rec}${where}`, pill: tone === 'ok' ? 'Viable' : tone === 'bad' ? 'Eliminated' : 'Tiebreaker',
      sub: k ? `One team is locked in as the top seed. ${nm} needs to be the best of the teams at ${rec}.` : (S === 1 ? `${rec} is the best record in the division. ${nm} needs to win any tie at the top.` : `${rec} is the best record in the league. ${nm} needs to rank in the top two of the teams at ${rec}.`),
      meter: meter(B.i, B.t, 'model ' + pc(B.ip)), detail: `<p>Results by how many teams finish ${rec}, counting ${nm}${B.m ? `. ${fmt(B.m)} more go to later tiebreakers` : ''}:</p>` + sizeRows(B, tone) };
  }
  function drawTree(i) {
    const d = D.stats[i], R = d.rec, L = left(i), t = D.teams[i], mx = t.w + L.length, nm = t.loc;
    const ws = Object.keys(R).map(Number).sort((a, b) => b - a), live = ws.filter(w => R[w].i || R[w].m), deadW = ws.filter(w => !(R[w].i || R[w].m));
    const kids = live.map((w, ix) => { const r = R[w], rec = recOf(i, w), got = w - t.w, tone = r.i === r.t ? 'ok' : 'warn';
      const br = [];
      if (D.spots === 1) { const b0 = branch(r.b[0], 0, rec, i), tt = (r.b[1] ? r.b[1].t : 0) + (r.b[2] ? r.b[2].t : 0); if (b0) br.push(b0); if (tt) br.push(branch({ t: tt }, 1, rec, i)); }
      else for (let k = 0; k < 3; k++) { const b = branch(r.b[k], k, rec, i); if (b) br.push(b); }
      return { tone, mark: String(w), open: ix === 0, title: `Finish ${rec}` + (!L.length ? '' : w === mx ? ' · win out' : ` · go ${got}-${L.length - got}`), pill: tone === 'ok' ? 'Viable' : 'Needs help',
        sub: `Model chance of this record: ${pc(r.tp)}. ${nm} is in for ${pc(r.i / r.t)} of the ${unit()} at ${rec}.`, meter: meter(r.i, r.t, 'model ' + pc(r.ip)),
        kids: [{ tone: 'info', mark: '?', open: ix === 0, title: `How many teams finish better than ${rec}?`, sub: D.spots === 1 ? 'Zero keeps the path open. Any team ahead in the division closes it.' : 'Zero or one keeps the path open. Two or more closes it.', kids: br }] }; });
    if (deadW.length) kids.push({ tone: 'bad', mark: '✕', title: `Finish ${recOf(i, deadW[0])} or worse`, pill: 'Eliminated', sub: `No ${D.exact ? 'combination' : 'simulation'} at ${deadW.map(w => recOf(i, w)).join(', ')} reaches the title game.` });
    const top = R[mx], must = live.length === 1 && L.length;
    const root = { tone: top && top.i === top.t ? 'ok' : 'warn', mark: '★', open: true, title: must ? `${nm} must finish ${recOf(i, mx)}` : `${nm} can get in at ${live.map(w => recOf(i, w)).join(', ')}`, pill: must ? 'Win Out Required' : '',
      sub: `Now ${t.w}-${t.l}. Left: ${L.map(x => x.g[1] === i ? 'vs ' + name(x.g[0]) : 'at ' + name(x.g[1])).join(', ') || 'nothing'}.`, meter: meter(d.c, D.total, 'model ' + pc(d.p)), kids };
    const el = $('tree'); el.innerHTML = ''; el.appendChild(renderNode(root));
  }
  function drawGuide(i) {
    const d = D.stats[i];
    const rows = D.rem.map((g, k) => { const a = d.lev[k][0], h = d.lev[k][1], hw = h >= a; return { lab: `${name(hw ? g[1] : g[0])} over ${name(hw ? g[0] : g[1])}`, date: g[2], hi: Math.max(a, h), lo: Math.min(a, h) }; }).sort((x, y) => (y.hi - y.lo) - (x.hi - x.lo)).slice(0, 10), mx = Math.max.apply(null, rows.map(r => r.hi).concat([1e-9]));
    $('guide-sub').textContent = `${name(i)}'s model chance by result, biggest swings first`;
    $('guide').innerHTML = rows.map(r => `<div><span>${r.lab} <span style="color:var(--muted);font-size:12.5px">· ${r.date}</span></span><span class="bar" title="${pc(r.hi)} if it happens, ${pc(r.lo)} if not"><b style="width:${r.hi / mx * 100}%"></b><i style="left:${r.lo / mx * 100}%"></i><span class="num">${pc(r.hi)} / ${pc(r.lo)}</span></span></div>`).join('');
  }

  /* builder */
  let picks = [], job = 0;
  function winOut() { picks.fill(null); left(cur).forEach(x => { picks[x.k] = x.g[1] === cur ? 1 : 0; }); }
  function drawGames() {
    const mine = left(cur).map(x => x.k), order = mine.concat(D.rem.map((g, k) => k).filter(k => !mine.includes(k)));
    $('games').innerHTML = order.length ? order.map((k, n) => { const g = D.rem[k], h = g[3];
      return (n === 0 && mine.length ? `<div class="grp">${name(cur)}</div>` : '') + (n === mine.length ? `<div class="grp">Rest of the ${D.name}</div>` : '') +
        `<div class="game"><button type="button" data-g="${k}" data-s="0" aria-pressed="${picks[k] === 0}">${name(g[0])}<small class="num">${pc(1 - h)}</small></button><span class="at">at</span><button type="button" data-g="${k}" data-s="1" aria-pressed="${picks[k] === 1}">${name(g[1])}<small class="num">${pc(h)}</small></button><span class="dt">${g[2]}</span></div>`; }).join('') : '<div class="empty">The conference regular season is complete.</div>';
  }
  function evaluate() {
    const my = ++job, t = cur, nm = name(t), V = $('verdict'), R = D.rem.length, und = []; picks.forEach((p, k) => { if (p === null) und.push(k); });
    const stat = r => r.sel.includes(t) ? 1 : (r.und.some(u => u.group.includes(t)) ? 2 : 0), tone = c => V.style.setProperty('--tone', `var(--${c})`);
    const p = new Uint8Array(R); picks.forEach((v, k) => { p[k] = v || 0; });
    if (!und.length) {
      const log = []; E.apply(p); const r = E.title(log), st = stat(r), order = D.teams.map((_, k) => k).sort((a, b) => E.pct[b] - E.pct[a]).slice(0, 8); if (!order.includes(t)) order.push(t);
      tone(['bad', 'ok', 'warn'][st]);
      V.innerHTML = `<h3>${[nm + ' is out', nm + ' is in', 'Down to later tiebreakers'][st]}</h3><p>${r.und.length ? 'A spot is still undecided after four steps.' : 'Title game: ' + r.sel.map(name).join(' vs ')}</p>
        ${log.length ? '<ol>' + log.map(l => '<li>' + l + '</li>').join('') + '</ol>' : '<p style="color:var(--muted)">No tiebreaker needed.</p>'}
        <div class="stand">${order.map(x => `<div class="${r.sel.includes(x) ? 'in' : ''} ${x === t ? 'me' : ''}"><span>${name(x)}</span><span class="num">${E.W[x]}-${E.G[x] - E.W[x]}</span></div>`).join('')}</div>`;
      return;
    }
    const show = (inn, mar, tot, pw, sampled) => { tone(pw > 0 ? (inn === tot ? 'ok' : 'warn') : (mar ? 'warn' : 'bad'));
      V.innerHTML = `<h3>${pw > 0 ? pc(pw) + ' model chance' : (mar ? 'Later tiebreakers only' : nm + ' is out')}</h3>
        <p class="num">${sampled ? `Estimated from ${fmt(tot)} simulations of the ${und.length} open games.` : `${nm} reaches the title game in <b>${fmt(inn)}</b> of ${fmt(tot)} combinations of the ${und.length} open games${mar ? `, with ${fmt(mar)} more decided by later tiebreakers` : ''}.`}</p>
        <p style="color:var(--muted)">Percentages under each team are FPI win chances. Tap a selected team again to reopen that game.</p>`; };
    if (und.length === R) { const d = D.stats[t]; return show(d.c, d.mc, D.total, d.p, !D.exact); }
    const exact = und.length <= 16, tot = exact ? Math.pow(2, und.length) : 40000; let m = 0, inn = 0, mar = 0, pw = 0;
    tone('accent');
    (function step() {
      if (my !== job) return; const end = Math.min(tot, m + 4000);
      for (; m < end; m++) { let w = 1; for (let k = 0; k < und.length; k++) { const g = und[k], h = D.rem[g][3], b = exact ? (m >> k) & 1 : (Math.random() < h ? 1 : 0); p[g] = b; if (exact) w *= b ? h : 1 - h; }
        E.apply(p); const s = stat(E.title()); if (s === 1) { inn++; pw += exact ? w : 1 / tot; } else if (s === 2) mar++; }
      if (m < tot) { V.innerHTML = `<h3>Calculating ${Math.round(100 * m / tot)}%</h3><p>${und.length} games open.</p>`; setTimeout(step, 0); return; }
      show(inn, mar, tot, pw, !exact);
    })();
  }

  /* select + animation */
  function select(i, animate) {
    if (flying) flying();
    cur = i; const t = D.teams[i], gone = dead(i); theme(palette(t)); setHash(D.slug + '-' + t.id); document.title = t.loc + ' · ' + D.name + ' paths · ChampCalc';
    drawPicker(); drawTop(i);
    ['s-paths', 's-tree', 's-guide'].forEach(id => { $(id).hidden = gone; });
    if (!gone) { drawPaths(i); drawTree(i); drawGuide(i); }
    winOut(); drawGames(); evaluate();
    if (!animate || matchMedia('(prefers-reduced-motion:reduce)').matches || !document.body.animate) return;
    window.scrollTo(0, 0);
    const target = $('herologo'); target.style.visibility = 'hidden';
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="ov-bg"></div><div class="ov-logo">${logo(t)}${gone ? '<div class="stamp">Eliminated</div>' : ''}</div>${gone ? `<p class="ov-q">${quote(i)}</p>` : ''}`;
    document.body.appendChild(ov);
    const L = ov.querySelector('.ov-logo'), bg = ov.querySelector('.ov-bg'), q = ov.querySelector('.ov-q'), st = ov.querySelector('.stamp');
    bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, fill: 'both' });
    L.animate([{ transform: 'scale(.12)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: .7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    if (gone) {
      st.animate([{ transform: 'rotate(-34deg) scale(3.6)', opacity: 0 }, { transform: 'rotate(-14deg) scale(.94)', opacity: 1, offset: .85 }, { transform: 'rotate(-14deg) scale(1)', opacity: 1 }], { duration: 300, delay: 420, easing: 'cubic-bezier(.7,0,.9,.5)', fill: 'both' });
      setTimeout(() => { if (ov.isConnected) ov.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-7px,5px)' }, { transform: 'translate(6px,-4px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }], { duration: 240 }); }, 700);
      q.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 900, fill: 'both' });
    }
    let done = false;
    const end = () => { target.style.visibility = ''; ov.remove(); flying = null; };
    const fly = () => {
      if (done) return; done = true; clearTimeout(timer);
      const a = L.getBoundingClientRect(), b = target.getBoundingClientRect(), s = b.width / a.width, dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, fill: 'forwards' }); if (q) q.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
      const an = L.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx}px,${dy}px) scale(${s})` }], { duration: 620, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
      an.onfinish = end; flying = () => { an.cancel(); end(); };
    };
    const timer = setTimeout(fly, gone ? 3600 : 950);
    ov.addEventListener('click', fly);
    flying = () => { done = true; clearTimeout(timer); end(); };
  }

  /* CFP */
  let openId = null;
  function drawCFP() {
    theme({ brand: '#7a5c14', hi: '#d9b25c', accent: '#ead9a4', on: '#ffffff' }); document.title = 'College Football Playoff odds · ChampCalc';
    const T = CFP.teams, by = {}; T.forEach(t => { by[t.id] = t; });
    const row = c => `<div class="seedrow"><i class="num">${c.seed}</i>${logo(c)}<span>${c.loc}<small>${c.tag}${by[c.id] ? ' · in the field ' + pc(by[c.id].make) : ''}</small></span></div>`;
    const S = CFP.chalk, pair = (bye, hi, lo) => `<div class="slot"><h4>Seed ${bye} awaits</h4>${row(S[bye - 1])}<div class="vs">Quarterfinal vs winner of</div>${row(S[hi - 1])}${row(S[lo - 1])}</div>`;
    const shown = T.filter(t => t.make >= 0.0005 || t.rk);
    view.innerHTML = `<header class="top"><div class="eyebrow">${INDEX.season} season · results through ${INDEX.through || 'this week'} · ${fmt(CFP.n)} simulated seasons</div>
      <h1>College Football Playoff <span>Mathematical Odds</span></h1>
      <p class="lede">Every remaining FBS game and all ten conference title games are simulated, then a model of the selection committee ranks the teams and fills the 12-team bracket. Conference races decide the automatic bids, so each team links back to its conference paths.</p>
      <div class="wins"><div><small>Automatic</small>SEC, Big Ten, Big 12 and ACC champions</div><div><small>Automatic</small>Highest-ranked champion from the other six leagues</div><div><small>Automatic</small>Notre Dame, if ranked in the top 12</div><div><small>At-large</small>Best remaining teams until the field has 12</div></div>
      <div class="yard" aria-hidden="true"></div></header>
      <section><h2>If every favorite wins <small>The bracket the model projects from here</small></h2><div class="bracket">${pair(1, 8, 9)}${pair(4, 5, 12)}${pair(3, 6, 11)}${pair(2, 7, 10)}</div></section>
      <section><h2>Playoff odds <small>Tap a team for its breakdown</small></h2>
      <div id="cdet"></div><div class="tbl"><table id="ctable"><thead><tr><th>Team</th><th>Rec</th><th class="r">Make field</th><th class="r">Bye</th><th class="r">Win conf</th><th class="r">Win title</th></tr></thead><tbody></tbody></table></div></section>
      <section><div class="note"><h3>How to read this</h3><p>Conference title games are real paths, and the conference tabs map every one of them. Everything after that is a judgment call by 13 people, so these are modeled odds, not paths. The committee model scores each team by wins above what a bubble-level team would expect against the same schedule, plus FPI and a penalty per loss${CFP.fit !== null ? `. Its weights are refit each build to the committee's latest ranking (${CFP.rankName || 'CFP'}), and it currently lands within ${CFP.fit} spots per ranked team on average` : ''}.</p></div></section>`;
    const cell = v => `<td class="r num pctcell">${pc(v)}<em><b style="width:${100 * v}%"></b></em></td>`;
    function rows() {
      $('ctable').tBodies[0].innerHTML = shown.map(t => `<tr class="row${t.id === openId ? ' open' : ''}" data-id="${t.id}" tabindex="0"><td class="tm">${logo(t)}${t.loc}${t.rk ? ' <span style="color:var(--muted);font-weight:400">#' + t.rk + '</span>' : ''}</td><td class="num">${t.w}-${t.l}</td>${cell(t.make)}${cell(t.bye)}${cell(t.champ)}${cell(t.title)}</tr>` ).join('');
      const o = shown.find(t => t.id === openId); $('cdet').innerHTML = o ? `<div class="path" style="display:block;margin-bottom:10px"><h3 style="display:flex;gap:10px;align-items:center;margin-bottom:10px">${logo(o)}${o.loc} · ${pc(o.make)} to make the field</h3>${detail(o)}</div>` : '';
    }
    function detail(t) {
      const mx = Math.max.apply(null, t.seed.concat([1e-9])), Ls = Object.keys(t.byL).map(Number).sort((a, b) => a - b).filter(l => t.byL[l][0] / CFP.n >= 0.002);
      return `<div class="cdetail"><div><h4>Seed distribution</h4><div class="hist">${t.seed.map(v => `<div style="height:${100 * v / mx}%" title="${pc(v)}"></div>`).join('')}</div><div class="histx">${t.seed.map((_, i) => `<span>${i + 1}</span>`).join('')}</div>
        <p style="margin:10px 0 0;font-size:14px;color:var(--muted)">Seeds 1 to 4 get a bye. Seeds 5 to 8 host a first-round game.</p></div>
        <div><h4>How ${t.loc} gets in</h4><div class="kv">
        <span>As an automatic qualifier</span><span class="num">${pc(t.auto)}</span><span>As an at-large</span><span class="num">${pc(t.atl)}</span>
        <span>Reach conference title game</span><span class="num">${t.conf === 'ind' ? 'n/a' : pc(t.ccg)}</span>
        <span>If it wins every remaining regular-season game</span><span class="num">${t.wo[0] ? pc(t.wo[1] / t.wo[0]) : 'n/a'}</span>
        ${Ls.map(l => `<span>Finishing with ${l} loss${l === 1 ? '' : 'es'} <i style="font-style:normal;opacity:.7">(${pc(t.byL[l][0] / CFP.n)} of seasons)</i></span><span class="num">${pc(t.byL[l][1] / t.byL[l][0])}</span>`).join('')}
        <span>Reach the final</span><span class="num">${pc(t.fin)}</span></div>
        ${t.conf !== 'ind' ? `<p style="margin:12px 0 0"><button class="btn" data-go="${t.conf}" data-team="${t.id}">Open ${t.loc}'s ${t.confName} paths</button></p>` : ''}</div></div>`;
    }
    rows();
    const tb = $('ctable');
    const act = e => { const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go, g.dataset.team, true); const r = e.target.closest('tr.row'); if (r) { openId = openId === r.dataset.id ? null : r.dataset.id; rows(); if (openId) $('cdet').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
    tb.addEventListener('click', act); $('cdet').addEventListener('click', act); tb.addEventListener('keydown', e => { if (e.key === 'Enter') act(e); });
  }

  function foot() {
    const m = INDEX.model, b = new Date(INDEX.built);
    $('foot').innerHTML = `<p>Data: results, schedules, FPI ratings, CFP rankings, colors and logos come from ESPN's public API, pulled at build time. Last built ${b.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. The site rebuilds itself on a schedule during the season.</p>
      <p>Model: each game's win probability is the FPI rating gap plus ${m.hfa} points of home field, with a ${m.sd}-point standard deviation. That conversion is ChampCalc's assumption, not ESPN's. Conferences with ${m.exactMax} or fewer games left are enumerated exactly; larger ones use ${fmt(m.mcN)} simulations until the field narrows.</p>
      <p>ChampCalc is an independent fan project, not affiliated with ESPN, the CFP or any conference or school.</p>`;
  }
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== (slug === 'cfp' ? 'cfp' : (D ? D.slug + '-' + D.teams[cur].id : ''))) route(h); });
  function route(h) { const m = /^([a-z0-9]+)(?:-(\d+))?$/.exec(h || ''); if (!m) return go('sec', '201'); return go(m[1], m[2]); }
  load('index').then(j => { INDEX = j; foot(); let h = location.hash.slice(1); if (!h) { try { h = localStorage.getItem('champcalc') || ''; } catch (e) { } } route(h || 'sec-201'); }).catch(fail);
})();
