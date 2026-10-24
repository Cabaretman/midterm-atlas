"""Merge dated, attributed polling extracts. Deduplicate before applying ratings.
Raw source extractions and selection audits are retained; do not ingest averages
or another model's adjusted toplines as if they were independent polls.
"""
import collections,datetime,json,pathlib,re,unicodedata
ROOT=pathlib.Path(__file__).resolve().parent.parent
INPUT=ROOT/'data'/'polling-inputs'
ASOF='2026-10-24'
def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def norm(s):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
grades=read(ROOT/'data'/'pollster-ratings.json')
verified_samples={(p['raceId'],p['end']):p for p in read(ROOT/'data'/'raw'/'polls.json') if 'LV-weighted RV' in p.get('population','')}
byid={str(r['ratingId']):r for r in grades['ratings']};byn={r['name']:r for r in grades['ratings']}
aliases={norm(a):byn[name] for a,name in grades['aliases'].items() if name in byn}
for r in grades['ratings']:
    aliases[norm(r['name'])]=r
    for a in r.get('aliases',[]):aliases[norm(a)]=r
cross=read(INPUT/'pollster-crosswalk.json')
for r in cross['crosswalk']:
    matches=[byid[i] for i in r['ratingIds'] if i in byid]
    if len(matches)==1:aliases[norm(r['pollster'])]=matches[0]
manual={'Marist':'183','Emerson':'88','NYT/Siena':'448','New York Times/Siena':'448','Elon':'86','CBS News/YouGov':'391','Economist/YouGov':'391','YouGov/UMass Amherst':'391','YouGov/UMass Lowell':'391','Beacon Research/Shaw & Company':'103','Fox News':'103'}
manual.update({'CNN/SSRS':'297','Mason-Dixon':'197','The Washington Post / SSPG':'754','The Washington Post/Schar School':'754'})
for a,i in manual.items():
    if i in byid:aliases[norm(a)]=byid[i]
def rating(p):
    clean=re.sub(r'\s*\((?:D|R|I|D/R|R/D)\)\s*','',p['pollster'])
    r=byid.get(str(p.get('pollsterRatingId',''))) or aliases.get(norm(clean))
    if not r:
        # Unambiguous survey-firm + media/university sponsor variants share a family.
        for token,i in [('yougov','391'),('surveyusa','325'),('emersoncollege','88'),('maristuniversity','183')]:
            if token in norm(clean) and i in byid:r=byid[i];break
    for policy in grades['exclusions']:
        if any(norm(a) in norm(clean) for a in policy['aliases']):return {**policy,'name':policy['name']}
    if r:
        return {k:r.get(k) for k in ['ratingId','name','grade','predictivePlusMinus','meanRevertedBias','simpleAverageError','pollCount','status','banned','date','source']}
    return {'name':clean,'grade':None,'status':'unrated','banned':False,'date':grades['ratingDate'],'source':grades['source'],'predictivePlusMinus':None,'meanRevertedBias':None,'pollCount':None,'simpleAverageError':None}
allrows=[];rejected=collections.Counter()
for filename,tier in [('wikipedia.json','wikipedia-transcription'),('pollresults.json','pollresults-mirror'),('silver-national.json','silver-bulletin-download')]:
    raw=read(INPUT/filename);rows=(raw.get('polls',[])+raw.get('excludedLedger',[])) if isinstance(raw,dict) else raw
    for original in rows:
        p=dict(original);p.setdefault('sourceTier',tier)
        try:date=datetime.date.fromisoformat(p['end'])
        except (ValueError,KeyError):rejected['invalid date']+=1;continue
        age=(datetime.date.fromisoformat(ASOF)-date).days
        if age<0 or age>120:rejected['outside 120-day horizon']+=1;continue
        if p.get('start') and (not re.fullmatch(r'\d{4}-\d{2}-\d{2}',p['start']) or p['start']>p['end']):rejected['invalid field date range']+=1;continue
        if not p.get('url','').startswith(('http://','https://')):rejected['missing source URL']+=1;continue
        if p['population'] not in ['LV','RV','A']:rejected['unsupported population']+=1;continue
        p['rating']=rating(p);p['pollsterFamily']=str(p['rating'].get('ratingId') or norm(p['rating']['name']))
        known=verified_samples.get((p['raceId'],p['end'])) if p['pollsterFamily']=='183' else None
        if known:
            p['fullSample']=known['n'];p['n']=None;p['moe']=known.get('moe')
            p['notes']=p.get('notes','')+' Original-release sample audit: reported n is the full RV sample, not a separate effective LV subgroup. Published LV MOE used when available.'
        p['pollsterDisplay']=p['rating']['name']
        # A firm partisan label is distinct from an internal commissioning sponsor.
        tag=re.search(r'\((D|R|I)\)',p['pollster'])
        partisan=p.get('partisan') or (tag.group(1) if tag else None)
        p['partisan']={'DEM':'D','REP':'R','IND':'I','Democratic':'D','Republican':'R'}.get(partisan,partisan)
        if p['partisan'] not in ['D','R','I']:p['partisan']=None
        p['internal']=p.get('internal') is True or str(p.get('internal','')).lower()=='true'
        # Only affirmative source flags establish an internal poll. Notes saying
        # "internal status unknown" are not evidence that a poll is internal.
        p['provenance']=list(dict.fromkeys(p.get('provenance',[])+p.get('originalSourceUrls',[])+[p['url']]+([p['wikipediaUrl']] if p.get('wikipediaUrl') else [])))
        allrows.append(p)
groups=collections.defaultdict(list)
for p in allrows:groups[(p['raceId'],p['pollsterFamily'],p['end'])].append(p)
priority={'silver-bulletin-download':4,'silver-direct':4,'pollresults-mirror':3,'wikipedia-transcription':2}
merged=[];conflicts=[]
for identity,rows in groups.items():
    rows.sort(key=lambda p:({'LV':3,'RV':2,'A':1}[p['population']],priority.get(p['sourceTier'],1),p.get('n') or 0),reverse=True)
    selected=rows[0]
    if not selected['partisan']:
        tags={p['partisan'] for p in rows if p['partisan']}
        if len(tags)==1:selected['partisan']=next(iter(tags))
    selected['internal']=any(p['internal'] for p in rows)
    selected['provenance']=list(dict.fromkeys(url for p in rows for url in p['provenance']))
    selected['sourceTiers']=list(dict.fromkeys(p['sourceTier'] for p in rows))
    different=any(abs((p.get('independent',p.get('dem',0))-p.get('rep',0))-(selected.get('independent',selected.get('dem',0))-selected.get('rep',0)))>1.1 for p in rows if p['population']==selected['population'] and p['raceId']!='approval')
    if different:
        conflicts.append({'raceId':identity[0],'family':identity[1],'end':identity[2],'chosen':selected['id'],'alternatives':[p['id'] for p in rows]})
        selected['notes']=selected.get('notes','')+' Cross-source/question variants disagree; one preferred LV/source record is used, not multiple independent polls.'
    merged.append(selected)
merged.sort(key=lambda p:(p['raceId'],p['end'],p['pollsterFamily']))
for p in merged:
    shares=[p.get('approve',0),p.get('disapprove',0)] if p['raceId']=='approval' else [p.get('independent',p.get('dem',0)),p.get('rep',0),p.get('other',0)]
    if not all(isinstance(x,(int,float)) and 0<=x<=100 for x in shares) or sum(shares)>100.2:raise ValueError('Invalid shares '+p['id'])
used={p['pollsterFamily']:p['rating'] for p in merged}
report={'asOf':ASOF,'rawRowsInHorizon':len(allrows),'uniquePolls':len(merged),'duplicatesRemoved':len(allrows)-len(merged),'rejected':dict(rejected),'countsByOffice':dict(collections.Counter(p['raceId'].split('-')[0] for p in merged)),'coverageByOffice':{office:len({p['raceId'] for p in merged if p['raceId'].startswith(office+'-')}) for office in ['senate','house','governor']},'ratingStatus':dict(collections.Counter(p['rating']['status'] for p in merged)),'crossSourceVariants':conflicts,'sourceNotes':['Silver Bulletin national downloads: raw reported toplines, not publisher-adjusted values.','PollResults is a third-party NYT mirror, not a direct NYT API connection.','Wikipedia numbers are transcriptions of cited releases; links do not imply independent re-extraction.','No paid FLIPR forecast content or NYT access restrictions were bypassed.','Exactly one population/question per race, pollster family and field-end date. LV preferred to RV/adults; source priority breaks ties.']}
(ROOT/'data'/'current-polls.json').write_text(json.dumps(merged,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'data'/'polling-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['crossSourceVariants','sourceNotes']},indent=2))
print('Maine unique polls:',sum(p['raceId']=='senate-ME' for p in merged))
