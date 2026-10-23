import {readFileSync,writeFileSync} from 'node:fs';
import {feature} from 'topojson-client';
import {geoPath} from 'd3-geo';
import {presimplify,simplify} from 'topojson-simplify';
const us=JSON.parse(readFileSync(new URL('../node_modules/us-atlas/states-albers-10m.json',import.meta.url)));
const data=JSON.parse(readFileSync(new URL('../dist/data.json',import.meta.url)));
// Simplify shared arcs once, preserving state borders, for a 975px display map.
// A 0.3px² planar threshold removes invisible coastline detail, not whole states.
const reduced=simplify(presimplify(us),0.3);
const geo=feature(reduced,reduced.objects.states),path=geoPath().digits(1);
const original=feature(us,us.objects.states);
const map=geo.features.map((f,i)=>({name:f.properties.name,abbr:data.states.find(s=>s.name===f.properties.name)?.abbr,path:path(f),centroid:path.centroid(original.features[i])})).filter(f=>f.abbr);
if(map.length!==51||map.some(s=>!s.path||/NaN|Infinity/.test(s.path)))throw Error('Invalid state geometry');
writeFileSync(new URL('../dist/map.json',import.meta.url),JSON.stringify(map));
console.log(`Map: ${map.length} states and DC`);
