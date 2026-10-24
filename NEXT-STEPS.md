# Resume later

Latest user preference: keep current Sites hosting. Plain, minimalist UI; Arial/Helvetica, square corners, no rounded cards or rating pills. `dist/plain.css` is the focused UI override. Do not move to Vercel or change hosting without a new request.

The forecast model is unchanged and needs a separate revision. The user specifically identified missing candidate strength for Susan Collins, Sherrod Brown and Mary Peltola.

Audit: Maine's D+4 poll is pulled toward a D+14.54 prior, producing roughly D+8.87 and a 97% Democratic win probability. Sparse polling is not the sole issue; the prior lacks candidate history. Historical electoral overperformance is evidence of candidate/opponent effects, not a permanent polling-bias adjustment. Avoid counting incumbency twice, transferring retiring incumbents' strength to new nominees, or tuning Maine to a desired rating.

Research is saved locally under `C:/Users/rafay/midterm-atlas-research/`:

- `candidate-history-v2.json` and `senate-roster-v2.json`: candidate-history and roster research; verification status varies, so audit before use.
- `v2-audit/`: MIT historical Senate/presidential results, FiveThirtyEight House/Senate compilations and source metadata.
- `governor-v2/`: normalized governor history and returning-incumbent research.

Next model work: audit current nominees and historical candidate identities; estimate shrunken candidate effects and separate incumbency; use walk-forward validation without target-cycle outcome leakage. A diagnostic that uses realized national popular vote is conditional validation, not an ex-ante forecast backtest. Preserve the existing browser-worker performance improvements.

No Vercel project or deployment was created. The only Vercel action was the read-only `vercel whoami` check. Research agents were stopped. Do not restart a broad rebuild on a UI-only request.
