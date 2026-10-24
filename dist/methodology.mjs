// Native MathML keeps formulas selectable, accessible and independent of a CDN.
const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tag=(name,body)=>`<${name}>${body}</${name}>`;
const row=(...parts)=>tag('mrow',parts.join(''));
const number=value=>tag('mn',String(value));
const indexNode=index=>/^\d+$/.test(index)?tag('mn',index):index.includes(',')?tag('mrow',index.split(',').map(part=>tag('mi',part)).join(tag('mo',','))):index.length===1?tag('mi',index):tag('mtext',index);
const symbol=(name,index)=>index===undefined?tag('mi',name):tag('msub',tag('mi',name)+indexNode(index));
const operator=value=>tag('mo',value);
const text=value=>tag('mtext',value);
const fraction=(a,b)=>tag('mfrac',row(a)+row(b));
const power=(a,b)=>tag('msup',row(a)+row(b));
const square=a=>power(a,number(2));
const root=a=>tag('msqrt',row(a));
const parentheses=(...parts)=>row(operator('('),...parts,operator(')'));
const sum=index=>tag('munder',operator('&sum;')+row(index));
const math=(body,label,display='inline')=>`<math xmlns="http://www.w3.org/1998/Math/MathML" display="${display}" aria-label="${escapeText(label)}">${body}</math>`;
const equations=(label,...bodies)=>`<figure class="method-math" aria-label="${escapeText(label)}">${bodies.map(body=>math(body,label,'block')).join('')}</figure>`;
const add=operator('+'),minus=operator('&minus;'),equals=operator('='),times=operator('&times;');
const mu=symbol('&mu;'),prior=symbol('&mu;','0'),average=symbol('A'),strength=symbol('S'),blend=symbol('w');
const priorVariance=symbol('V','0'),pollVariance=symbol('V','p');
const sigma=index=>symbol('&sigma;',index);
const q=symbol('q','i'),base=symbol('b','i'),effective=symbol('u','i'),pollMargin=symbol('y','i');
const sigmaRaceSquared=row(square(sigma('r')),equals,square(sigma('floor')),add,square(parentheses(number(1),minus,blend)),priorVariance,add,fraction(row(square(blend),number(25)),strength));

export function renderMethodology(data){
  const models=data.fundamentals?.models??{},senate=models.senate,governor=models.governor;
  const format=value=>Number.isFinite(value)?value.toFixed(2):'unavailable';
  const coefficientMath=model=>{
    const c=model?.coefficients;
    if(!c)return '<p>Fitted coefficients are unavailable.</p>';
    return math(row(
      symbol('&beta;','0'),equals,number(c.intercept.toFixed(3)),operator(','),
      symbol('&beta;','L'),equals,number(c.lean.toFixed(3)),operator(','),
      symbol('&beta;','E'),equals,number(c.national.toFixed(3)),operator(','),
      symbol('&beta;','I'),equals,number(c.incumbency.toFixed(3)),operator(','),
      symbol('&beta;','X'),equals,number(c.experience.toFixed(3))
    ),'Fitted coefficients: intercept, presidential lean, national environment, incumbency and prior winning experience','block');
  };

  return `<article class="page-content method-prose">
  <h1>Methodology</h1>
  <p>The model first estimates each race’s vote margin, then allows for errors around that estimate. It combines a polling average with a <em>prior</em>: an estimate based on political and electoral history. It then simulates 4,000 possible elections. A candidate’s win probability is the fraction of those elections they win.</p>
  <p>Margins are measured in percentage points. D+4 means the Democratic candidate leads the Republican by four points. In independent Senate races, the margin compares the independent candidate with the Republican. A vote margin and a win probability describe different quantities: the margin measures the expected lead; the probability measures how often that lead survives the modeled uncertainty.</p>

  <p>The polling dataset contains ${data.polls.length.toLocaleString()} records across race polls, generic-ballot polls and presidential approval. Sources include Silver Bulletin, PollResults.org, Wikipedia race tables and cited poll releases. The race model uses current general-election matchups. Duplicate pollster-family, race and field-end records are consolidated, preferring likely-voter samples.</p>
  <p>The poll average weights each bias-adjusted margin ${math(pollMargin,'y sub i, the adjusted margin in poll i')} by its effective weight ${math(effective,'u sub i, its final effective weight')}:</p>
  ${equations('Weighted polling average',row(average,equals,fraction(row(sum(symbol('i')),effective,pollMargin),row(sum(symbol('i')),effective))))}
  <p>For example, a D+4 poll with weight 1 and an R+2 poll with weight 0.5 give a D+2 average: (4 − 1) / 1.5 = 2. The lower-weight poll still matters, but contributes half as much as the other poll.</p>

  <p>Weights reflect recency, sample size, respondent population, pollster accuracy and sponsorship. A poll’s base weight ${math(base,'b sub i')} combines its age in days ${math(symbol('d','i'),'d sub i')}, sample factor ${math(symbol('s','i'),'s sub i')} and population factor ${math(symbol('p','i'),'p sub i')}. Its final weight ${math(q,'q sub i')} also includes accuracy ${math(symbol('a','i'),'a sub i')}, partisan-sponsor ${math(symbol('h','i'),'h sub i')} and internal-poll ${math(symbol('t','i'),'t sub i')} factors.</p>
  ${equations('Individual poll weighting',
    row(base,equals,power(number(2),fraction(row(minus,symbol('d','i')),number(14))),symbol('s','i'),symbol('p','i')),
    row(q,equals,base,symbol('a','i'),symbol('h','i'),symbol('t','i')),
    row(symbol('s','i'),equals,root(fraction(row(text('min'),parentheses(symbol('n','i'),operator(','),number(1500))),number(800))))
  )}
  <p>The 14-day half-life makes a two-week-old poll count half as much as an otherwise identical new poll. Age is measured at the dataset cutoff; polls older than 120 days are excluded. In the sample formula, ${math(symbol('n','i'),'n sub i')} is the respondent count. The square root gives larger samples more influence, with diminishing returns; sample size is capped at 1,500 because sampling error is only one source of polling error. If sample size is missing, the factor is the smaller of 1.5 and 3 divided by the reported margin of error; if both are missing, it is 0.7. Likely-voter, registered-voter and adult samples receive population factors of 1.00, 0.85 and 0.60, reflecting how closely they approximate the voting electorate.</p>
  <p>The accuracy factor uses Silver Bulletin’s predictive plus-minus rating, denoted ${math(symbol('r','i'),'r sub i')}; lower ratings indicate better historical performance. The formula below is bounded between 0.25 and 2.00. Unrated pollsters receive 0.65. These bounds prevent the rating from eliminating a poll’s influence or letting one pollster dominate.</p>
  ${equations('Pollster accuracy factor',row(symbol('a','i'),equals,text('clip'),parentheses(
    square(fraction(number(4),row(text('max'),parentheses(number(2),operator(','),number(4),add,symbol('r','i'))))),operator(','),number(0.25),operator(','),number(2)
  )))}
  <p>Source-flagged partisan polls receive a 0.50 multiplier by default. Campaign/internal polls are excluded by default; enabling them gives them a 0.25 multiplier, in addition to any partisan discount. These discounts address sponsor and publication-selection incentives. Other polls have a factor of 1 for each category. Banned and methodology-excluded polls receive zero weight. When bias correction is enabled, published mean-reverted D−R bias is subtracted from D−R polls: a historical D+1 bias changes a reported D+4 to D+3. That correction is not applied to approval or independent-versus-Republican polls.</p>

  <p>A firm that publishes many polls should not overwhelm several independent firms. For pollster family ${math(symbol('f'),'f')}, the model totals the included base weights as ${math(symbol('B','f'),'B sub f')}. If that total exceeds 1, it scales down all of that family’s poll weights proportionally. This preserves the relative influence of its polls and retains accuracy and sponsorship discounts.</p>
  ${equations('Pollster-family cap and effective evidence',
    row(symbol('B','f'),equals,sum(row(symbol('i'),operator('&isin;'),symbol('f'))),base),
    row(effective,equals,q,fraction(row(text('min'),parentheses(number(1),operator(','),symbol('B','f'))),symbol('B','f'))),
    row(strength,equals,symbol('&lambda;','p'),sum(symbol('i')),effective)
  )}
  <p>The result is the effective weight ${math(effective,'u sub i')} used in the polling average. Total polling evidence ${math(strength,'S')} is the sum of those weights multiplied by the polling-influence setting ${math(symbol('&lambda;','p'),'lambda sub p')}; a 100% setting means a multiplier of 1. This evidence measure is a weighted total, rather than a raw poll count.</p>

  <p>The prior estimates a race before its own polls are considered. Presidential lean ${math(symbol('L'),'L')} measures the state or district’s partisan baseline relative to the country. The national environment ${math(symbol('E'),'E')} starts with the weighted generic-ballot margin: the national preference for Democratic versus Republican House candidates. Republican presidential approval enters only when a scenario changes it. Each approval point above the observed polling average lowers the Democratic environment by 0.3 points; a point below raises it by 0.3. This avoids counting the baseline approval environment twice.</p>
  <p>Senate and governor priors use separate historical regressions. Their coefficients measure how presidential lean and the national environment translate into the race margin. Incumbency ${math(symbol('I'),'I')} and candidate strength ${math(symbol('C'),'C')} supply the remaining adjustments.</p>
  ${equations('Fundamentals prior',row(prior,equals,symbol('&beta;','0'),add,symbol('&beta;','L'),symbol('L'),add,symbol('&beta;','E'),symbol('E'),add,symbol('I'),add,symbol('C')))}
  <p>The historical fit uses election results through ${escapeText(data.fundamentals?.fittedThrough??2024)} and gives older elections less weight, with a 10-year half-life. Penalized fitting pulls the intercept toward 0, the lean and environment coefficients toward 1, and the incumbency and prior-winner coefficients toward 2. These reference values stabilize estimates from a limited number of elections. Candidate effects are estimated alongside the regression and shrunk toward zero when their historical evidence is weak.</p>
  <p>An incumbent indicator ${math(symbol('J'),'J')} is +1 for a running Democratic incumbent, −1 for a running Republican incumbent and 0 otherwise. In Senate and governor races, the fitted incumbency coefficient is multiplied by that indicator and the incumbency-scale setting ${math(symbol('&lambda;','I'),'lambda sub I')}; 1× is the default. The candidate adjustment combines the candidates’ historical effects ${math(symbol('c','D'),'c sub D')} and ${math(symbol('c','R'),'c sub R')} with their prior-winning experience ${math(symbol('x','D'),'x sub D')} and ${math(symbol('x','R'),'x sub R')}. The candidate-influence setting ${math(symbol('&lambda;','c'),'lambda sub c')} defaults to 1.</p>
  ${equations('Incumbency and candidate adjustments',
    row(symbol('I'),equals,symbol('&lambda;','I'),symbol('&beta;','I'),symbol('J')),
    row(symbol('C'),equals,symbol('&lambda;','c'),parentheses(symbol('c','D'),minus,symbol('c','R'),add,symbol('&beta;','X'),parentheses(symbol('x','D'),minus,symbol('x','R'))))
  )}
  <p>A historical candidate effect is performance above or below what the other predictors would imply. It can capture an unusually strong candidate, but also reflects past opponents and turnout. Effects follow the candidate, so a retiring incumbent’s effect does not pass to a successor. Cross-office evidence is discounted: Mary Peltola’s House record enters her Senate prior at half strength, with extra uncertainty.</p>
  <details class="method-details"><summary>Fitted regression coefficients</summary><p>In order: intercept, presidential lean, national environment, incumbency and prior-winning experience. Values below are rounded to three decimal places.</p><p>Senate</p>${coefficientMath(senate)}<p>Governors</p>${coefficientMath(governor)}<p>Prior-winning experience is 1 for a candidate with qualifying previous wins and 0 otherwise; transferred experience receives the same office-transfer discount.</p></details>
  <p>The House prior is simpler: district presidential lean plus the national environment, with a default 2-point adjustment toward the incumbent party if its incumbent is running. The incumbency setting scales that adjustment. Verified House candidate histories are incomplete, so district-specific candidate effects are currently absent. The House incumbency amount is an assumption. Fundraising, scandals and economic indicators are not included.</p>

  <p>Next, the model blends the prior ${math(prior,'mu zero')} and race polling average ${math(average,'A')}. Their estimated error variances, ${math(priorVariance,'V zero')} and ${math(pollVariance,'V p')}, determine the polling share ${math(blend,'w')}. Variance is uncertainty measured in squared percentage points. A less certain prior gives polls more influence; a less certain polling average gives the prior more influence.</p>
  ${equations('Poll and prior blend',
    row(pollVariance,equals,number(9),add,fraction(number(25),strength)),
    row(blend,equals,fraction(priorVariance,row(priorVariance,add,pollVariance))),
    row(mu,equals,parentheses(number(1),minus,blend),prior,add,blend,average,add,symbol('&delta;'))
  )}
  <p>The prior variance starts with the squared historical error scale: ${format(senate?.priorSigma)} points for Senate, ${format(governor?.priorSigma)} for governors, and an assumed 12 for House. Independent-candidate races add 36 squared percentage points and cross-office transfers add 16. Poll variance falls as effective evidence increases, but retains a floor of 9 squared percentage points, equivalent to a 3-point standard deviation. The constants 9 and 25 are modeling assumptions. They prevent large poll volumes from implying near-perfect precision.</p>
  <p>The direct scenario adjustment ${math(symbol('&delta;'),'delta')} adds the national, state and race-specific polling-error shifts after the blend. Generic-ballot, approval, incumbency and candidate controls instead change the prior. Heavily polled races therefore respond less to those prior changes. With no qualifying polls or zero polling influence, the polling share is set to 0 and the forecast uses the prior plus direct adjustments.</p>

  <p>A projected margin does not determine the win probability by itself. The model also needs an uncertainty distribution. Its race-specific variance combines a local error floor, the uncertainty remaining in the prior, and the polling uncertainty remaining in the blend:</p>
  ${equations('Race-specific uncertainty',sigmaRaceSquared)}
  <p>The default local floor ${math(sigma('floor'),'sigma floor')} is 3 points. If there are no qualifying polls, the final polling term is zero. The model then adds national and state errors, with default standard deviations of 2.5 and 1.5 points. Each simulation draws these errors from normal distributions centered at zero. A draw labeled ${math(symbol('Z'),'Z')} has a standard deviation of 1; multiplying it by ${math(sigma(),'sigma')} sets the error scale.</p>
  ${equations('Simulated race margin',row(
    symbol('M','j'),equals,mu,add,sigma('N'),symbol('Z','N,j'),add,sigma('S'),symbol('Z','s,j'),add,sigma('r'),symbol('Z','r,j')
  ))}
  <p>In simulation ${math(symbol('j'),'j')}, every race shares the same national draw. Races in the same state also share a state draw; each race gets its own local draw. This allows a polling miss to move many races together. Treating every race as independent would understate the chance of a broad sweep by one party.</p>
  <p>For a two-candidate race, a positive simulated margin means the Democratic candidate wins, or the independent candidate in an I−R race. The website counts those wins across 4,000 simulations:</p>
  ${equations('Displayed win-probability estimate',row(
    symbol('p','win'),equals,fraction(row(tag('munderover',operator('&sum;')+row(symbol('j'),equals,number(1))+number(4000)),symbol('𝟙'),parentheses(symbol('M','j'),operator('&gt;'),number(0))),number(4000))
  ))}
  <p>The indicator ${math(symbol('𝟙'),'indicator')} contributes 1 for a win and 0 for a loss. For example, 3,000 wins in 4,000 simulations produce a 75% win probability. The random draws use a fixed seed so ordinary scenario comparisons are not obscured by fresh simulation noise.</p>
  <p>For an individual two-candidate race, the same normal model has the following marginal probability. Here ${math(symbol('&Phi;'),'Phi')} is the standard normal cumulative distribution: the fraction of the distribution below the supplied value.</p>
  ${equations('Underlying two-candidate probability',row(
    symbol('P'),parentheses(symbol('M'),operator('&gt;'),number(0)),equals,symbol('&Phi;'),parentheses(fraction(mu,root(row(square(sigma('N')),add,square(sigma('S')),add,square(sigma('r'))))))
  ))}
  <p>As an illustrative calculation, take a D+2 prior, a D+4 polling average, prior standard deviation of 8 points and effective poll weight of 3. Poll variance is 17.33, the polling share is 0.787, and the blended margin is D+3.57. Using the default error settings gives a total standard deviation of about 5.06 points. The normal-model win probability is about 76%; the displayed 4,000-draw estimate approximates it. A lead of the same size with greater uncertainty would produce a probability closer to 50%.</p>

  <p>Where the weighted third-candidate polling share reaches 10%, the model normalizes the three candidates’ shares, blends the leading pair’s margin with the prior, and separately varies third-candidate support with a 3-point standard deviation, bounded between 0% and 100%. That candidate wins a draw only by exceeding both opponents’ shares. Those wins are counted separately. This is a plurality approximation; ranked-choice transfers and Louisiana runoffs are not modeled.</p>
  <p>Seat counts come from adding the race winners within each simulated election, including seats not up for election. House control requires 218 seats. Senate control requires 51 Democratic-caucus seats or 50 Republican seats because Republicans hold the vice-presidential tiebreak. Independents are counted separately unless the scenario assigns them to the Democratic caucus. Chamber odds are the fraction of simulations meeting the control threshold; expected seats are the average seat count across simulations.</p>

  <p>The prior’s historical checks use 2022 and 2024 holdouts, with each election predicted using earlier results. Senate margin root mean squared error, which penalizes large misses, is ${format(senate?.validation?.rmse)} points with candidate effects and ${format(senate?.validationWithoutCandidateEffects?.rmse)} without them (${senate?.validation?.n??0} races). Governor errors are ${format(governor?.validation?.rmse)} and ${format(governor?.validationWithoutCandidateEffects?.rmse)} points (${governor?.validation?.n??0} races). Candidate effects improve the governor diagnostic and worsen the Senate diagnostic in these holdouts.</p>
  <p>These checks supply the realized national House vote, which was unknown before election day, to isolate race-level prior error. They do not validate the full polling forecast or calibrate its probabilities. The polling discounts, approval sensitivity, variance constants and simulation error defaults remain explicit modeling assumptions. The controls let a reader examine how those assumptions affect the results.</p>
  </article>`;
}
