import {test,expect} from '@playwright/test';
test('forecast controls, all offices, state map, share, data ledger and mobile',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.getByRole('heading',{name:'2026 elections',exact:true})).toBeVisible();await expect(page.locator('#race-rows tr')).toHaveCount(35);
 const baseline=await page.locator('#summary').textContent();await page.locator('#nationalError').fill('8');await expect(page.locator('#scenario-badge')).toContainText('Custom scenario');await expect(page.locator('#summary')).not.toHaveText(baseline);
 await page.locator('#raceError').fill('3');await expect(page.locator('#raceError-value')).toContainText('+3.0');
 await page.getByRole('button',{name:'Reset to baseline'}).click();await expect(page.locator('#scenario-badge')).toContainText('Baseline forecast');
 await page.getByRole('tab',{name:'House'}).click();await expect(page.locator('#race-rows tr')).toHaveCount(50);await page.locator('#load-more').click();await expect(page.locator('#race-rows tr')).toHaveCount(100);await page.getByRole('button',{name:'Districts',exact:true}).click();await expect(page.locator('.tile')).toHaveCount(435);
 await page.locator('#search').fill('NY-17');await expect(page.locator('#race-rows tr')).toHaveCount(1);await page.locator('#race-rows tr').click();await expect(page.locator('.selection-title')).toContainText('NY-17');
 await page.getByRole('tab',{name:'Governors'}).click();await expect(page.locator('#race-rows tr')).toHaveCount(36);await page.locator('[data-state="RI"]').click();await expect(page.locator('#selection')).toContainText('Third-candidate win chance');
 await page.getByRole('button',{name:'Data & sources',exact:true}).click();await expect(page.locator('.poll-card')).toHaveCount(35);await page.locator('#poll-filter').selectOption('house');await expect(page.locator('.poll-card')).toHaveCount(1);
 await page.getByRole('button',{name:'Methodology',exact:true}).click();await expect(page.getByRole('heading',{name:'Methodology',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Forecast',exact:true}).click();await page.setViewportSize({width:390,height:844});await expect(page.locator('.us-map')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1100});await page.getByRole('tab',{name:'Senate'}).click();await page.screenshot({path:'test-results/desktop.png',fullPage:true});expect(errors).toEqual([]);
});
test('save, reload, share and invalid polling import',async({page})=>{
 await page.goto('/');await page.locator('#nationalError').fill('4');await expect(page.locator('#scenario-badge')).toContainText('Custom scenario');
 page.once('dialog',d=>d.accept('Test scenario'));await page.locator('#save-scenario').click();await page.locator('#open-scenarios').click();await expect(page.locator('.saved-item')).toHaveCount(1);await page.locator('#scenario-dialog .icon-button').click();
 await page.context().grantPermissions(['clipboard-write','clipboard-read']);await page.locator('#share-scenario').click();const shared=page.url();expect(shared).toContain('#scenario=');await page.reload();await expect(page.locator('#nationalError')).toHaveValue('4');
 await page.getByRole('button',{name:'Data & sources',exact:true}).click();await page.locator('#import-polls').click();await page.locator('#file-input').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('[{"id":"invalid"}]')});await expect(page.locator('#toast')).toContainText('Row 1');
});
test('slider nodes retain focus, worker coalesces rapid changes, and view switches do not calculate',async({page})=>{
 await page.goto('/');await page.locator('#nationalError').waitFor();await page.getByRole('tab',{name:'House'}).click();await expect(page.locator('#race-rows tr')).toHaveCount(50);
 await page.locator('#stateError').focus();await page.evaluate(()=>{window.originalStateSlider=document.querySelector('#stateError');window.originalRaceSlider=document.querySelector('#raceError');window.originalMapPath=document.querySelector('.us-map path');});
 await page.locator('#stateError').fill('2');await expect(page.locator('.selection-subtitle')).toBeVisible();await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
 expect(await page.evaluate(()=>window.originalStateSlider===document.querySelector('#stateError')&&document.activeElement===window.originalStateSlider&&window.originalMapPath===document.querySelector('.us-map path'))).toBe(true);
 await page.locator('#raceError').focus();await page.locator('#raceError').press('ArrowRight');await expect(page.locator('#raceError-value')).toContainText('+0.5');await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');expect(await page.evaluate(()=>window.originalRaceSlider===document.querySelector('#raceError')&&document.activeElement===window.originalRaceSlider)).toBe(true);
 await page.evaluate(()=>{const el=document.querySelector('#nationalError');for(let i=0;i<30;i++){el.value=(i%15)-7;el.dispatchEvent(new Event('input',{bubbles:true}));}el.value=5;el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(page.locator('#nationalError-value')).toContainText('+5.0');await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
 const paths=await page.locator('.us-map path').count();expect(paths).toBe(51);await page.getByRole('button',{name:'Districts',exact:true}).click();await expect(page.locator('.tile')).toHaveCount(435);await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
 await page.getByRole('tab',{name:'Senate'}).click();await page.getByRole('tab',{name:'Governors'}).click();await page.getByRole('button',{name:'Methodology',exact:true}).click();await expect(page.getByRole('heading',{name:'Methodology',exact:true})).toBeVisible();await page.waitForTimeout(500);await expect(page.getByRole('heading',{name:'Methodology',exact:true})).toBeVisible();
});
test('worker refreshes imported data and restoring the snapshot restores the forecast',async({page})=>{
 await page.goto('/');await page.locator('#raceError').waitFor();
 const original=await page.locator('.detail-metrics strong').first().textContent();
 const poll=await page.evaluate(async()=>{const data=await(await fetch('data.json')).json();return {...data.polls.find(p=>p.raceId==='senate-MI'),dem:20,rep:75};});
 await page.getByRole('button',{name:'Data & sources',exact:true}).click();await page.locator('#import-polls').click();await page.locator('#file-input').setInputFiles({name:'poll.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([poll]))});await expect(page.locator('#toast')).toContainText('imported');
 await page.getByRole('button',{name:'Forecast',exact:true}).click();await expect(page.locator('.detail-metrics strong').first()).not.toHaveText(original);
 await page.getByRole('button',{name:'Data & sources',exact:true}).click();await page.locator('#restore-data').click();await page.getByRole('button',{name:'Forecast',exact:true}).click();await expect(page.locator('.detail-metrics strong').first()).toHaveText(original);
});
test('forecast remains available when a worker cannot load',async({page})=>{
 await page.route('**/forecast-worker.mjs',route=>route.abort());await page.goto('/');await expect(page.getByRole('heading',{name:'2026 elections',exact:true})).toBeVisible();await expect(page.locator('#race-rows tr')).toHaveCount(35);
});
