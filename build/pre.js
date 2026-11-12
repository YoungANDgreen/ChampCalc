const E=require('./engine.js');const N=20,IDS=E.IDS;
const SP={UGA:31.3,ALA:22.7,UK:8.3,TEX:23.5,TENN:20.5,MISS:13.5,SC:13.7,LSU:22.9,MIZ:13.7,OU:7.8,FLA:5.9,AUB:2.8,MSST:3.8,ARK:-3.6,TAMU:8.3,VAN:-1.5};
const HFA=2.5,SD=16.5;
function Phi(x){const t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2);let p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p}
const ph=E.REM.map(g=>Phi((SP[g[1]]-SP[g[0]]+HFA)/SD));
const D={},sig={};IDS.forEach(t=>{D[t]={p:0,c:0,mp:0,mc:0,rec:{},lev:E.REM.map(()=>[0,0])};sig[t]=new Map()});
function pass(fn){const p=new Array(N);for(let m=0;m<(1<<N);m++){let wt=1;for(let i=0;i<N;i++){const b=m>>i&1;p[i]=b;wt*=b?ph[i]:1-ph[i]}fn(p,wt)}}
const keyOf=(S,t)=>{const W=S.w[t];return W+'|'+IDS.filter(x=>S.w[x]>W).join(',')+'|'+IDS.filter(x=>x!==t&&S.w[x]===W).join(',')};
pass((p,wt)=>{const r=E.titleGame(p),S=r.S,cnt=new Array(10).fill(0);IDS.forEach(t=>cnt[S.w[t]]++);
  for(const t of IDS){const W=S.w[t];let better=0;for(let w=W+1;w<10;w++)better+=cnt[w];
    const st=r.sel.includes(t)?'in':(r.und&&r.und.group.includes(t)?'margin':'out');
    const d=D[t],R=d.rec[W]||(d.rec[W]={t:0,tp:0,i:0,ip:0,m:0,b:{}});const k=Math.min(better,2);
    const B=R.b[k]||(R.b[k]={t:0,i:0,ip:0,m:0,s:{}});const s=B.s[cnt[W]]||(B.s[cnt[W]]=[0,0]);
    R.t++;R.tp+=wt;B.t++;s[1]++;
    if(st==='in'){d.p+=wt;d.c++;R.i++;R.ip+=wt;B.i++;B.ip+=wt;s[0]++;for(let g=0;g<N;g++)d.lev[g][p[g]]+=wt;
      const key=keyOf(S,t);sig[t].set(key,(sig[t].get(key)||0)+wt)}
    else if(st==='margin'){d.mp+=wt;d.mc++;R.m++;B.m++}
  }});
const top={};IDS.forEach(t=>{top[t]=new Map([...sig[t].entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>[e[0],{prob:e[1],hw:new Array(N).fill(0),best:0,bp:null}]))});
pass((p,wt)=>{const r=E.titleGame(p);for(const t of r.sel){const o=top[t].get(keyOf(r.S,t));if(!o)continue;for(let g=0;g<N;g++)if(p[g])o.hw[g]+=wt;if(wt>o.best){o.best=wt;o.bp=p.slice()}}});
const r4=x=>+x.toPrecision(4);
const out={ph:ph.map(r4),sp:SP,teams:{}};
IDS.forEach(t=>{const d=D[t];const rec={};for(const W in d.rec){const R=d.rec[W];rec[W]={t:R.t,tp:r4(R.tp),i:R.i,ip:r4(R.ip),m:R.m,b:{}};for(const k in R.b){const B=R.b[k];rec[W].b[k]={t:B.t,i:B.i,ip:r4(B.ip),m:B.m,s:B.s}}}
  out.teams[t]={p:r4(d.p),c:d.c,mp:r4(d.mp),mc:d.mc,rec,
   lev:d.lev.map((l,g)=>[r4(l[0]/(1-ph[g])),r4(l[1]/ph[g])]),
   paths:[...top[t].entries()].map(([k,o])=>{const [W,a,ti]=k.split('|');return{w:+W,above:a?a.split(','):[],tied:ti?ti.split(','):[],prob:r4(o.prob),
     g:o.hw.map((h,g)=>{const s=h/o.prob;return s>0.9999?[g,1,1]:s<0.0001?[g,0,1]:s>=.8?[g,1,r4(s)]:s<=.2?[g,0,r4(1-s)]:null}).filter(Boolean)}})}});
require('fs').writeFileSync('data.json',JSON.stringify(out));
IDS.forEach(t=>console.log(t,(100*out.teams[t].p).toFixed(2)+'%',out.teams[t].c,'margin',out.teams[t].mc));
console.log(JSON.stringify(out.teams.OU.paths.slice(0,2)));console.log(require('fs').statSync('data.json').size);
