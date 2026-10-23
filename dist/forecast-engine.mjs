import {DEFAULTS,nationalInputs,forecastRace,simulate} from './model.mjs';
export function createForecastEngine(){
  let source,polls,baselines={};
  return (data,scenario,office)=>{
    if(source!==data||polls!==data.polls){source=data;polls=data.polls;baselines={};}
    const holdovers={senate:{D:34,R:31},house:{D:0,R:0},governor:{D:5,R:9}}[office];
    const races=data.races.filter(r=>r.office===office),national=nationalInputs(data,scenario);
    const results=simulate(races.map(r=>forecastRace(r,data,scenario,national)),scenario,{office,holdovers});
    if(!baselines[office]){
      const baselineNational=nationalInputs(data,DEFAULTS);
      baselines[office]=simulate(races.map(r=>forecastRace(r,data,DEFAULTS,baselineNational)),DEFAULTS,{office,holdovers});
    }
    return {results,baseline:baselines[office]};
  };
}
