import {createForecastEngine} from './forecast-engine.mjs';
// At most one running request and one latest request: dragging never builds
// an unbounded worker queue. Superseded requests resolve without painting.
export class ForecastClient{
  constructor(){
    this.sequence=0;this.fallback=createForecastEngine();
    try{
      this.worker=new Worker(new URL('./forecast-worker.mjs',import.meta.url),{type:'module'});
      this.worker.onmessage=({data:result})=>{
        const current=this.active;if(!current||result.id!==current.id)return;
        this.active=null;result.error?current.reject(Error(result.error)):current.resolve(result);
        if(this.pending){const next=this.pending;this.pending=null;this.dispatch(next);}
      };
      this.worker.onerror=()=>{
        this.worker.terminate();this.worker=null;
        const requests=[this.active,this.pending].filter(Boolean);this.active=this.pending=null;
        for(const request of requests)try{request.resolve(this.fallback(request.data,request.scenario,request.office));}catch(error){request.reject(error);}
      };
    }catch{this.worker=null;}
  }
  dispatch(request){
    this.active=request;
    if(this.source!==request.data||this.polls!==request.data.polls){this.worker.postMessage({type:'data',data:request.data});this.source=request.data;this.polls=request.data.polls;}
    this.worker.postMessage({id:request.id,scenario:request.scenario,office:request.office});
  }
  run(data,scenario,office){
    if(!this.worker)return Promise.resolve(this.fallback(data,scenario,office));
    return new Promise((resolve,reject)=>{
      const request={id:++this.sequence,data,scenario:structuredClone(scenario),office,resolve,reject};
      if(this.active){this.pending?.resolve(null);this.pending=request;}else this.dispatch(request);
    });
  }
}
