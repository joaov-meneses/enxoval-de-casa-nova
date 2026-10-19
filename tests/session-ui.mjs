import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({channel: process.platform === 'win32' ? 'msedge' : 'chromium'});
try {
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  await page.clock.install({time:new Date('2026-10-18T12:00:00Z')});
  let activityRequests = 0;
  let expired = false;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/activity') {
      activityRequests++;
      return route.fulfill(expired ? {status:401,json:{error:'Sessão expirada'}} : {status:204,body:''});
    }
    if (path === '/api/bootstrap') return route.fulfill({json:{user:{id:'user',name:'Cliente',email:'test@example.invalid',isGuest:false,plan:'monthly'},enxovais:[],activeEnxoval:null,items:[],members:[],categories:[]}});
    return route.fulfill({json:{}});
  });
  await page.goto(`${process.env.SESSION_UI_URL ?? 'http://localhost:3000'}/`);
  await page.locator('.cm-header-actions .cm-login').filter({hasText:'Meu lar'}).waitFor();
  await page.waitForFunction(() => document.readyState === 'complete');
  assert.equal(activityRequests,1,'opening the app records activity once');
  await page.clock.fastForward(61000);
  assert.equal(activityRequests,1,'elapsed time alone never renews the session');
  const touched = page.waitForResponse(response => response.url().endsWith('/api/auth/activity'));
  await page.keyboard.press('ArrowDown');
  await touched;
  assert.equal(activityRequests,2,'trusted keyboard interaction records activity');
  await page.keyboard.press('ArrowDown');
  assert.equal(activityRequests,2,'interactions are throttled');
  await page.clock.fastForward(61000);
  expired = true;
  await page.keyboard.press('ArrowDown');
  await page.locator('.cm-header-actions .cm-login').filter({hasText:'Entrar'}).waitFor({timeout:10000});
  console.log('PASS: real interaction refreshes activity, idle time does not, expired session clears signed-in UI.');
} finally { await browser.close(); }
