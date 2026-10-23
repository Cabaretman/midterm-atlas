import {createForecastEngine} from './forecast-engine.mjs';
const forecast=createForecastEngine();
let data;
self.onmessage=({data:message})=>{
  if(message.type==='data'){data=message.data;return;}
  try{const start=performance.now();const result=forecast(data,message.scenario,message.office);self.postMessage({id:message.id,...result,computeMs:performance.now()-start});}
  catch(error){self.postMessage({id:message.id,error:error.message});}
};
