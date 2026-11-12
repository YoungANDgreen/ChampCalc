const TEAMS={UGA:'Georgia',ALA:'Alabama',UK:'Kentucky',TEX:'Texas',TENN:'Tennessee',MISS:'Ole Miss',SC:'South Carolina',LSU:'LSU',MIZ:'Missouri',OU:'Oklahoma',FLA:'Florida',AUB:'Auburn',MSST:'Mississippi State',ARK:'Arkansas',TAMU:'Texas A&M',VAN:'Vanderbilt'};
const IDS=Object.keys(TEAMS);
// winner>loser, conference games through Nov 7
const PLAYED='ALA>UK ALA>SC ALA>MSST UGA>ALA TENN>ALA ALA>TAMU ALA>LSU UGA>ARK TAMU>ARK TENN>ARK ARK>VAN MIZ>ARK AUB>ARK FLA>AUB AUB>VAN TENN>AUB AUB>UGA LSU>AUB MISS>AUB FLA>MISS MIZ>FLA SC>FLA FLA>TEX UGA>FLA OU>FLA UGA>OU UGA>VAN UGA>MISS UK>TAMU UK>SC UK>LSU UK>OU UK>VAN TENN>UK MISS>LSU LSU>TAMU LSU>MSST MSST>SC MSST>MIZ OU>MSST TEX>MSST VAN>MSST MIZ>TAMU MISS>MIZ TEX>MIZ MISS>VAN TEX>MISS OU>TEX SC>OU SC>TENN SC>TAMU TEX>TENN'.split(' ').map(s=>s.split('>'));
// [away, home, date]
const REM=[['MISS','OU','Nov 14'],['TAMU','OU','Nov 21'],['OU','MIZ','Nov 28'],
['MIZ','UGA','Nov 14'],['UGA','SC','Nov 21'],
['ALA','VAN','Nov 14'],['AUB','ALA','Nov 28'],
['FLA','UK','Nov 14'],['UK','MIZ','Nov 21'],
['TEX','LSU','Nov 14'],['ARK','TEX','Nov 21'],['TEX','TAMU','Nov 27'],
['TENN','TAMU','Nov 14'],['LSU','TENN','Nov 21'],['TENN','VAN','Nov 28'],
['SC','ARK','Nov 14'],['LSU','ARK','Nov 28'],
['AUB','MSST','Nov 14'],['VAN','FLA','Nov 21'],['MSST','MISS','Nov 27']];
// picks[i]: 0 = away wins, 1 = home wins
function build(picks){
  const w={},l={},res={};IDS.forEach(t=>{w[t]=0;l[t]=0;res[t]={}});
  const add=(a,b)=>{w[a]++;l[b]++;res[a][b]=1;res[b][a]=0};
  PLAYED.forEach(g=>add(g[0],g[1]));
  REM.forEach((g,i)=>picks[i]?add(g[1],g[0]):add(g[0],g[1]));
  return {w,l,res};
}
function steps(group,S){
  const {w,res}=S,n=group.length,out=[];
  // A head-to-head
  let rr=true;for(const a of group)for(const b of group)if(a!==b&&res[a][b]===undefined)rr=false;
  if(n===2){out.push(['Head-to-head',res[group[0]][group[1]]===undefined?null:group.map((t,i)=>res[t][group[1-i]])])}
  else if(rr){out.push(['Head-to-head',group.map(t=>group.reduce((s,o)=>s+(o!==t?res[t][o]:0),0))])}
  else{out.push(['Head-to-head',group.map(t=>{const o=group.filter(x=>x!==t);
    if(o.every(x=>res[t][x]===1))return 2;if(o.every(x=>res[t][x]===0))return 0;return 1})])}
  // B common opponents
  const common=IDS.filter(o=>!group.includes(o)&&group.every(t=>res[t][o]!==undefined));
  if(common.length){out.push(['Record vs common opponents',group.map(t=>common.reduce((s,o)=>s+res[t][o],0))]);
    // C highest-placed common opponent, tier by tier
    const tiers=[...new Set(common.map(o=>w[o]))].sort((a,b)=>b-a);
    tiers.forEach(tw=>{const tier=common.filter(o=>w[o]===tw);
      out.push(['Record vs highest-placed common opponent',group.map(t=>tier.reduce((s,o)=>s+res[t][o],0))])});
  }
  // D opponents' combined conference win pct (everyone plays 9)
  out.push(["Opponents' combined SEC win %",group.map(t=>IDS.reduce((s,o)=>s+(res[t][o]!==undefined?w[o]:0),0))]);
  return out;
}
function breakTie(group,spots,S,log){
  if(spots<=0)return{sel:[],und:null};
  if(group.length<=spots)return{sel:group.slice(),und:null};
  for(const [name,m] of steps(group,S)){
    if(!m)continue;const mx=Math.max(...m);if(m.every(v=>v===mx))continue;
    const top=group.filter((t,i)=>m[i]===mx),rest=group.filter((t,i)=>m[i]!==mx);
    if(top.length<=spots){log&&log.push(name+': '+top.join(', ')+' advance'+(top.length>1?'':'s'));
      const r=breakTie(rest,spots-top.length,S,log);return{sel:top.concat(r.sel),und:r.und}}
    log&&log.push(name+': '+rest.join(', ')+' eliminated');
    return breakTie(top,spots,S,log);
  }
  log&&log.push('Still tied after steps A–D: '+group.join(', ')+' go to capped scoring margin');
  return{sel:[],und:{group:group.slice(),spots}};
}
function titleGame(picks,log){
  const S=build(picks);let spots=2,sel=[],und=null;
  const wins=[...new Set(IDS.map(t=>S.w[t]))].sort((a,b)=>b-a);
  for(const x of wins){const g=IDS.filter(t=>S.w[t]===x);
    if(g.length>spots&&log)log.push(g.length+' teams tied at '+x+'-'+(9-x)+' for '+spots+' spot'+(spots>1?'s':'')+': '+g.join(', '));
    const r=breakTie(g,spots,S,log);sel=sel.concat(r.sel);und=r.und;spots-=r.sel.length;if(und||spots<=0)break}
  return{S,sel,und};
}
function ouStatus(picks,log){const r=titleGame(picks,log);
  if(r.sel.includes('OU'))return'in';if(r.und&&r.und.group.includes('OU'))return'margin';return'out'}
if(typeof module!=='undefined')module.exports={TEAMS,IDS,PLAYED,REM,build,titleGame,ouStatus};
