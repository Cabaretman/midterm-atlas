import {readFileSync,writeFileSync} from 'node:fs';
import {feature} from 'topojson-client';
import {geoPath} from 'd3-geo';
const us=JSON.parse(readFileSync(new URL('../node_modules/us-atlas/states-albers-10m.json',import.meta.url)));
const data=JSON.parse(readFileSync(new URL('../dist/data.json',import.meta.url)));
const geo=feature(us,us.objects.states),path=geoPath();
const map=geo.features.map(f=>({name:f.properties.name,abbr:data.states.find(s=>s.name===f.properties.name)?.abbr,path:path(f),centroid:path.centroid(f)})).filter(f=>f.abbr);
writeFileSync(new URL('../dist/map.json',import.meta.url),JSON.stringify(map));
console.log(`Map: ${map.length} states and DC`);
