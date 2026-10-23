// Persist a reviewed normalized feed into the source snapshot, without credentials.
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validatePoll} from '../dist/model.mjs';
const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1];
try{
 if(!args.includes('--file')&&!args.includes('--url'))throw Error('Usage: node scripts/import-polls.mjs --file polls.json [--as-of YYYY-MM-DD], or --url https://your-normalized-feed');
 const data=JSON.parse(readFileSync('dist/data.json','utf8')),snapshot=JSON.parse(readFileSync('data/snapshot.json','utf8'));
 const asOf=args.includes('--as-of')?option('--as-of'):snapshot.asOf;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf))||asOf<snapshot.asOf)throw Error('as-of must be a valid date on or after the existing snapshot.');
 let content;
 if(args.includes('--url')){const url=new URL(option('--url'));if(url.protocol!=='https:')throw Error('Feed URL must use HTTPS.');const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Feed returned HTTP ${r.status}`);content=await r.text();}else content=readFileSync(option('--file'),'utf8');
 if(Buffer.byteLength(content)>3_000_000)throw Error('Feed exceeds 3 MB.');
 const raw=JSON.parse(content),rows=Array.isArray(raw)?raw:raw.polls;if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw Error('Expected 1–10,000 polling rows.');
 const ids=new Set(data.races.map(r=>r.id));for(const [i,p]of rows.entries()){const errors=validatePoll(p,ids);if(errors.length)throw Error(`Row ${i+1}: ${errors.join(', ')}`);if(p.end>asOf)throw Error(`Row ${i+1}: field date after as-of date`);}
 const imported=JSON.parse(readFileSync('data/imported-polls.json','utf8')),merged=new Map(imported.map(p=>[p.id,p]));for(const p of rows)merged.set(p.id,p);
 const atomic=(file,value)=>{writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');renameSync(file+'.tmp',file);};
 atomic('data/imported-polls.json',[...merged.values()]);atomic('data/snapshot.json',{asOf,version:snapshot.version+1});
 const result=spawnSync('python',['scripts/prepare-data.py'],{stdio:'inherit'});if(result.status!==0)throw Error('Input saved, but dataset rebuild failed. Review source changes.');
 console.log(`Imported ${rows.length} reviewed rows. Run npm test and republish before calling the site updated.`);
}catch(err){console.error(err.message);process.exitCode=1;}
