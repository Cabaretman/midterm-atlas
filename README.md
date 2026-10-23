# Midterm Atlas

An interactive 2026 election laboratory covering **35 Senate races, 435 House districts and 36 state governorships**. Built for Cabaretman. No runtime secrets, paid feeds, or database required.

## Run

Node 22+ serves the prebuilt static site:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173. The actual application lives in `dist/`; there is no bundling step. All map geometry, forecast code and fonts are local. The interface uses system fonts, without a font CDN or runtime UI dependencies.

## Interface and performance

The interface uses a quiet, light workspace layout, system typography, thin separators and muted party colors. A sidebar becomes compact navigation on phones. All forecasts and controls are retained.

Simulations run in a module Web Worker, so calculations do not block input handling. Repeated calculations reuse Float64 seeded draws with exactly the original random-number order and arithmetic. A queue holds at most one active and one latest request; superseded results never overwrite the latest scenario. A synchronous fallback remains available if Workers cannot load.

The SVG map and live slider nodes stay mounted during updates, preserving drag/keyboard focus. Table rows are reused and shown in batches of 50, with a Show more control; all races remain searchable and are always included in simulations and CSV exports. Shared map arcs are simplified at build time for display, preserving borders and all states. The map payload fell from about 147 KB to 100 KB.

Run `npm run profile` while the local server is running for a reproducible House interaction check at 4× CPU throttling. It reports input-to-frame times, forecast-to-frame times, long tasks, DOM count and worker use. Frame timings use requestAnimationFrame callbacks, not physical screen-paint measurement. Results depend on hardware and browser load. Local checks measured repeated House simulation calculations around 30 ms versus roughly 350 ms in the first version; this is a local measurement, not a cross-device speed guarantee. Regression fixtures verify that the optimized simulation produces exactly the published version's outcomes for all 506 contests, including independent and third-candidate handling.

## Features

- Geographic state map for Senate and governors, House state overview and 435-district tile map.
- Source-weighted poll aggregation plus partisan lean, generic ballot, presidential approval and verified incumbency priors.
- 4,000 correlated Monte Carlo simulations; national and state error factors, control probabilities and 80% count intervals.
- National/state/race margin-error sliders; editable national inputs, polling influence and uncertainty settings.
- Explicit independent Senate affiliation assumption, R Senate tiebreak, and simple significant-third-candidate treatment.
- Saved browser scenarios, shareable URL scenarios, scenario JSON import/export and forecast CSV export.
- Polling ledger with original-source URLs, population/sample caveats and session-only polling imports.

## Data status and limitations

The initial **2026-10-23 snapshot contains 35 curated polling rows**, covering 11 Senate races, 13 governor races and **one House district**, plus generic-ballot and approval polling. It is **not comprehensive and does not automatically refresh**. Most House forecasts are fundamentals estimates. This is stated prominently in the site.

Coefficients and variances are hand-specified, **not historically fitted or backtested**. Probabilities are experimental, and the UI does not claim professional calibration. The in-app Methodology tab documents formulas and limitations. No independent economic, fundraising or candidate-quality regression is included. House reference incumbency is not a verified candidate roster, so its incumbency bonus is disabled. Matchup eligibility is not automatically inferred. Poll source releases and roster sources can differ; verify any new candidate-level data before importing.

Senate holdovers: 34 D-caucus and 31 R; 35 contests. Governors: 5 D and 9 R holdovers; 36 state contests, excluding territories. Independents in NE/MT/SD do not automatically count as D. Rhode Island has a third-candidate approximation. Ranked-choice rounds, Louisiana runoffs and Alaska multi-Republican fields are not simulated.

### Sources

- House 2024 partisan baselines on 2026 district lines: [The Downballot](https://www.the-downballot.com/p/the-downballots-calculations-of-presidential). Original CSV preserved under `data/raw/house-2026-raw.csv`. Results are rounded whole-point margins; retain the supplied margin column.
- State partisan baselines: [Tony McGovern's county-level presidential compilation](https://github.com/tonmcg/US_County_Level_Election_Results_08-24), aggregated to states; original CSV preserved.
- Governor roster: [National Governors Association](https://www.nga.org/governors/elections/). Nominee names may lag changes.
- Polls: original releases from Marist, Emerson, YouGov, Elon and ActiVote, individually linked in `dist/data.json`. Original extracted rows retained under `data/raw/`.
- Map geometry: [US Atlas](https://github.com/topojson/us-atlas), Census-derived Albers geometry. The app ships generated SVG paths, not a map CDN dependency.

Third-party data retains its original ownership and terms. This repository does not grant a license to republish third-party poll content or data. Confirm source terms before broad public redistribution or running unattended ingestion.

## Updating polls

The source preserves raw data and reproducibly builds a normalized snapshot. To make a reviewed update:

1. Prepare a normalized poll array with original-source URLs and field dates. Required fields: `id`, `raceId`, `pollster`, `end`, `population` (`LV`, `RV`, `A`), `url`, and numerical `dem`/`rep` shares. `raceId` examples: `senate-MI`, `house-NY-17`, `governor-PA`, `generic`, `approval`.
2. For approval use `approve`/`disapprove`. For an independent versus R use `independent`/`rep` instead of `dem`. A significant additional independent uses `other` alongside `dem`/`rep`. Optional metadata: `start`, effective `n`, `moe`, `fullSample`, `notes`.
3. Import from disk or an HTTPS feed that already follows this schema:

```sh
node scripts/import-polls.mjs --file reviewed-polls.json --as-of 2026-10-24
# or --url https://your-authorized-feed.example/polls.json
npm test
npm run test:browser
```

This validates, merges reviewed rows, updates the dated snapshot version, and rebuilds `dist/data.json`. Polls after the snapshot date, invalid shares and unknown race IDs are rejected. `id` replacement and pollster/race/end-date deduplication prevent counting the same poll twice. Newly added source rows override prior rows when source identity matches. The updater does not scrape or guess values from arbitrary articles. No upstream commercial API has been connected.

Browser imports last only for the current session. Shared/saved scenarios contain assumptions, not imported polling data. The versioned CLI update is the durable route. Republish after a source update; changing GitHub files alone does not claim to update the hosted site.

## Rebuild and verify

```sh
npm run prepare:data     # Python 3 + Node, rebuild from versioned raw inputs
npm test                 # universe, imports, blends, correlation, ties, I seats
npx playwright install chromium
npm run test:browser     # desktop/mobile flows, sliders, offices, sharing, inputs
```

`scripts/prepare-map.mjs` rebuilds local map geometry from npm's US Atlas. `scripts/prepare-data.py` rebuilds all priors and normalized poll records. The Sites source manifest is `.openai/hosting.json`; publishing defaults to a private owner-only site. This GitHub repository is a source backup and development home.

## Project layout

- `dist/model.mjs`: pure model and validation functions, independently testable.
- `dist/app.mjs`: responsive application, scenarios, maps, ledger, exports.
- `dist/data.json`: audited normalized runtime snapshot.
- `data/raw/`: original source snapshots and extraction metadata.
- `data/imported-polls.json`, `data/snapshot.json`: durable updates and snapshot metadata.
- `scripts/`: input pipeline, map preparation, local server.
- `tests/`: quantitative checks and Playwright interaction tests.
