import {test,expect} from '@playwright/test';
test('forecast controls, all offices, state map, share, data ledger and mobile',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.getByRole('heading',{name:'Every race. Every possibility.'})).toBeVisible();await expect(page.locator('#race-rows tr')).toHaveCount(35);
 const baseline=await page.locator('#summary').textContent();await page.locator('#nationalError').fill('8');await expect(page.locator('#scenario-badge')).toContainText('CUSTOM SCENARIO');await expect(page.locator('#summary')).not.toHaveText(baseline);
 await page.locator('#raceError').fill('3');await expect(page.locator('#raceError-value')).toContainText('+3.0');
 await page.getByRole('button',{name:'Reset to baseline'}).click();await expect(page.locator('#scenario-badge')).toContainText('BASELINE');
 await page.getByRole('tab',{name:'House'}).click();await expect(page.locator('#race-rows tr')).toHaveCount(435);await page.getByRole('button',{name:'Districts',exact:true}).click();await expect(page.locator('.tile')).toHaveCount(435);
 await page.locator('#search').fill('NY-17');await expect(page.locator('#race-rows tr')).toHaveCount(1);await page.locator('#race-rows tr').click();await expect(page.locator('.selection-title')).toContainText('NY-17');
 await page.getByRole('tab',{name:'Governors'}).click();await expect(page.locator('#race-rows tr')).toHaveCount(36);await page.locator('[data-state="RI"]').click();await expect(page.locator('#selection')).toContainText('Third-candidate win chance');
 await page.getByRole('button',{name:'Data & sources',exact:true}).click();await expect(page.locator('.poll-card')).toHaveCount(35);await page.locator('#poll-filter').selectOption('house');await expect(page.locator('.poll-card')).toHaveCount(1);
 await page.getByRole('button',{name:'Methodology',exact:true}).click();await expect(page.getByRole('heading',{name:'A model you can take apart.'})).toBeVisible();
 await page.getByRole('button',{name:'Forecast',exact:true}).click();await page.setViewportSize({width:390,height:844});await expect(page.locator('.us-map')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1100});await page.getByRole('tab',{name:'Senate'}).click();await page.screenshot({path:'test-results/desktop.png',fullPage:true});expect(errors).toEqual([]);
});
test('save, reload, share and invalid polling import',async({page})=>{
 await page.goto('/');await page.locator('#nationalError').fill('4');await expect(page.locator('#scenario-badge')).toContainText('CUSTOM');
 page.once('dialog',d=>d.accept('Test scenario'));await page.locator('#save-scenario').click();await page.locator('#open-scenarios').click();await expect(page.locator('.saved-item')).toHaveCount(1);await page.locator('#scenario-dialog .icon-button').click();
 await page.context().grantPermissions(['clipboard-write','clipboard-read']);await page.locator('#share-scenario').click();const shared=page.url();expect(shared).toContain('#scenario=');await page.reload();await expect(page.locator('#nationalError')).toHaveValue('4');
 await page.getByRole('button',{name:'Data & sources',exact:true}).click();await page.locator('#import-polls').click();await page.locator('#file-input').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('[{"id":"invalid"}]')});await expect(page.locator('#toast')).toContainText('Row 1');
});
