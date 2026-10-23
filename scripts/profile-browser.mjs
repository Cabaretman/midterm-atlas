import {chromium} from '@playwright/test';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 await page.goto('http://127.0.0.1:4173');await page.locator('#nationalError').waitFor();
 await page.getByRole('tab',{name:'House'}).click();await page.waitForFunction(()=>document.querySelector('[data-office="house"]')?.getAttribute('aria-selected')==='true'&&document.querySelectorAll('#race-rows tr').length===50);
 await page.waitForFunction(()=>!document.querySelector('#app').hasAttribute('aria-busy'));
 const session=await page.context().newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:4});
 const metrics=await page.evaluate(async()=>{
   const longTasks=[];const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>+e.duration.toFixed(1))));observer.observe({type:'longtask'});
   const samples=[];
   for(let i=0;i<5;i++){
     const t=performance.now();let firstFrame;
     const settled=new Promise(resolve=>{
       const mutation=new MutationObserver(()=>{mutation.disconnect();requestAnimationFrame(()=>resolve(performance.now()-t));});
       mutation.observe(document.querySelector('#summary'),{childList:true,subtree:true});
     });
     const input=document.querySelector('#nationalError');input.value=i+1;input.dispatchEvent(new Event('input',{bubbles:true}));
     await new Promise(resolve=>requestAnimationFrame(()=>{firstFrame=performance.now()-t;resolve();}));
     samples.push({inputToFrameMs:+firstFrame.toFixed(1),forecastToFrameMs:+(await settled).toFixed(1)});
   }
   observer.disconnect();return {cpuThrottle:4,samples,longTasksMs:longTasks,domNodes:document.querySelectorAll('*').length,workers:performance.getEntriesByType('resource').filter(e=>e.name.includes('forecast-worker')).length};
 });
 console.log(JSON.stringify(metrics,null,2));
}finally{await browser.close();}
