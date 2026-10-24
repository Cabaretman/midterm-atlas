"""Build the audited input snapshot; source files remain versioned under data/raw."""
import csv,json,pathlib,collections
root=pathlib.Path(__file__).resolve().parent.parent
raw=root/'data'/'raw'
rows=list(csv.DictReader((raw/'president-2024.csv').open(encoding='utf-8-sig')))
tot=collections.defaultdict(lambda:[0,0,0])
for r in rows:
    for i,k in enumerate(['votes_dem','votes_gop','total_votes']):tot[r['state_name']][i]+=int(r[k])
names='AL Alabama|AK Alaska|AZ Arizona|AR Arkansas|CA California|CO Colorado|CT Connecticut|DE Delaware|DC District of Columbia|FL Florida|GA Georgia|HI Hawaii|ID Idaho|IL Illinois|IN Indiana|IA Iowa|KS Kansas|KY Kentucky|LA Louisiana|ME Maine|MD Maryland|MA Massachusetts|MI Michigan|MN Minnesota|MS Mississippi|MO Missouri|MT Montana|NE Nebraska|NV Nevada|NH New Hampshire|NJ New Jersey|NM New Mexico|NY New York|NC North Carolina|ND North Dakota|OH Ohio|OK Oklahoma|OR Oregon|PA Pennsylvania|RI Rhode Island|SC South Carolina|SD South Dakota|TN Tennessee|TX Texas|UT Utah|VT Vermont|VA Virginia|WA Washington|WV West Virginia|WI Wisconsin|WY Wyoming'
national=sum(v[0]-v[1] for v in tot.values())/sum(v[2] for v in tot.values())*100
states=[]
for entry in names.split('|'):
    abbr,name=entry.split(' ',1);d,r,t=tot[name]
    states.append({'abbr':abbr,'name':name,'presMargin':round((d-r)/t*100,3),'lean':round((d-r)/t*100-national,3)})
lookup={s['abbr']:s for s in states}
senateR='AL AK AR FL ID IA KS KY LA ME MS MT NE NC OH OK SC SD TN TX WV WY'.split()
senateD='CO DE GA IL MA MI MN NH NJ NM OR RI VA'.split()
openSeats=set('AL IL IA KY MI MN NH NC WY'.split())
races=[]
for state in sorted(senateR+senateD):
    races.append({'id':'senate-'+state,'state':state,'name':lookup[state]['name'],'office':'senate','incumbentParty':'R' if state in senateR else 'D','incumbentRunning':state not in openSeats,'lean':lookup[state]['lean'],'independent':state in ['NE','MT','SD'],'note':'Independent versus Republican; partisan lean is only a proxy for independent support. No automatic Democratic caucus assignment.' if state in ['NE','MT','SD'] else '', 'special':state in ['FL','OH']})
for g in json.loads((raw/'governors.json').read_text(encoding='utf-8-sig')):
    races.append({'id':'governor-'+g['state'],'state':g['state'],'name':g['name'],'office':'governor','incumbentParty':g['party'],'incumbentRunning':g['seeking'],'lean':lookup[g['state']]['lean'],'note':g.get('note',''),'demCandidate':g['dem'],'repCandidate':g['rep']})
for h in json.loads((raw/'house-baselines.json').read_text(encoding='utf-8-sig')):
    races.append({'id':'house-'+h['id'],'state':h['state'],'name':h['id'],'office':'house','incumbentParty':h['party'],'incumbentRunning':False,'lean':round(h['pres2024']-national,3),'referenceIncumbent':h['incumbent'],'note':'Incumbent status unverified; no incumbency bonus applied. Historical presidential margin on 2026 district lines; rounded to whole points.'})
polls=json.loads((raw/'polls.json').read_text(encoding='utf-8-sig'))
for p in polls:
    p['id']=p['id']+'-'+p['raceId']
    if p['population']=='LV-weighted RV sample':
        p['fullSample']=p['n'];p['n']=None;p['population']='LV'
    if 'Emerson' in p['pollster']:p['pollster']='Emerson'
    if 'LV' in p['population']:p['population']='LV'
for p in json.loads((raw/'gov-house-polls.json').read_text(encoding='utf-8-sig')):
    p={'id':'emerson-'+p['raceId']+'-'+p['end'],'raceId':p['raceId'],'pollster':'Emerson','start':p['start'],'end':p['end'],'n':p['n'],'population':p['population'],'dem':p['d'],'rep':p['r'],'other':p.get('i',0),'url':p['url'],'notes':('Independent '+p['independent']+' is explicitly modeled as a third candidate. ' if p.get('i') else '')+'Original pollster release; raw shares before normalization.'}
    if not any(q['raceId']==p['raceId'] and q['pollster']==p['pollster'] and q['end']==p['end'] for q in polls):polls.append(p)
polls.append({'id':'yougov-ne-2026-10-03','raceId':'senate-NE','pollster':'YouGov','start':'2026-09-24','end':'2026-10-03','n':1809,'population':'LV','moe':3.3,'independent':48,'rep':47,'url':'https://d3nkl3psvxxpe9.cloudfront.net/documents/ttw_ne_20260921_lv.pdf','notes':'Dan Osborn is independent; positive margin denotes I over R. Not a Democratic candidate.'})
snapshot=json.loads((root/'data'/'snapshot.json').read_text())
current=root/'data'/'current-polls.json'
if current.exists():polls=json.loads(current.read_text(encoding='utf-8'))
imported=json.loads((root/'data'/'imported-polls.json').read_text())
merged={p['id']:p for p in polls}
for p in imported:merged[p['id']]=p
polls=list(merged.values())
by_source={}
for p in polls:by_source[(p['raceId'],p.get('pollsterFamily') or p['pollster'].lower().split('/')[0].strip(),p['end'])]=p
polls=list(by_source.values())
assert len(races)==506
assert len({p['id'] for p in polls})==len(polls)
data={'asOf':snapshot['asOf'],'electionDate':'2026-11-03','version':snapshot['version'],'national2024Margin':round(national,4),'states':states,'races':races,'polls':polls,'sources':[{'name':'House baselines · The Downballot','url':'https://www.the-downballot.com/p/the-downballots-calculations-of-presidential','note':'2024 presidential results recalculated on 2026 district lines, rounded to whole points. Incumbents are reference officeholders, not verified nominees.'},{'name':'State baselines · Tony McGovern','url':'https://github.com/tonmcg/US_County_Level_Election_Results_08-24','note':'State presidential margins aggregated from the 2024 county-level compilation of official returns.'},{'name':'Governor roster · NGA','url':'https://www.nga.org/governors/elections/','note':'36 state elections. Territories are outside scope. Some nominee fields may lag changes.'},{'name':'Senate election classes · US Senate','url':'https://www.senate.gov/senators/Class_II.htm','note':'33 regular Class II seats plus Florida and Ohio specials; 34 Democratic-caucus and 31 Republican holdovers.'}]}
fitfile=root/'data'/'fundamentals-fit.json'
if fitfile.exists():
    fit=json.loads(fitfile.read_text(encoding='utf-8'));profiles=fit.pop('profiles');data['fundamentals']=fit
    roster={r['raceId']:r for r in json.loads((root/'data'/'history'/'senate-roster-v2.json').read_text(encoding='utf-8'))['roster']}
    for race in races:
        race['candidateHistory']=profiles.get(race['id'])
        if race['id'] in roster:
            r=roster[race['id']]
            for field in ['demCandidate','repCandidate','independentCandidate','incumbentParty','incumbentRunning']:race[field]=r.get(field)
            race['independent']=bool(r.get('independentCandidate'))
            race['note']=r.get('notes','')
            race['rosterSource']=r['source'];race['rosterVerification']=r['verification']
    data['sources']+=[{'name':'Silver Bulletin · pollster grades and national polling','url':'https://www.natesilver.net/p/pollster-ratings-silver-bulletin','note':'January 14, 2026 letter grades, predictive plus-minus and mean-reverted D−R bias. Unrated is explicit; published exclusions are honored. National polls use raw public downloads, not adjusted averages.'},{'name':'FLIPR · public methodology and polling','url':'https://www.natesilver.net/p/flipr-midterms-model-methodology','note':'Public methodology and national polling downloads checked; no paid race forecasts imported and this model is not FLIPR.'},{'name':'NYT polling via PollResults.org','url':'https://pollresults.org/api/','note':'Third-party API mirror attributed to the NYT polling tracker, with original release links. Direct NYT access was unavailable; this is not a direct NYT API integration. Mirror attribution: CC BY 4.0.'},{'name':'Wikipedia · current race polling tables','url':'https://en.wikipedia.org/wiki/2026_United_States_Senate_elections','note':'Current general-election matchups transcribed from race tables, retaining original cited release URLs. Primary, obsolete hypothetical and aggregate-average rows excluded.'},{'name':'Historical election results · FiveThirtyEight / MEDSL','url':'https://github.com/fivethirtyeight/election-results','note':'Candidate-aligned historical Senate/governor results and original state sources; presidential leans from MEDSL. Candidate-history effects are partially pooled, not added to current polling twice.'}]
source_notes={
    'https://www.the-downballot.com/p/the-downballots-calculations-of-presidential':'2024 presidential results recalculated on 2026 district lines; margins rounded to whole points. Incumbent fields are reference names, not verified nominees.',
    'https://github.com/tonmcg/US_County_Level_Election_Results_08-24':'2024 state presidential margins aggregated from county returns.',
    'https://www.nga.org/governors/elections/':'Governor roster and election schedule for 36 states.',
    'https://www.senate.gov/senators/Class_II.htm':'33 regular Class II seats plus Florida and Ohio specials; 34 Democratic-caucus and 31 Republican holdovers.',
    'https://www.natesilver.net/p/pollster-ratings-silver-bulletin':'January 14, 2026 pollster grades, predictive plus-minus, mean-reverted bias, aliases and national poll downloads.',
    'https://www.natesilver.net/p/flipr-midterms-model-methodology':'Public FLIPR methodology reference.',
    'https://pollresults.org/api/':'PollResults.org records attributed to the NYT polling tracker; original release links are retained.',
    'https://en.wikipedia.org/wiki/2026_United_States_Senate_elections':'Current general-election matchups transcribed from cited race tables.',
    'https://github.com/fivethirtyeight/election-results':'Historical Senate and governor results; presidential lean from MEDSL.'
}
for source in data['sources']:
    if source['url'] in source_notes:source['note']=source_notes[source['url']]
auditfile=root/'data'/'polling-audit.json'
if auditfile.exists():
    audit=json.loads(auditfile.read_text());data['pollingAudit']={k:v for k,v in audit.items() if k!='crossSourceVariants'}
    data['pollingAudit']['sourceNotes']=['Silver Bulletin national polls use reported toplines.','PollResults.org records link to NYT tracker entries and original releases.','Wikipedia poll rows are transcribed from cited releases.','Polls are deduplicated by pollster family, race and field-end date; likely-voter samples are preferred.']
data['pollsterRatings']=list({p['pollsterFamily']:p['rating'] for p in polls if p.get('rating')}.values())
(root/'dist'/'data.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(races)} races, {len(polls)} sourced polling rows, national 2024 margin {national:.3f}')
