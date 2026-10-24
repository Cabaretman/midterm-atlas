// Margins are Democratic minus Republican, in percentage points.
export const DEFAULTS = Object.freeze({nationalError:0,generic:null,approval:null,pollWeight:100,incumbency:2,candidateWeight:100,partisanWeight:50,includeInternals:false,adjustBias:true,nationalSigma:2.5,stateSigma:1.5,localSigma:3,states:{},races:{},neCaucus:'other'});
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function pollContribution(p,asOf,options=DEFAULTS){
  const age=(Date.parse(asOf)-Date.parse(p.end))/86400000,rating=p.rating;
  if(age<0||age>120)return {weight:0,reason:'Outside snapshot / 120-day window',bias:0};
  if(p.modelExcluded||rating?.banned||rating?.status==='banned'||rating?.status==='unrated-excluded-methodology')return {weight:0,reason:p.modelExclusionReason||rating?.notes||'Excluded by published survey standards',bias:0};
  if(p.internal&&!options.includeInternals)return {weight:0,reason:'Campaign/internal poll excluded by default',bias:0};
  const ppm=rating?.predictivePlusMinus;
  const quality=typeof ppm==='number'?clamp((4/Math.max(2,4+ppm))**2,.25,2):.65;
  const sample=p.n?Math.sqrt(Math.min(p.n,1500)/800):p.moe?Math.min(1.5,3/p.moe):.7;
  const base=2**(-age/14)*sample*(p.population==='A'?.6:p.population==='RV'?.85:1);
  const partisan=p.partisan?(options.partisanWeight??50)/100:1;
  const internal=p.internal ? 0.25 : 1;
  const bias=options.adjustBias&&p.raceId!=='approval'&&p.independent==null&&typeof rating?.meanRevertedBias==='number'?rating.meanRevertedBias:0;
  return {weight:base*quality*partisan*internal,base,quality,partisan,internal,bias,reason:null};
}
export function aggregate(polls,asOf,options=DEFAULTS) {
  if(!polls.length)return null;
  const groups=new Map(),seen=new Set();let excluded=0;
  for(const p of polls){
    if(seen.has(p.id))continue;seen.add(p.id);
    const contribution=pollContribution(p,asOf,options),weight=contribution.weight;
    if(!weight){excluded++;continue;}
    const raw=p.raceId==='approval'?p.approve:(p.independent??p.dem)-p.rep,margin=raw-contribution.bias;
    const key=p.pollsterFamily||p.pollster;
    const g=groups.get(key)||{sum:0,raw:0,w:0,base:0,count:0};g.sum+=margin*weight;g.raw+=raw*weight;g.w+=weight;g.base+=contribution.base;g.count++;groups.set(key,g);
  }
  let sum=0,raw=0,w=0,count=0;
  // Cap a pollster at one full sample-equivalent, to reduce frequency advantage.
  // Quality and partisan discounts survive that cap instead of disappearing.
  for(const g of groups.values()){const capped=Math.min(1,g.base)*(g.w/g.base);sum+=(g.sum/g.w)*capped;raw+=(g.raw/g.w)*capped;w+=capped;count+=g.count;}
  return w?{margin:sum/w,rawMargin:raw/w,effective:w,count,pollsters:groups.size,excluded}:null;
}
export function nationalInputs(data,scenario){
  const generic=aggregate(data.polls.filter(p=>p.raceId==='generic'),data.asOf,scenario);
  const approval=aggregate(data.polls.filter(p=>p.raceId==='approval'),data.asOf,scenario);
  const g=scenario.generic??generic?.margin??0,a=scenario.approval??approval?.margin??50;
  // Baseline generic-ballot polling already reflects approval; do not add it twice.
  // Approval is context at baseline, with an explicit scenario-only sensitivity.
  const environment=g-.3*(a-(approval?.margin??50));
  return {generic:g,approval:a,environment,genericAggregate:generic,approvalAggregate:approval};
}
export function forecastRace(race,data,scenario,national=nationalInputs(data,scenario)){
  const polls=data.polls.filter(p=>p.raceId===race.id);
  const avg=aggregate(polls,data.asOf,scenario);
  const fitted=data.fundamentals?.models?.[race.office],profile=race.candidateHistory;
  const incSign=race.incumbentRunning===false?0:race.incumbentParty==='D'?1:race.incumbentParty==='R'?-1:0;
  const c=fitted?.coefficients;
  const inc=incSign*(c?c.incumbency*scenario.incumbency/2:scenario.incumbency);
  const candidateEffect=((profile?.dem?.effect??0)-(profile?.rep?.effect??0)+(c?.experience??0)*((profile?.dem?.pastWinner?(profile.dem.transferFactor??1):0)-(profile?.rep?.pastWinner?(profile.rep.transferFactor??1):0)))*(scenario.candidateWeight??100)/100;
  const prior=(c?c.intercept+c.lean*race.lean+c.national*national.environment:race.lean+national.environment)+inc+candidateEffect;
  const strength=(avg?.effective??0)*scenario.pollWeight/100;
  const priorVariance=(fitted?.priorSigma??12)**2+(race.independent?36:0)+(profile?.transfer?16:0);
  // Shared polling error never vanishes when dozens of polls are added.
  const pollVariance=strength?9+25/strength:Infinity;
  const weight=strength?priorVariance/(priorVariance+pollVariance):0;
  const offset=(scenario.states[race.state]??0)+(scenario.races[race.id]??0);
  let margin=prior*(1-weight)+(avg?.margin??0)*weight+scenario.nationalError+offset;
  let thirdShare=0;
  if(polls.some(p=>(p.other??0)>0)){
    const rawOptions={...scenario,adjustBias:false};
    const third=aggregate(polls.map(p=>({...p,dem:p.other??0,rep:0,independent:undefined})),data.asOf,rawOptions)?.margin??0;
    const d=aggregate(polls.map(p=>({...p,rep:0})),data.asOf,rawOptions)?.margin??0;
    const r=aggregate(polls.map(p=>({...p,dem:p.rep,rep:0,independent:undefined})),data.asOf,rawOptions)?.margin??0;
    if(third>=10){thirdShare=100*third/(d+r+third);margin=prior*(1-weight)+100*(d-r)/(d+r+third)*weight+scenario.nationalError+offset;}
  }
  const localSigma=Math.sqrt(scenario.localSigma**2+(1-weight)**2*priorVariance+(strength?weight**2*25/strength:0));
  const thirdParty=polls.find(p=>p.thirdParty)?.thirdParty??'I';
  return {...race,margin,prior,candidateEffect,incumbencyEffect:inc,priorSigma:Math.sqrt(priorVariance),pollAverage:avg?.margin??null,rawPollAverage:avg?.rawMargin??null,pollCount:avg?.count??0,pollsters:avg?.pollsters??0,pollWeight:weight,localSigma,offset,thirdShare,thirdParty};
}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function normal(random){return Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());}
// Reuse the exact seeded draws across slider changes. Float64 preserves the
// original trial arithmetic; topology changes (including third candidates) rekey.
const drawCache=new Map();
function simulationDraws(races,runs,seed){
  const key=JSON.stringify([seed,runs,races.map(r=>[r.state,Boolean(r.thirdShare)])]);
  if(drawCache.has(key))return drawCache.get(key);
  const states=[...new Set(races.map(r=>r.state))],stateIndex=new Map(states.map((s,i)=>[s,i+1]));
  let stride=1+states.length;
  const localIndex=races.map(r=>{const index=stride++;if(r.thirdShare)stride++;return index;});
  const values=new Float64Array(runs*stride),random=rng(seed);
  for(let i=0;i<values.length;i++)values[i]=normal(random);
  const result={values,stride,localIndex,stateOffsets:races.map(r=>stateIndex.get(r.state))};
  if(drawCache.size>=4)drawCache.delete(drawCache.keys().next().value);
  drawCache.set(key,result);return result;
}
export function simulate(races,scenario,{runs=4000,seed=20261103,office='senate',holdovers={D:34,R:31}}={}){
  const {values,stride,localIndex,stateOffsets}=simulationDraws(races,runs,seed),wins=new Uint32Array(races.length),iWins=new Uint32Array(races.length),counts=[],otherCounts=[];
  const threshold=office==='senate'?51:office==='house'?218:null;
  let control=0,rcontrol=0,ties=0;
  for(let k=0;k<runs;k++){
    const offset=k*stride,common=values[offset]*scenario.nationalSigma;
    let d=holdovers.D,r=holdovers.R,other=0;
    for(let i=0;i<races.length;i++){
      const race=races[i],m=race.margin+common+values[offset+stateOffsets[i]]*scenario.stateSigma+values[offset+localIndex[i]]*race.localSigma;
      const third=race.thirdShare?clamp(race.thirdShare+values[offset+localIndex[i]+1]*3,0,100):0;
      if(third>Math.max((100-third+m)/2,(100-third-m)/2)){iWins[i]++;if(race.thirdParty==='D')d++;else if(race.thirdParty==='R')r++;else other++;}
      else if(m>0){wins[i]++;if(race.independent&&scenario.neCaucus!=='D')other++;else d++;}else r++;
    }
    counts.push(d);otherCounts.push(other);
    if(threshold){if(d>=threshold)control++;else if(r>=(office==='senate'?50:218))rcontrol++;else ties++;}
  }
  counts.sort((a,b)=>a-b);
  const histogram={};for(const n of counts)histogram[n]=(histogram[n]||0)+1;
  return {runs,races:races.map((r,i)=>({...r,probability:wins[i]/runs,thirdProbability:iWins[i]/runs})),mean:counts.reduce((a,b)=>a+b,0)/runs,low:counts[Math.floor(runs*.1)],high:counts[Math.floor(runs*.9)],median:counts[Math.floor(runs*.5)],control:threshold?control/runs:null,rcontrol:threshold?rcontrol/runs:null,unresolved:threshold?ties/runs:null,histogram,otherMean:otherCounts.reduce((a,b)=>a+b,0)/runs};
}
export function validatePoll(p,raceIds){
  const errors=[];
  if(!p||typeof p!=='object')return ['Poll must be an object'];
  if(!raceIds.has(p.raceId)&&!['generic','approval'].includes(p.raceId))errors.push('Unknown raceId');
  if(!p.id||typeof p.id!=='string')errors.push('Missing id');
  if(!p.pollster||typeof p.pollster!=='string')errors.push('Missing pollster');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.end)||!Number.isFinite(Date.parse(p.end)))errors.push('Invalid end date');
  if(p.start&&(!Number.isFinite(Date.parse(p.start))||Date.parse(p.start)>Date.parse(p.end)))errors.push('Invalid start date');
  try{if(!['https:','http:'].includes(new URL(p.url).protocol))errors.push('Source URL must use HTTP(S)');}catch{errors.push('Invalid source URL');}
  const fields=p.raceId==='approval'?['approve','disapprove']:p.independent!=null?['independent','rep']:['dem','rep'];
  for(const f of fields)if(typeof p[f]!=='number'||p[f]<0||p[f]>100||!Number.isFinite(p[f]))errors.push(`Invalid ${f}`);
  if(p[fields[0]]+p[fields[1]]>100.2)errors.push('Shares exceed 100%');
  if(p.other!=null&&(typeof p.other!=='number'||p.other<0||p.other>100||!Number.isFinite(p.other)||p[fields[0]]+p[fields[1]]+p.other>100.2))errors.push('Invalid third candidate share');
  if(p.n!=null&&(!Number.isInteger(p.n)||p.n<1))errors.push('Invalid n');
  if(p.moe!=null&&(typeof p.moe!=='number'||!Number.isFinite(p.moe)||p.moe<=0||p.moe>30))errors.push('Invalid margin of error');
  if(!['LV','RV','A'].includes(p.population))errors.push('Population must be LV, RV or A');
  return errors;
}
export function validateScenario(raw,data){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Scenario must be an object.');
  const out=structuredClone(DEFAULTS),ranges={nationalError:[-15,15],generic:[-20,20],approval:[10,90],pollWeight:[0,200],incumbency:[0,6],candidateWeight:[0,200],partisanWeight:[0,100],nationalSigma:[0,8],stateSigma:[0,8],localSigma:[0.5,10]};
  for(const [key,[lo,hi]]of Object.entries(ranges))if(raw[key]!=null){if(typeof raw[key]!=='number'||!Number.isFinite(raw[key])||raw[key]<lo||raw[key]>hi)throw Error(`Invalid ${key}`);out[key]=raw[key];}
  for(const key of ['states','races'])if(raw[key])for(const [id,v]of Object.entries(raw[key])){if((key==='states'?!data.states.some(s=>s.abbr===id):!data.races.some(r=>r.id===id))||typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>20)throw Error(`Invalid ${key} adjustment`);out[key][id]=v;}
  for(const key of ['includeInternals','adjustBias'])if(raw[key]!=null){if(typeof raw[key]!=='boolean')throw Error(`Invalid ${key}`);out[key]=raw[key];}
  if(raw.neCaucus)out.neCaucus=raw.neCaucus==='D'?'D':'other';return out;
}
