import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULTS,aggregate,forecastRace,nationalInputs,simulate,validatePoll,validateScenario} from '../dist/model.mjs';
const data=JSON.parse(readFileSync(new URL('../dist/data.json',import.meta.url))),config=()=>structuredClone(DEFAULTS);
test('cached simulation preserves every published-model trial outcome for all offices',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/model-v1.json',import.meta.url)));
 for(const c of fixture.cases){const {races,...actual}=simulate(c.races,c.scenario,c.options);assert.deepEqual({...actual,probabilities:races.map(r=>[r.probability,r.thirdProbability])},c.expected,c.office);}
});
test('input universe has 506 unique contests and valid sourced polls',()=>{
 assert.equal(data.races.length,506);assert.equal(new Set(data.races.map(r=>r.id)).size,506);
 for(const [office,n] of [['senate',35],['house',435],['governor',36]])assert.equal(data.races.filter(r=>r.office===office).length,n);
 const ids=new Set(data.races.map(r=>r.id));for(const p of data.polls){assert.deepEqual(validatePoll(p,ids),[],p.id);assert.ok(p.end<=data.asOf);}
 const pollKeys=data.polls.map(p=>`${p.raceId}|${p.pollster}|${p.end}`);assert.equal(new Set(pollKeys).size,pollKeys.length);
 assert.equal(data.races.filter(r=>r.office==='house').reduce((n,r)=>n+(r.incumbentRunning!==false),0),0);
});
test('state and race errors add after blending and do not leak across states',()=>{
 const mi=data.races.find(r=>r.id==='senate-MI'),oh=data.races.find(r=>r.id==='senate-OH'),s=config();s.states.MI=3;s.races['senate-MI']=-1;s.nationalError=2;
 assert.ok(Math.abs(forecastRace(mi,data,s).margin-forecastRace(mi,data,DEFAULTS).margin-4)<1e-10);
 assert.ok(Math.abs(forecastRace(oh,data,s).margin-forecastRace(oh,data,DEFAULTS).margin-2)<1e-10);
});
test('no-poll estimate uses fundamentals and disabling polls removes polling influence',()=>{
 const race=data.races.find(r=>r.id==='senate-MI'),s=config();s.pollWeight=0;const result=forecastRace(race,data,s);assert.equal(result.pollWeight,0);assert.equal(result.margin,result.prior);
 const noPoll=data.races.find(r=>r.office==='house'&&!data.polls.some(p=>p.raceId===r.id));const f=forecastRace(noPoll,data,DEFAULTS);assert.equal(f.pollCount,0);assert.equal(f.margin,f.prior);
});
test('national signal moves in correct direction without a redundant full approval effect',()=>{
 const s=config(),b=nationalInputs(data,s);s.generic=b.generic+1;assert.ok(Math.abs(nationalInputs(data,s).environment-b.environment-.8)<1e-10);s.generic=null;s.approval=b.approval+1;assert.ok(Math.abs(nationalInputs(data,s).environment-b.environment+.06)<1e-10);
});
test('poll recency exclusion and frequency cap prevent one pollster dominating',()=>{
 const p={id:'a',raceId:'senate-MI',pollster:'A',end:'2026-10-22',n:800,population:'LV',dem:50,rep:40};const q={...p,pollster:'B',dem:40,rep:50};const a=aggregate([p,q],data.asOf),b=aggregate([...Array(100).fill(p),q],data.asOf);assert.ok(Math.abs(a.margin)<1e-10);assert.ok(Math.abs(b.margin)<.3);assert.equal(aggregate([{...p,end:'2025-01-01'}],data.asOf),null);
});
test('Senate tie goes R, independent seats stay separate, deterministic trials',()=>{
 const s=config();s.nationalSigma=0;s.stateSigma=0;s.localSigma=.5;
 const r=[{id:'x',state:'MI',margin:-100,localSigma:0,independent:false}];const tie=simulate(r,s,{runs:10,office:'senate',holdovers:{D:50,R:49}});assert.equal(tie.control,0);assert.equal(tie.rcontrol,1);
 const ind=simulate([{...r[0],margin:100,independent:true}],s,{runs:10,office:'senate',holdovers:{D:50,R:49}});assert.equal(ind.mean,50);assert.equal(ind.otherMean,1);assert.equal(ind.unresolved,1);
 s.neCaucus='D';const caucus=simulate([{...r[0],margin:100,independent:true}],s,{runs:10,office:'senate',holdovers:{D:50,R:49}});assert.equal(caucus.control,1);assert.equal(caucus.otherMean,0);
 const races=data.races.filter(r=>r.office==='senate').map(r=>forecastRace(r,data,DEFAULTS));assert.deepEqual(simulate(races,DEFAULTS,{runs:300}),simulate(races,DEFAULTS,{runs:300}));
});
test('extreme shared-error scenarios move control monotonically',()=>{
 const races=data.races.filter(r=>r.office==='senate'),a=config(),b=config();a.nationalError=-10;b.nationalError=10;
 const fa=simulate(races.map(r=>forecastRace(r,data,a)),a,{runs:1000}),fb=simulate(races.map(r=>forecastRace(r,data,b)),b,{runs:1000});assert.ok(fb.mean>fa.mean);assert.ok(fb.control>fa.control);
});
test('three-way race can elect an independent and excludes that winner from D',()=>{
 const r={id:'governor-RI',state:'RI',margin:0,localSigma:0,thirdShare:60};const s=config();s.nationalSigma=0;s.stateSigma=0;const out=simulate([r],s,{office:'governor',holdovers:{D:0,R:0},runs:100});assert.equal(out.races[0].thirdProbability,1);assert.equal(out.mean,0);assert.equal(out.otherMean,1);
});
test('scenario and poll imports reject unsafe or impossible values',()=>{
 assert.throws(()=>validateScenario({nationalError:1000},data));assert.throws(()=>validateScenario({states:{XX:1}},data));assert.throws(()=>validateScenario({races:{'senate-MI':'bad'}},data));
 const p={...data.polls[0],url:'javascript:alert(1)'};assert.ok(validatePoll(p,new Set(data.races.map(r=>r.id))).length);
 assert.ok(validatePoll({...data.polls[0],dem:90,rep:60},new Set(data.races.map(r=>r.id))).length);
});
