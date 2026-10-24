"""Fit electoral-history priors. Validation is conditional on realized national vote,
not an ex-ante polling forecast backtest. No current-election results are used.
Python standard library only. All training data and diagnostics are versioned.
"""
import collections,json,math,pathlib,re,unicodedata
ROOT=pathlib.Path(__file__).resolve().parent.parent
H=ROOT/'data'/'history'
def read(name):return json.loads((H/name).read_text(encoding='utf-8-sig'))
def key(name,state):
    name=unicodedata.normalize('NFKD',name).encode('ascii','ignore').decode().lower()
    name=re.sub(r'\b(jr|sr|iii|ii)\b','',name)
    if ',' in name:
        last,first=name.split(',',1);parts=re.findall('[a-z]+',first);lastparts=re.findall('[a-z]+',last)
        return state+':'+(parts[0]+' '+lastparts[-1] if parts and lastparts else name)
    parts=re.findall('[a-z]+',name)
    aliases={'ned':'edward','bob':'robert','bill':'william','mike':'michael','rick':'richard','jim':'james','chuck':'charles','tom':'thomas','sue':'susan','dan':'daniel','jon':'jon'}
    return state+':'+(aliases.get(parts[0],parts[0])+' '+parts[-1] if parts else '')
P=read('presidential-state-margins.json')['states']
N={r['year']:r['margin'] for r in read('national-house-margins.json')['years'] if r['complete']}
def lean(state,year):
    rows=[r for r in P if r['state']==state and r['year']<year]
    return max(rows,key=lambda r:r['year'])['lean'] if rows else None
rows=[]
for r in read('historical-senate-normalized.json')['races']:
    if not r['eligibleBinary'] or r['special']:continue
    rows.append({'year':r['year'],'state':r['state'],'office':'senate','demCandidate':r['dem']['name'],'repCandidate':r['rep']['name'],'margin':r['margin'],'inc':r['incumbencyProxy'],'source':r['sources'][0] if r['sources'] else ''})
for r in read('governor-training-races.json'):
    rows.append({**r,'inc':int(r['demIncumbent'])-int(r['repIncumbent'])})
rows=[r for r in rows if r['year'] in N and lean(r['state'],r['year']) is not None]
for r in rows:
    r['x']=[1,lean(r['state'],r['year']),N[r['year']],r['inc']]
    r['dkey']=key(r['demCandidate'],r['state']);r['rkey']=key(r['repCandidate'],r['state'])
for r in rows:
    previous=[p for p in rows if p['office']==r['office'] and p['year']<r['year']]
    winners={p['dkey'] if p['margin']>0 else p['rkey'] for p in previous}
    # Separate prior officeholding from the advantage of currently holding office.
    r['experience']=int(r['dkey'] in winners or r['inc']>0)-int(r['rkey'] in winners or r['inc']<0)
    r['x'].append(r['experience'])
def solve(matrix,target):
    a=[list(row)+[target[i]] for i,row in enumerate(matrix)];n=len(target)
    for i in range(n):
        pivot=max(range(i,n),key=lambda j:abs(a[j][i]));a[i],a[pivot]=a[pivot],a[i]
        if abs(a[i][i])<1e-10:raise ValueError('Singular model')
        div=a[i][i];a[i]=[v/div for v in a[i]]
        for j in range(n):
            if j!=i:
                scale=a[j][i];a[j]=[v-scale*w for v,w in zip(a[j],a[i])]
    return [row[-1] for row in a]
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def fit(train,year,shrink,quality=True):
    weights=[2**(-(year-r['year'])/10) for r in train]
    q={};beta=[0,1,1,2,2]
    penalty=[1,5,5,10,10];prior=[0,1,1,2,2]
    for _ in range(60 if quality else 1):
        matrix=[[0.0]*5 for _ in range(5)];target=[0.0]*5
        for r,w in zip(train,weights):
            adjusted=r['margin']-q.get(r['dkey'],0)+q.get(r['rkey'],0)
            for i in range(5):
                target[i]+=w*r['x'][i]*adjusted
                for j in range(5):matrix[i][j]+=w*r['x'][i]*r['x'][j]
        for i in range(5):matrix[i][i]+=penalty[i];target[i]+=penalty[i]*prior[i]
        beta=solve(matrix,target)
        if not quality:break
        sums=collections.defaultdict(lambda:[0.,shrink])
        for r,w in zip(train,weights):
            residual=r['margin']-dot(beta,r['x'])
            sums[r['dkey']][0]+=w*(residual+q.get(r['rkey'],0));sums[r['dkey']][1]+=w
            sums[r['rkey']][0]+=w*(-residual+q.get(r['dkey'],0));sums[r['rkey']][1]+=w
        new={k:.5*q.get(k,0)+.5*a/b for k,(a,b) in sums.items()}
        delta=max((abs(new[k]-q.get(k,0)) for k in new),default=0);q=new
        if delta<1e-6:break
    return beta,q
def predict(r,beta,q):return dot(beta,r['x'])+q.get(r['dkey'],0)-q.get(r['rkey'],0)
def stats(errors):
    return {'n':len(errors),'rmse':round(math.sqrt(sum(e*e for e in errors)/len(errors)),4),'mae':round(sum(abs(e) for e in errors)/len(errors),4)} if errors else {'n':0,'rmse':None,'mae':None}
models={};diagnostics={};all_fitted={}
for office in ['senate','governor']:
    rr=[r for r in rows if r['office']==office]
    tuning=[]
    for shrink in [.5,1,2,4,8]:
        errors=[]
        for year in range(2010,2022,2):
            train=[r for r in rr if r['year']<year];test=[r for r in rr if r['year']==year]
            if not train or not test:continue
            b,q=fit(train,year,shrink);errors.extend(predict(r,b,q)-r['margin'] for r in test)
        tuning.append({'shrinkage':shrink,**stats(errors)})
    chosen=min(tuning,key=lambda r:r['rmse'])['shrinkage']
    validation=[];held=[];baseheld=[]
    for year in [2022,2024]:
        train=[r for r in rr if r['year']<year];test=[r for r in rr if r['year']==year]
        b,q=fit(train,year,chosen);bb,_=fit(train,year,chosen,False)
        errs=[predict(r,b,q)-r['margin'] for r in test];baseerrs=[predict(r,bb,{})-r['margin'] for r in test]
        held.extend(errs);baseheld.extend(baseerrs)
        validation.append({'year':year,'candidateModel':stats(errs),'withoutCandidateEffects':stats(baseerrs),'predictions':[{'state':r['state'],'predicted':round(predict(r,b,q),3),'actual':round(r['margin'],3),'trainingLatestYear':max(t['year'] for t in train)} for r in test]})
    b,q=fit(rr,2026,chosen)
    # Historical prediction residual is retained as uncertainty rather than fitted away.
    rmse=max(8,stats(held)['rmse'] or 12)
    models[office]={'coefficients':dict(zip(['intercept','lean','national','incumbency','experience'],[round(v,6) for v in b])),'priorSigma':rmse,'shrinkage':chosen,'candidateHalfLife':10,'trainingN':len(rr),'trainingThrough':2024,'validation':stats(held),'validationWithoutCandidateEffects':stats(baseheld)}
    diagnostics[office]={'tuning2010Through2020':tuning,'heldOutCycles':validation,'candidateModel':stats(held),'withoutCandidateEffects':stats(baseheld)}
    all_fitted[office]=(b,q,rr,chosen)
def profile(name,state,office):
    if not name:return None
    b,q,rr,shrink=all_fitted[office];k=key(name,state)
    history=[]
    for r in rr:
        if k not in [r['dkey'],r['rkey']]:continue
        sign=1 if k==r['dkey'] else -1
        history.append({'year':r['year'],'office':office,'candidate':name,'margin':round(r['margin']*sign,3),'genericExpectedMargin':round(dot(b,r['x'])*sign,3),'residual':round((r['margin']-dot(b,r['x']))*sign,3),'source':r['source'],'recencyWeight':round(2**(-(2026-r['year'])/10),4),'incumbencyInBaseline':r['inc']*sign!=0})
    return {'name':name,'effect':round(q.get(k,0),4),'history':history,'pastWinner':any(h['margin']>0 for h in history),'status':'historical estimate' if history else 'no comparable history','effectiveRaces':round(sum(h['recencyWeight'] for h in history),3)}
profiles={}
roster=read('senate-roster-v2.json')['roster']
for r in roster:
    d=profile(r.get('demCandidate'),r['state'],'senate');rep=profile(r.get('repCandidate'),r['state'],'senate')
    profiles[r['raceId']]={'dem':d,'rep':rep,'transfer':None,'source':r['source'],'verification':r['verification']}
# Cross-office evidence is explicitly weaker; never duplicate the 2022 special/general.
transferfile=H/'candidate-transfer-house.json'
if transferfile.exists():
    transfer=json.loads(transferfile.read_text(encoding='utf-8-sig'));transfer=transfer.get('races',transfer) if isinstance(transfer,dict) else transfer
    evidence=[]
    for r in transfer:
        if 'peltola' not in r.get('demCandidate','').lower() or r.get('special') or r['year'] not in N:continue
        inc=2*int(r.get('demIncumbent',False))-2*int(r.get('repIncumbent',False))
        expected=lean('AK',r['year'])+N[r['year']]+inc
        evidence.append({'year':r['year'],'office':'house','candidate':'Mary Peltola','margin':r['margin'],'genericExpectedMargin':expected,'residual':r['margin']-expected,'source':r['source'],'recencyWeight':2**(-(2026-r['year'])/10),'incumbencyInBaseline':bool(inc)})
    weight=sum(e['recencyWeight'] for e in evidence)
    value=sum(e['recencyWeight']*e['residual'] for e in evidence)/(weight+2)*.5 if weight else 0
    if evidence:
        profiles['senate-AK']['dem']={'name':'Mary Peltola','effect':round(value,4),'history':evidence,'pastWinner':any(h['margin']>0 for h in evidence),'status':'cross-office historical estimate','effectiveRaces':weight,'transferFactor':.5,'transferNote':'House-to-Senate transfer is an explicit 50% shrinkage assumption, not fitted from enough comparable transitions.'}
        profiles['senate-AK']['transfer']=True
govroster=read('governors.json')
for r in govroster:
    profiles['governor-'+r['state']]={'dem':profile(r['dem'],r['state'],'governor'),'rep':profile(r['rep'],r['state'],'governor'),'source':r['source'],'verification':'NGA roster; inspect current-matchup fields before using polls'}
output={'version':2,'fittedThrough':2024,'fittingMethod':'Recency-weighted ridge regression with partially pooled candidate intercepts; separate Senate/governor fits. Candidate residuals reflect opponents and turnout too, not identified personal causal effects.','nationalEnvironment':'Current generic ballot margin. Approval shown as context; a hypothetical approval change adjusts the scenario environment only, without counting baseline approval twice.','validationCaveat':'Forward-year conditional diagnostics use realized national House popular vote, which was not known in advance. This is not an end-to-end ex-ante forecast backtest or calibration of win probabilities. Shrinkage selected on 2010–2020 only; 2022/2024 are held-out cycles.','models':models,'profiles':profiles}
(ROOT/'data'/'fundamentals-fit.json').write_text(json.dumps(output,indent=2),encoding='utf-8')
(ROOT/'data'/'validation.json').write_text(json.dumps({'caveat':output['validationCaveat'],'offices':diagnostics},indent=2),encoding='utf-8')
print(json.dumps({'models':models,'examples':{k:{p:v['effect'] if v else 0 for p,v in profiles[k].items() if p in ['dem','rep']} for k in ['senate-ME','senate-OH','senate-AK','governor-VT']}},indent=2))
