import {DEFAULTS,nationalInputs,validatePoll,validateScenario,pollContribution} from './model.mjs';
import {ForecastClient} from './forecast-client.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=x=>`${Math.round(x*100)}%`,signed=x=>`${x>0?'+':''}${x.toFixed(1)}`;
const margin=(m,ind=false)=>`${m>=0?(ind?'I':'D'):'R'}+${Math.abs(m).toFixed(1)}`;
const officeNames={senate:'Senate',house:'House',governor:'Governors'};
let data,map,office='senate',page='forecast',view='map',metric='probability',selected='senate-MI',filterState='',filter='all',query='',scenario=structuredClone(DEFAULTS),results,baseResults,lastDataSnapshot,importType='scenario',timer,toastTimer;
const forecastClient=new ForecastClient();
let calculationSequence=0,renderSequence=0,tableLimit=50;
const rowCaches=new WeakMap();
let pollListLimit=100,pollLedgerFilter='all',pollLedgerQuery='';
let saved=[];try{saved=JSON.parse(localStorage.getItem('atlas-scenarios-v1')||'[]');if(!Array.isArray(saved))saved=[];}catch{}
const oldDate=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
function notify(text){$('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4500);}
function raceColor(r){if(!r)return '#eeede9';if(r.thirdProbability>0.5)return '#81ab93';const p=r.probability;if(r.independent&&p>.5)return p>.8?'#81ab93':'#b9cfc0';if(metric==='margin'){const m=r.margin;return Math.abs(m)<2?'#e5ad55':m>0?m>15?'#7392b8':m>5?'#a0b5cf':'#cbd7e6':m<-15?'#ba817a':m<-5?'#d8a9a3':'#ead2cf';}return p>.95?'#7392b8':p>.8?'#a0b5cf':p>.6?'#cbd7e6':p>=.4?'#e5ad55':p>.2?'#ead2cf':p>.05?'#d8a9a3':'#ba817a';}
const rating=r=>r.thirdProbability>.25?'Multi-candidate':r.probability>.95?'Safe '+(r.independent?'I':'D'):r.probability>.8?'Likely '+(r.independent?'I':'D'):r.probability>.6?'Lean '+(r.independent?'I':'D'):r.probability>=.4?'Toss-up':r.probability>.2?'Lean R':r.probability>.05?'Likely R':'Safe R';
async function calculate(){
  const request=++calculationSequence;
  $('#app').setAttribute('aria-busy','true');
  try{
    const output=await forecastClient.run(data,scenario,office);
    if(!output||request!==calculationSequence||page!=='forecast')return false;
    results=output.results;baseResults=output.baseline;
    $('#app').removeAttribute('aria-busy');
    return true;
  }catch(error){if(request===calculationSequence){$('#app').removeAttribute('aria-busy');notify('Could not update the forecast: '+error.message);}return false;}
}
function rangeControl(key,label,min,max,step,value,left,right,help='',attrs=''){
  const display=v=>key==='incumbency'?v/2:v, shown=display(value), lo=display(min),hi=display(max),st=display(step);
  const unit=['approval','pollWeight','partisanWeight','candidateWeight'].includes(key)?'%':key==='incumbency'?'×':key==='generic'||key==='nationalError'||key==='raceError'||key==='stateError'||key.includes('Sigma')?'pp':'';
  return `<div class="control"><div class="control-top"><label for="${key}-number">${label}</label><div class="control-entry"><button type="button" class="nudge" data-nudge="${key}" data-delta="-${st}" aria-label="Decrease ${label}">−</button><input id="${key}-number" class="value-chip" data-control="${key}" type="number" min="${lo}" max="${hi}" step="${st}" value="${shown}" aria-label="${label} value" ${attrs}><span class="unit">${unit}</span><button type="button" class="nudge" data-nudge="${key}" data-delta="${st}" aria-label="Increase ${label}">+</button></div></div><input id="${key}" class="control-range" data-control="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label} slider"><div class="range-labels"><span>${left}</span><span>${right}</span></div>${help?`<div class="control-help">${help}</div>`:''}</div>`;
}
function formatControl(key,value){if(key==='incumbency')return (value/2).toFixed(1)+'×';return ['approval','pollWeight','partisanWeight','candidateWeight'].includes(key)?`${Math.round(value)}%`:key==='generic'?margin(value):key.includes('Sigma')?`${value.toFixed(1)} pp`:signed(value)+' pp';}
async function render(){
  const renderId=++renderSequence;clearTimeout(timer);
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  if(page!=='forecast'){calculationSequence++;$('#app').removeAttribute('aria-busy');return page==='method'?renderMethod():renderSources();}
  if(!await calculate()||renderId!==renderSequence)return;
  const nat=nationalInputs(data,scenario),polled=results.races.filter(r=>r.pollCount).length;
  $('#app').innerHTML=`<div class="office-bar" role="tablist" aria-label="Election office">${Object.entries(officeNames).map(([k,v])=>`<button role="tab" aria-selected="${office===k}" class="office-tab ${office===k?'active':''}" data-office="${k}">${v}<span>${k==='senate'?35:k==='house'?435:36}</span></button>`).join('')}<span class="office-note">${office==='senate'?'51 D seats for control · R holds the tiebreak':office==='house'?'218 seats for a majority':'36 state elections · 14 holdovers'}</span></div>
  <div class="dashboard"><div class="content-column"><div id="summary"></div>
  <section class="panel" aria-label="${officeNames[office]} map"><div class="section-head"><h2 class="visually-hidden">${officeNames[office]} map</h2><div class="map-options">${office==='house'?`<button data-view="map" class="${view==='map'?'active':''}">States</button><button data-view="tiles" class="${view==='tiles'?'active':''}">Districts</button>`:`<button data-metric="probability" class="${metric==='probability'?'active':''}">Win chance</button><button data-metric="margin" class="${metric==='margin'?'active':''}">Margin</button>`}</div></div><div class="map-area" id="map"></div><div class="map-caption" id="map-caption"></div><div class="map-footer"><div class="legend"><span class="legend-label">D</span>${['#7392b8','#a0b5cf','#cbd7e6','#e5ad55','#ead2cf','#d8a9a3','#ba817a'].map(c=>`<i style="background:${c}"></i>`).join('')}<span class="legend-label">R</span><span> · Gray: no election · Green: I</span></div><span class="map-instruction">Select a state</span></div><div id="selection"></div></section>
  <div class="coverage"><span>◈</span><span id="coverage-text">Snapshot: ${polled} of ${results.races.length} races have included polling. Grades, bias and internal-poll exclusions affect the blend.</span><button data-page="sources">Inspect inputs ↗</button></div>
  <section class="panel distribution-panel"><div class="section-head"><h2 class="visually-hidden">Outcome distribution</h2><span class="threshold-label"><span id="interval"></span> D ${office==='governor'?'governors':'seats'} · 80% interval</span></div><div class="distribution" id="histogram" aria-label="Simulated Democratic seat distribution" role="img"></div><div class="distribution-axis" id="hist-axis"></div></section>
  <section class="panel"><div class="section-head"><h2 class="visually-hidden">Race explorer <span id="race-count"></span></h2><button class="button small ghost" id="download-forecast">Export CSV</button></div><div class="race-toolbar"><input class="search" id="search" placeholder="Search ${office==='house'?'district or state':'state'}…" aria-label="Search races" value="${esc(query)}"><select id="state-filter" aria-label="Filter races by state"><option value="">All states</option>${data.states.filter(s=>results.races.some(r=>r.state===s.abbr)).map(s=>`<option value="${s.abbr}" ${filterState===s.abbr?'selected':''}>${esc(s.name)}</option>`).join('')}</select><select id="race-filter" aria-label="Filter races"><option value="all" ${filter==='all'?'selected':''}>All races</option><option value="competitive" ${filter==='competitive'?'selected':''}>Competitive</option><option value="polled" ${filter==='polled'?'selected':''}>With polling</option><option value="changed" ${filter==='changed'?'selected':''}>Changed winner</option></select></div><div class="table-scroll"><table class="race-table"><thead><tr><th>Race</th><th>Margin</th><th>D / I chance</th><th>Inputs</th><th>Rating</th></tr></thead><tbody id="race-rows"></tbody></table></div><div class="table-foot"><span>Sorted by competitiveness · positive adjustments favor D (I in independent Senate races).</span><span id="table-total"></span></div></section></div>
  <aside class="panel workbench" aria-label="Scenario controls"><div class="workbench-head"><h2>Scenario</h2><div class="scenario-badge" id="scenario-badge"></div></div>
  <div class="controls">${rangeControl('nationalError','National polling error',-15,15,.5,scenario.nationalError,'R +15','D +15','Adds directly to every modeled race margin.')}${rangeControl('generic','Generic ballot',-20,20,.5,nat.generic,'R +20','D +20','Changes the fundamentals prior. Strongly polled races move less.')}${rangeControl('approval','Presidential approval',10,90,1,nat.approval,'10% approval','90% approval','Higher Republican presidential approval favors R in the prior.')}</div>
  <div class="workbench-section"><div class="label">State adjustment <span id="state-chip"></span></div><select class="select" id="state-control" aria-label="Choose state to adjust">${data.states.filter(s=>results.races.some(r=>r.state===s.abbr)).map(s=>`<option value="${s.abbr}">${esc(s.name)}</option>`).join('')}</select><div id="state-slider"></div><p class="control-help">Applies to every race in this state across all three offices. Added after the polling / fundamentals blend.</p></div>
  <div class="workbench-section"><details id="advanced"><summary>Model weights & uncertainty</summary>${rangeControl('pollWeight','Polling influence',0,200,5,scenario.pollWeight,'Fundamentals only','2× evidence')}${rangeControl('incumbency','Incumbency scale',0,6,.5,scenario.incumbency,'0×','3×','Scales the fitted office-specific incumbency effect. Prior officeholding and candidate history are separate; House incumbency remains unverified.')}${rangeControl('candidateWeight','Candidate-history influence',0,200,5,scenario.candidateWeight,'0%','200%','Past election performance changes the prior, not the poll average.')}${rangeControl('partisanWeight','Partisan poll weight',0,100,5,scenario.partisanWeight,'Exclude','Full weight','Applies to polls flagged D, R or I by their source. Historical bias is handled separately.')}<label class="checkbox-label"><input type="checkbox" id="include-internals" ${scenario.includeInternals?'checked':''}> Include campaign/internal polls at 25% weight</label><label class="checkbox-label"><input type="checkbox" id="adjust-bias" ${scenario.adjustBias?'checked':''}> Correct published historical D−R bias</label>${rangeControl('nationalSigma','National uncertainty',0,8,.5,scenario.nationalSigma,'0 pp','8 pp')}${rangeControl('stateSigma','State uncertainty',0,8,.5,scenario.stateSigma,'0 pp','8 pp')}${rangeControl('localSigma','Race uncertainty floor',.5,10,.5,scenario.localSigma,'0.5 pp','10 pp')}<label class="control-help" for="caucus">Independent Senate winners</label><select class="select" id="caucus"><option value="other" ${scenario.neCaucus==='other'?'selected':''}>Remain independent (default)</option><option value="D" ${scenario.neCaucus==='D'?'selected':''}>Hypothetical: join D caucus</option></select><p class="control-help">NE, MT and SD independent challengers are never automatically counted as Democrats. The 50–50 Senate tiebreak goes to R.</p></details></div>
  <div class="workbench-section"><div class="actions"><button class="button primary" id="save-scenario">Save scenario</button><button class="button" id="share-scenario">Share</button></div><button class="reset" id="reset-scenario">Reset to baseline</button><button class="reset" id="open-scenarios">Saved scenarios & import / export</button></div></aside></div>`;
  bindForecast();updateVisuals();
}
function summary(){
  const total=office==='house'?435:office==='senate'?100:50,other=results.otherMean,r=total-results.mean-other;
  const change=results.mean-baseResults.mean;
  const odds=office==='governor'?`${results.mean.toFixed(1)}<span class="small"> / 50</span>`:pct(results.control);
  const seats=office==='governor'?`${r.toFixed(1)}<span class="small"> R</span>`:`${results.mean.toFixed(1)}<span class="small"> D / ${r.toFixed(1)} R</span>`;
  $('#summary').innerHTML=`<section class="summary" aria-live="polite"><div class="metric"><div class="label">${office==='governor'?'Expected D governors':'Democratic control'}</div><div class="metric-value blue">${odds}</div><div class="metric-note">${office==='governor'?'Includes 5 D and 9 R holdovers':`R control <span class="red">${pct(results.rcontrol)}</span>${results.unresolved>.001?' · unresolved '+pct(results.unresolved):''}`}</div></div><div class="metric"><div class="label">${office==='governor'?'Expected R governors':'Expected seat count'}</div><div class="metric-value">${seats}</div><div class="seatbar"><span class="dem" style="width:${results.mean/total*100}%"></span>${other>.001?`<span class="ind" style="width:${other/total*100}%"></span>`:''}<span class="rep" style="width:${r/total*100}%"></span></div><div class="metric-note">${other>.01?`${other.toFixed(1)} independent · `:''}${Math.abs(change)<.05?'Baseline scenario':`${signed(change)} D ${office==='governor'?'governors':'seats'} vs. baseline`}</div></div><div class="metric"><div class="label">Competitive races</div><div class="metric-value">${results.races.filter(r=>Math.max(r.probability,1-r.probability-r.thirdProbability)<.8).length}<span class="small"> / ${results.races.length}</span></div><div class="metric-note">No candidate above 80% win chance</div></div></section>`;
  $('#scenario-badge').textContent='';
}
function updateVisuals(){summary();renderMap();renderSelection();renderHistogram();renderTable();syncStateControl();$('#interval').textContent=`${results.low}–${results.high}`;}
function renderMap(){
  const container=$('#map'),mode=office==='house'&&view==='tiles'?'tiles':'map';
  const groups=new Map();for(const r of results.races){if(!groups.has(r.state))groups.set(r.state,[]);groups.get(r.state).push(r);}
  const currentState=results.races.find(r=>r.id===selected)?.state;
  if(mode==='tiles'){
    if(container.dataset.mode!=='tiles')container.innerHTML=`<div class="tile-map">${data.states.filter(s=>groups.has(s.abbr)).map(s=>`<div class="tile-group"><span class="tile-state">${s.abbr}</span><div class="tile-set">${groups.get(s.abbr).map(r=>`<button data-race="${r.id}" class="tile"></button>`).join('')}</div></div>`).join('')}</div>`;
    container.dataset.mode='tiles';
    const indexed=new Map(results.races.map(r=>[r.id,r]));
    for(const button of container.querySelectorAll('.tile')){
      const r=indexed.get(button.dataset.race);button.style.background=raceColor(r);button.classList.toggle('selected',r.id===selected);button.title=`${r.name}: ${margin(r.margin)} · D ${pct(r.probability)}`;button.setAttribute('aria-label',`${r.name}, Democratic win chance ${pct(r.probability)}`);
    }
    $('#map-caption').textContent='One square per district, grouped by state. Tile positions are not district geography.';return;
  }
  if(container.dataset.mode!=='map')container.innerHTML=`<svg class="us-map" viewBox="0 0 975 610" role="group" aria-label="Interactive election map">${map.map(s=>`<path d="${s.path}" data-state="${s.abbr}" tabindex="0" role="button"><title></title></path>`).join('')}${map.filter(s=>s.abbr!=='DC').map(s=>`<text x="${s.centroid[0]}" y="${s.centroid[1]+3}" text-anchor="middle">${s.abbr}</text>`).join('')}</svg>`;
  container.dataset.mode='map';
  container.querySelector('svg').setAttribute('aria-label',`Interactive ${officeNames[office]} election map`);
  for(const path of container.querySelectorAll('[data-state]')){
    const state=data.states.find(s=>s.abbr===path.dataset.state),rs=groups.get(state.abbr)||[];
    const race=office==='house'&&rs.length?{probability:rs.reduce((n,r)=>n+r.probability,0)/rs.length,margin:rs.reduce((n,r)=>n+r.margin,0)/rs.length}:rs[0];
    const label=race?`${state.name}: ${office==='house'?`${rs.length} districts, expected D seats ${rs.reduce((n,r)=>n+r.probability,0).toFixed(1)}`:`${margin(race.margin,race.independent)}, ${race.independent?'I':'D'} win chance ${pct(race.probability)}`}`:`${state.name}: no ${office} election`;
    const fill=raceColor(race);if(path.getAttribute('fill')!==fill)path.setAttribute('fill',fill);
    path.classList.toggle('selected',currentState===state.abbr);path.setAttribute('aria-label',label);path.querySelector('title').textContent=label;
  }
  $('#map-caption').textContent=office==='house'?'State colors show average district D win probability. Select Districts to see all 435 seats.':metric==='probability'?'Color shows win probability. Gray states have no election for this office.':'Color shows the projected D−R margin; independent Senate races use I−R.';
}
function historyEvidence(r){
 const profile=r.candidateHistory;if(!profile)return '';
 const history=[...(profile.dem?.history??[]),...(profile.rep?.history??[])].sort((a,b)=>b.year-a.year);
 return `<details class="candidate-history"><summary>Candidate history & prior</summary><p>Candidate / experience effect: ${signed(r.candidateEffect)} pp D−R. Incumbency: ${signed(r.incumbencyEffect)} pp. Prior uncertainty σ ${r.priorSigma.toFixed(1)} pp.</p><p>${esc(profile.dem?.name??r.independentCandidate??'Left candidate')}: ${esc(profile.dem?.status??'No comparable history')}. ${esc(profile.rep?.name??'Republican')}: ${esc(profile.rep?.status??'No comparable history')}.</p>${profile.transfer?'<p>House-to-Senate results are weighted at 50%.</p>':''}${history.length?`<table><thead><tr><th>Year / candidate</th><th>Own margin</th><th>Residual</th></tr></thead><tbody>${history.map(h=>`<tr><td><a href="${esc(h.source)}" target="_blank" rel="noopener noreferrer">${h.year} ${esc(h.candidate)}</a></td><td>${signed(h.margin)}</td><td>${signed(h.residual)}</td></tr>`).join('')}</tbody></table>`:''}<p>Candidate residuals include opponent quality and turnout; the model shrinks them toward zero.</p></details>`;
}
function renderSelection(){
  const r=results.races.find(r=>r.id===selected)||results.races[0];selected=r.id;const baseline=baseResults.races.find(b=>b.id===r.id);
  const win=r.independent?'I':'D';
  const markup=`<div class="selection-detail" data-race-id="${r.id}"><div><div class="selection-title">${esc(r.name)}${r.special?' <span class="year">SPECIAL</span>':''}</div><div class="selection-subtitle">${esc([r.independent?r.independentCandidate:r.demCandidate,r.repCandidate].filter(Boolean).join(' / '))}<br>${r.incumbentParty==='I'?'Independent':r.incumbentParty==='D'?'Democratic':'Republican'}-held · ${r.pollCount?`${r.pollCount} sourced poll${r.pollCount>1?'s':''}`:'Fundamentals only'}${r.incumbentRunning===false?' · no incumbency bonus':''}</div><div class="detail-metrics"><div><span>Projected ${r.independent?'I−R':'D−R'}</span><strong class="${r.margin>=0?(r.independent?'green':'blue'):'red'}">${margin(r.margin,r.independent)}</strong></div><div><span>${win } win chance</span><strong>${pct(r.probability)}</strong></div><div><span>Baseline</span><strong>${margin(baseline.margin,r.independent)}</strong></div></div>${historyEvidence(r)}${r.thirdProbability?`<p class="selected-note green">Third-candidate win chance: ${pct(r.thirdProbability)} · R ${pct(1-r.probability-r.thirdProbability)}. Three-candidate approximation, not a ranked-choice model.</p>`:''}</div><div class="detail-control">${rangeControl('raceError','This race only',-20,20,.5,scenario.races[r.id]??0,'R +20',`${win} +20`)}<div class="selected-note">Polling average: ${r.pollAverage==null?'No qualifying polls':margin(r.pollAverage,r.independent)} · Prior: ${margin(r.prior,r.independent)} · Polling blend: ${Math.round(r.pollWeight*100)}%${r.note?'<br>'+esc(r.note):''}</div></div></div>`;
  const existing=$('#selection .selection-detail');
  if(existing?.dataset.raceId===r.id){
    const template=document.createElement('template');template.innerHTML=markup;
    const next=template.content.firstElementChild;
    const historyOpen=existing.querySelector('.candidate-history')?.open;
    existing.children[0].replaceWith(next.children[0]);
    if(existing.querySelector('.candidate-history'))existing.querySelector('.candidate-history').open=Boolean(historyOpen);
    existing.querySelector('.detail-control .selected-note').replaceWith(next.querySelector('.detail-control .selected-note'));
    const input=$('#raceError'),number=$('#raceError-number'),value=scenario.races[r.id]??0;if(document.activeElement!==input&&document.activeElement!==number){input.value=value;number.value=value;}
  }else $('#selection').innerHTML=markup;

}
function syncStateControl(){
  const st=results.races.find(r=>r.id===selected)?.state||'MI',wrapper=$('#state-slider'),value=scenario.states[st]??0;
  $('#state-control').value=st;$('#state-chip').textContent=st;
  if(wrapper.dataset.state!==st){wrapper.innerHTML=rangeControl('stateError','State polling error',-20,20,.5,value,'R +20','D / I +20');wrapper.dataset.state=st;}
  else {const input=$('#stateError'),number=$('#stateError-number');if(document.activeElement!==input&&document.activeElement!==number){input.value=value;number.value=value;}}
}
function renderHistogram(){
  const values=Object.keys(results.histogram).map(Number),min=Math.min(...values),max=Math.max(...values),peak=Math.max(...Object.values(results.histogram));
  const binWidth=office==='house'?Math.max(1,Math.ceil((max-min)/60)):1,bins=[];for(let n=min;n<=max;n+=binWidth){let v=0;for(let j=0;j<binWidth;j++)v+=results.histogram[n+j]||0;bins.push({n,v});}const bpeak=Math.max(...bins.map(b=>b.v));
  const majority=office==='senate'?51:office==='house'?218:25;
  $('#histogram').innerHTML=bins.map(({n,v})=>`<div class="hist-bar ${n>=majority?'dem':'rep'}" style="height:${Math.max(1,v/bpeak*100)}%" data-tip="${n}${binWidth>1?'–'+(n+binWidth-1):''} D: ${pct(v/results.runs)}"></div>`).join('');
  $('#histogram').setAttribute('aria-label',`Democratic count: median ${results.median}, 80 percent interval ${results.low} to ${results.high}. ${office==='governor'?'':`${majority} needed for control.`}`);
  $('#hist-axis').innerHTML=`<span>${min} D</span><span>Median ${results.median} · ${office==='governor'?'D governors':majority+' D for control'}</span><span>${max} D</span>`;
}
function renderTable(){
  const baseline=new Map(baseResults.races.map(r=>[r.id,r]));
  let rs=results.races.filter(r=>(!filterState||r.state===filterState)&&(!query||`${r.name} ${data.states.find(s=>s.abbr===r.state)?.name}`.toLowerCase().includes(query.toLowerCase())));
  $('#state-filter').value=filterState;
  if(filter==='competitive')rs=rs.filter(r=>Math.max(r.probability,1-r.probability-r.thirdProbability)<.8);
  if(filter==='polled')rs=rs.filter(r=>r.pollCount);if(filter==='changed')rs=rs.filter(r=>(r.margin>0)!==(baseline.get(r.id).margin>0));
  rs.sort((a,b)=>Math.abs(a.probability-.5)-Math.abs(b.probability-.5)||a.name.localeCompare(b.name));
  const body=$('#race-rows'),visible=rs.slice(0,tableLimit);
  if(!rowCaches.has(body))rowCaches.set(body,new Map());
  const cache=rowCaches.get(body),text=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
  const ordered=visible.map(r=>{
    let row=cache.get(r.id);
    if(!row){
      row=document.createElement('tr');row.dataset.race=r.id;row.tabIndex=0;
      row.innerHTML='<td class="race-name"><span></span><small></small></td><td></td><td><div class="probability"><span class="margin"></span><span class="prob-track"><i></i></span></div></td><td><span class="margin" style="color:var(--muted)"></span></td><td><span></span></td>';
      row.setAttribute('aria-label',`Explore ${r.name}`);cache.set(r.id,row);
    }
    const cells=row.children;
    row.classList.toggle('selected',selected===r.id);
    text(cells[0].children[0],r.name);
    text(cells[0].children[1],(r.independent?'I vs. R':r.special?'Special election':r.office==='house'?r.incumbentParty+' reference incumbent':r.incumbentParty+'-held')+(r.offset?' · adjusted':''));
    text(cells[1],margin(r.margin,r.independent)+(r.thirdProbability>.01?' *':''));
    cells[1].className='margin '+(r.margin>=0?(r.independent?'green':'blue'):'red');
    text(cells[2].querySelector('.margin'),(r.independent?'I ':'')+pct(r.probability));
    cells[2].querySelector('i').style.width=r.probability*100+'%';
    text(cells[3].children[0],r.pollCount?r.pollCount+' poll'+(r.pollCount>1?'s':''):'Prior only');
    const label=rating(r);text(cells[4].children[0],label);cells[4].children[0].className='rating'+(label==='Toss-up'?' tossup':'');
    return row;
  });
  if(!ordered.length)body.innerHTML='<tr><td colspan="5" class="empty">No races match these filters.</td></tr>';
  else if(ordered.length!==body.children.length||ordered.some((row,i)=>body.children[i]!==row))body.replaceChildren(...ordered);
  $('#race-count').textContent=`${rs.length} races`;const totalMarkup=`${Math.min(tableLimit,rs.length)} of ${rs.length}${rs.length>tableLimit?' <button class="button small ghost" id="load-more">Show more</button>':''}`;if($('#table-total').innerHTML!==totalMarkup){$('#table-total').innerHTML=totalMarkup;$('#load-more')?.addEventListener('click',()=>{tableLimit+=50;renderTable();});}
}
async function updateModel(){if(await calculate())updateVisuals();}
function scheduleUpdate(){clearTimeout(timer);timer=setTimeout(updateModel,16);}
function bindForecast(){
  $('#app').addEventListener('input',onForecastInput);
  $('#search').addEventListener('input',e=>{query=e.target.value;tableLimit=50;renderTable();});
  $('#state-filter').addEventListener('change',e=>{filterState=e.target.value;tableLimit=50;renderTable();});
  $('#race-filter').addEventListener('change',e=>{filter=e.target.value;tableLimit=50;renderTable();});
  $('#state-control').addEventListener('change',e=>{const r=results.races.find(r=>r.state===e.target.value);if(r){selected=r.id;updateVisuals();}else notify('No '+officeNames[office]+' race in that state.');});
  $('#include-internals').onchange=e=>{scenario.includeInternals=e.target.checked;updateModel();};
  $('#adjust-bias').onchange=e=>{scenario.adjustBias=e.target.checked;updateModel();};
  $('#caucus').addEventListener('change',e=>{scenario.neCaucus=e.target.value;updateModel();});
  $('#save-scenario').onclick=saveScenario;$('#share-scenario').onclick=shareScenario;$('#reset-scenario').onclick=()=>{scenario=structuredClone(DEFAULTS);history.replaceState(null,'',location.pathname+location.search);render();notify('Baseline restored.');};$('#open-scenarios').onclick=openScenarios;
  $('#download-forecast').onclick=()=>{const rows=[['race','office','state','projected_left_minus_R','left_party','left_win_probability','independent_third_win_probability','poll_count','poll_weight','prior','local_adjustment','snapshot_date'],...results.races.map(r=>[r.name,r.office,r.state,r.margin.toFixed(3),r.independent?'I':'D',r.probability,r.thirdProbability,r.pollCount,r.pollWeight.toFixed(3),r.prior.toFixed(3),r.offset,data.asOf])];download('midterm-atlas-'+office+'-forecast.csv',rows.map(r=>r.join(',')).join('\n'),'text/csv');};
}
function onForecastInput(e){const k=e.target.dataset.control;if(!k)return;if(e.target.value===''||!Number.isFinite(Number(e.target.value)))return;const range=$('#'+k),number=$('#'+k+'-number'),factor=k==='incumbency'?2:1;let n=e.target.type==='range'?Number(e.target.value):Number(e.target.value)*factor;const min=Number(range.min),max=Number(range.max),step=Number(range.step);n=Math.max(min,Math.min(max,min+Math.round((n-min)/step)*step));n=Number(n.toFixed(4));range.value=n;if(e.target.type==='range')number.value=k==='incumbency'?n/factor:n;else if(n!==Number(e.target.value)*factor)number.value=k==='incumbency'?n/factor:n;if(k==='raceError')scenario.races[selected]=n;else if(k==='stateError'){const state=results.races.find(r=>r.id===selected).state;scenario.states[state]=n;}else scenario[k]=n;scheduleUpdate();}
$('#app').addEventListener('click',e=>{const b=e.target.closest('[data-nudge]');if(!b)return;const input=$('#'+b.dataset.nudge+'-number');input.value=String(Math.max(Number(input.min),Math.min(Number(input.max),Number(input.value||0)+Number(b.dataset.delta))));input.dispatchEvent(new Event('input',{bubbles:true}));});
// Delegated controls survive map/table/detail redraws.
$('#app').addEventListener('click',e=>{
  const officeButton=e.target.closest('[data-office]');if(officeButton){office=officeButton.dataset.office;view=office==='house'?'tiles':'map';selected=data.races.find(r=>r.office===office&&r.state==='MI').id;filterState='';query='';filter='all';tableLimit=50;render();return;}
  const b=e.target.closest('[data-page]');if(b){page=b.dataset.page;render();window.scrollTo({top:0});return;}
  const m=e.target.closest('[data-metric]');if(m){metric=m.dataset.metric;document.querySelectorAll('[data-metric]').forEach(b=>b.classList.toggle('active',b===m));renderMap();return;}
  const v=e.target.closest('[data-view]');if(v){view=v.dataset.view;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===v));renderMap();return;}
  const r=e.target.closest('[data-race]');if(r){selected=r.dataset.race;updateVisuals();return;}
  const s=e.target.closest('[data-state]');if(s){const races=results.races.filter(r=>r.state===s.dataset.state);if(!races.length){notify('No '+officeNames[office]+' election in this state.');return;}selected=races.sort((a,b)=>Math.abs(a.margin)-Math.abs(b.margin))[0].id;if(office==='house')filterState=s.dataset.state;updateVisuals();}
});
$('#app').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-state],[data-race]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
document.querySelectorAll('header [data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;render();window.scrollTo({top:0});});$('.brand').onclick=e=>{e.preventDefault();page='forecast';render();};
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function saveScenario(){const name=prompt('Name this scenario',`Scenario ${saved.length+1}`);if(!name?.trim())return;saved.push({name:name.trim().slice(0,80),scenario:structuredClone(scenario),office,created:new Date().toISOString(),dataVersion:data.version});saved=saved.slice(-30);try{localStorage.setItem('atlas-scenarios-v1',JSON.stringify(saved));notify('Scenario saved in this browser.');}catch{notify('Browser storage is unavailable. Export your scenario instead.');}}
async function shareScenario(){
  const payload={scenario,office,dataVersion:data.version};const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(payload))));const url=new URL(location.href);url.hash='scenario='+encoded;
  history.replaceState(null,'',url);try{await navigator.clipboard.writeText(url.href);notify('Scenario link copied. Custom polling imports are not included.');}catch{prompt('Copy this scenario link. Custom polling imports are not included:',url.href);}
}
function openScenarios(){const dialog=$('#scenario-dialog');$('#scenario-list').innerHTML=saved.length?saved.map((s,i)=>`<div class="saved-item"><span>${esc(s.name)}</span><div><button class="button small" data-load="${i}">Load</button><button class="button small ghost" data-delete="${i}" aria-label="Delete ${esc(s.name)}">×</button></div></div>`).join(''):'<p class="empty">Save a scenario to compare it later.<br>Scenarios are stored on this device.</p>';if(!dialog.open)dialog.showModal();}
$('#scenario-list').onclick=e=>{const load=e.target.closest('[data-load]'),del=e.target.closest('[data-delete]');if(load){const s=saved[Number(load.dataset.load)];try{scenario=validateScenario(s.scenario,data);office=s.office in officeNames?s.office:'senate';view=office==='house'?'tiles':'map';selected=data.races.find(r=>r.office===office).id;$('#scenario-dialog').close();page='forecast';render();notify('Scenario loaded.');}catch(err){notify(err.message);}}if(del){saved.splice(Number(del.dataset.delete),1);try{localStorage.setItem('atlas-scenarios-v1',JSON.stringify(saved));}catch{}openScenarios();}};
$('#export-scenario').onclick=()=>download('midterm-atlas-scenario.json',JSON.stringify({scenario,office,dataVersion:data.version},null,2));$('#import-scenario').onclick=()=>{importType='scenario';$('#file-input').click();};
$('#file-input').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>12_000_000)throw Error('Choose a JSON file smaller than 12 MB.');const raw=JSON.parse(await file.text());if(importType==='scenario'){scenario=validateScenario(raw.scenario??raw,data);if(raw.office in officeNames)office=raw.office;view=office==='house'?'tiles':'map';selected=data.races.find(r=>r.office===office).id;$('#scenario-dialog').close();page='forecast';render();notify('Scenario imported.');}else{const rows=Array.isArray(raw)?raw:raw.polls;if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw Error('Expected 1–10,000 polling rows.');const ids=new Set(data.races.map(r=>r.id));rows.forEach((p,i)=>{const errors=validatePoll(p,ids);if(errors.length)throw Error(`Row ${i+1}: ${errors.join(', ')}`);if(p.end>data.asOf)throw Error(`Row ${i+1}: field end date is later than the dataset date.`);});const byId=new Map(data.polls.map(p=>[p.id,p]));for(const p of rows)byId.set(p.id,p);const dedup=new Set();data.polls=[...byId.values()].filter(p=>{const k=p.raceId+'|'+(p.pollsterFamily||p.pollster.toLowerCase().split('/')[0].trim())+'|'+p.end;if(dedup.has(k))return false;dedup.add(k);return true;});render();notify(`${rows.length} polling rows imported for this session. Export to preserve them.`);}}catch(err){notify(err.message);} };
function renderMethod(){
 const m=data.fundamentals?.models??{};
 const s=m.senate,g=m.governor;
 $('#app').innerHTML=`<article class="page-content method-prose">
 <p>The ${esc(data.asOf)} snapshot contains ${data.polls.length.toLocaleString()} unique polls from Silver Bulletin, PollResults.org's NYT tracker and cited Wikipedia race tables. The model uses current general-election matchups. Duplicate pollster-family, race and field-end records are consolidated, preferring likely-voter samples.</p>
 <p>Poll weight multiplies recency, sample size, respondent population, pollster accuracy, partisan status and internal status. Recency has a 14-day half-life; polls older than 120 days are excluded. Sample size is capped at 1,500 and scaled by sqrt(n / 800); without n, the sample factor is min(1.5, 3 / margin of error), or 0.7 if both are missing. Likely-voter, registered-voter and adult samples receive factors of 1.00, 0.85 and 0.60. Unrated pollsters receive an accuracy factor of 0.65.</p>
 <figure class="method-equation" aria-label="Poll-weight and forecast equations"><div><span>Poll weight</span><b>=</b><span>recency &times; sample &times; population &times; accuracy &times; partisan &times; internal</span></div><div><span>Poll blend <i>w</i></span><b>=</b><span><i>V</i><sub>prior</sub> / (<i>V</i><sub>prior</sub> + <i>V</i><sub>poll</sub>)</span></div><div><span>Race margin</span><b>=</b><span>(1 - <i>w</i>) &times; prior + <i>w</i> &times; adjusted polls + scenario shifts</span></div><figcaption><i>V</i><sub>poll</sub> = 9 + 25 / effective poll weight</figcaption></figure>
 <p>Pollster accuracy uses clamp((4 / max(2, 4 + predictive plus-minus))<sup>2</sup>, 0.25, 2.00), based on Silver Bulletin ratings. Each pollster family's base weight is capped at one sample-equivalent per race; accuracy and other discounts remain. When enabled, mean-reverted D-R bias is subtracted from two-party poll margins. Source-flagged partisan polls receive half weight by default. Campaign/internal polls are excluded unless enabled, then receive a 0.25 multiplier. Banned and methodology-excluded polls receive zero weight.</p>
 <p>The national environment is the weighted generic-ballot margin. Presidential approval changes it by -0.3 points per approval point from the observed approval average; approval is not added separately at baseline. Senate and governor priors use ridge regressions on presidential lean, national environment, incumbency and prior-winner experience. Candidate-history residuals are partially pooled and decay with a 10-year half-life. They adjust priors, not current polls; retiring incumbents' effects do not transfer.</p>
 <p>The House prior uses district presidential lean and the national environment, with a 2-point party incumbency adjustment at baseline. House-specific candidate-history effects are not fitted because verified candidate records are incomplete. Mary Peltola's House results transfer to her Senate prior at 50%, with added uncertainty. Fundraising, scandals and economic indicators are not fitted.</p>
 <p>Effective poll weight is the aggregate poll weight multiplied by the polling-influence setting. Prior-error standard deviations are 8.36 points for Senate, 12.19 for governors and 12 for House; independent-candidate and cross-office-transfer races receive additional variance. National, state and local error defaults are 2.5, 1.5 and 3 points. Scenario controls can shift national, state or race margins and change generic ballot, approval, poll influence, candidate influence, incumbency, partisan weighting, internal-poll inclusion and uncertainty.</p>
 <p>Each forecast uses 4,000 seeded simulations with shared national error, shared state error and race-level error. Win chance is the share of simulations won; the seat distribution is the simulated count. Senate control requires 51 Democratic-caucus seats or 50 Republican seats, reflecting the Republican vice-presidential tiebreak. Independents remain separate unless assigned to the Democratic caucus. Third-candidate outcomes use a plurality approximation; ranked-choice transfers and Louisiana runoffs are not modeled.</p>
 <p>Validation reports 2022 and 2024 holdout margin RMSE conditional on the realized national House vote. Senate RMSE is ${s?.validation.rmse.toFixed(2)??'unavailable'} points (n=${s?.validation.n??'unavailable'}), versus ${s?.validationWithoutCandidateEffects.rmse.toFixed(2)??'unavailable'} without candidate effects. Governor RMSE is ${g?.validation.rmse.toFixed(2)??'unavailable'} points (n=${g?.validation.n??'unavailable'}), versus ${g?.validationWithoutCandidateEffects.rmse.toFixed(2)??'unavailable'} without candidate effects. These are margin errors, not probability-calibration scores.</p>
 </article>`;
}
function renderSources(){
 const ids=new Set(data.polls.filter(p=>!['generic','approval'].includes(p.raceId)&&pollContribution(p,data.asOf,scenario).weight>0).map(p=>p.raceId));
 const excluded=data.polls.filter(p=>pollContribution(p,data.asOf,scenario).weight===0).length;
 $('#app').innerHTML=`<article class="page-content"><h1>Polling & sources</h1><p class="intro">${oldDate(data.asOf)} · ${data.polls.length.toLocaleString()} unique polls · ${ids.size} races with included polls · ${excluded} excluded under the current controls.</p><p class="intro">Pollster grades and historical error estimates: Silver Bulletin, January 14, 2026. Poll records: Silver Bulletin, PollResults.org and cited Wikipedia releases.</p>
 <div class="source-cards">${data.sources.map(source=>`<div class="source-card"><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)}</a><p>${esc(source.note)}</p></div>`).join('')}</div>
 <details class="ratings-ledger"><summary>Pollster accuracy grades (${data.pollsterRatings?.length??0})</summary><p>Predictive plus-minus is historical polling error; lower values indicate higher accuracy. Positive D−R bias means the pollster historically overstated Democratic support.</p><div class="table-scroll"><table class="race-table"><thead><tr><th>Pollster</th><th>Grade</th><th>Predictive ±</th><th>Historical bias</th><th>Rated polls</th></tr></thead><tbody>${(data.pollsterRatings??[]).slice().sort((a,b)=>a.name.localeCompare(b.name)).map(r=>`<tr><td><a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a></td><td>${esc(r.grade??'Unrated')}${r.banned?' / banned':''}</td><td>${r.predictivePlusMinus==null?'—':signed(r.predictivePlusMinus)}</td><td>${r.meanRevertedBias==null?'—':margin(r.meanRevertedBias)}</td><td>${r.pollCount??'—'}</td></tr>`).join('')}</tbody></table></div></details>
 <div class="source-controls" aria-label="Polling data actions"><button class="button" id="import-polls">Import polling JSON</button><button class="button" id="export-data">Download dataset</button><button class="button" id="example-polls">Example schema</button><button class="button ghost" id="restore-data">Restore dataset</button></div>
 <div class="section-head"><h2>Polling ledger</h2><select class="select" id="poll-filter" aria-label="Filter polling ledger" style="width:auto;margin:0"><option value="all">All polls</option><option value="senate">Senate</option><option value="house">House</option><option value="governor">Governors</option><option value="national">National</option><option value="excluded">Excluded</option><option value="partisan">Partisan / internal</option></select></div><input class="search ledger-search" id="poll-search" placeholder="Search state, race, pollster or sponsor…" aria-label="Search polling ledger"><div class="poll-list" id="poll-list"></div><div class="table-foot" id="poll-pagination"></div></article>`;
 $('#import-polls').onclick=()=>{importType='polls';$('#file-input').click();};$('#export-data').onclick=()=>download('midterm-atlas-inputs.json',JSON.stringify(data,null,2));$('#example-polls').onclick=()=>download('polling-import-example.json',JSON.stringify([data.polls.find(p=>p.raceId==='senate-ME')],null,2));$('#restore-data').onclick=()=>{data=structuredClone(lastDataSnapshot);renderSources();notify('Original snapshot restored.');};
 $('#poll-filter').value=pollLedgerFilter;$('#poll-search').value=pollLedgerQuery;
 $('#poll-filter').onchange=e=>{pollLedgerFilter=e.target.value;pollListLimit=100;renderPollLedger();};$('#poll-search').oninput=e=>{pollLedgerQuery=e.target.value;pollListLimit=100;renderPollLedger();};renderPollLedger();
}
function renderPollLedger(){
 const filter=pollLedgerFilter;
 const ps=data.polls.filter(p=>filter==='all'||filter==='excluded'&&pollContribution(p,data.asOf,scenario).weight===0||filter==='partisan'&&(p.partisan||p.internal)||filter==='national'&&['generic','approval'].includes(p.raceId)||['senate','house','governor'].includes(filter)&&p.raceId.startsWith(filter+'-')).filter(p=>!pollLedgerQuery||`${p.raceId} ${p.pollster} ${p.pollsterDisplay??''} ${p.sponsors??''}`.toLowerCase().includes(pollLedgerQuery.toLowerCase())).sort((a,b)=>b.end.localeCompare(a.end)||a.raceId.localeCompare(b.raceId));
 $('#poll-list').innerHTML=ps.length?ps.slice(0,pollListLimit).map(p=>{
   const contribution=pollContribution(p,data.asOf,scenario),r=p.rating;
   const candidateValue=p.independent!=null?'I '+p.independent:'D '+p.dem;
   const result=p.raceId==='approval'?`${p.approve}% approve / ${p.disapprove}% disapprove`:`${candidateValue}% / R ${p.rep}%${p.other?' / '+(p.thirdParty??'I')+' '+p.other+'%':''}`;
   const status=contribution.weight>0?'Included':'Excluded: '+contribution.reason;
   return `<div class="poll-card"><div class="poll-card-head"><strong>${esc(p.raceId)} · ${esc(p.pollsterDisplay??p.pollster)}</strong><span class="margin">${result}</span></div><div class="poll-meta">Grade ${esc(r?.grade??'Unrated')} · ${p.start?oldDate(p.start)+' – ':''}${oldDate(p.end)} · ${esc(p.population)} · ${p.n?'n = '+p.n:p.fullSample?'reported full sample '+p.fullSample+'; effective n unknown':'effective n unreported'}</div><div class="poll-meta">${esc(status)} · ${p.partisan?esc(p.partisan)+' partisan source flag':'No partisan flag supplied'} · ${p.internal?'Campaign/internal':'Internal commissioning '+(p.internalStatus==='not-provided-by-source'?'unreported':'not flagged')}<br>Historical D−R bias: ${r?.meanRevertedBias==null?'unrated':margin(r.meanRevertedBias)} · Applied margin correction: ${signed(-contribution.bias)} pp · Weight before pollster-family cap: ${contribution.weight.toFixed(3)}</div>${p.sponsors?`<p>Sponsor: ${esc(p.sponsors)}</p>`:''}${p.notes?`<p>${esc(p.notes)}</p>`:''}<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Original cited release</a>${r?.source?` · <a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">Grade source (${esc(r.date??'2026-01-14')})</a>`:''}<details class="poll-provenance"><summary>Source provenance</summary><p>${esc(p.sourceTier??'Session import')} · ${esc(p.candidateLeft??p.demCandidate??'')} / ${esc(p.candidateRight??p.repCandidate??'')}</p>${(p.provenance??[p.url]).map(url=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a><br>`).join('')}</details></div>`;
 }).join(''):'<div class="empty">No polls match these filters.</div>';
 $('#poll-pagination').innerHTML=`<span>${Math.min(pollListLimit,ps.length)} of ${ps.length} polls</span>${ps.length>pollListLimit?'<button class="button" id="more-polls">Show 100 more</button>':''}`;$('#more-polls')?.addEventListener('click',()=>{pollListLimit+=100;renderPollLedger();});
}

try{
 const responses=await Promise.all([fetch('data.json'),fetch('map.json')]);if(responses.some(r=>!r.ok))throw Error('Could not load the input files.');[data,map]=await Promise.all(responses.map(r=>r.json()));lastDataSnapshot=structuredClone(data);
 const ids=new Set(data.races.map(r=>r.id));for(const p of data.polls){const errors=validatePoll(p,ids);if(errors.length)throw Error(`Dataset error (${p.id}): ${errors.join(', ')}`);}
 if(location.hash.startsWith('#scenario=')){try{const raw=JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(10)))));scenario=validateScenario(raw.scenario,data);if(raw.office in officeNames)office=raw.office;view=office==='house'?'tiles':'map';selected=data.races.find(r=>r.office===office).id;}catch{notify('Could not read the shared scenario. Showing baseline.');}}
 render();
}catch(err){$('#app').innerHTML=`<div class="error-box"><h1>The forecast could not load.</h1><p>${esc(err.message)}</p><p>Serve the project through an HTTP server, then reload.</p></div>`;console.error(err);}
