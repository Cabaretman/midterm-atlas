import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'*.spec.mjs',workers:1,use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:1100}},webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:true},reporter:'list'});
