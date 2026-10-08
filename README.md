# SpendGuard

**Transparent personal finance analytics** — a full-stack web application that does not just tell you where your money went. It helps you understand your *spending behaviour*, detect financial leakage, anticipate budget problems before month-end, and make better-informed decisions using **transparent calculations based on your own data**.

> SpendGuard is a decision-support tool, not a financial advisor. Every number shown is computed deterministically from the user's own transactions — and every card, insight and score can answer **"Why am I seeing this?"** with the exact data, formula and arithmetic behind it.

---

## Why SpendGuard is different

Most expense trackers stop at charts. The deeper problem SpendGuard addresses:

> **People often recognize problematic spending only after the money has already been spent.**

SpendGuard responds with an explainable intelligence layer (`SpendingIntelligenceEngine`):

| Capability | How it stays honest |
|---|---|
| **Safe-to-Spend** | Uses *remaining category budgets* when budgets exist, otherwise `income − expenses so far − recurring commitments`. Always labelled with its basis and its limitations. |
| **Budget projections** | Fixed recurring commitments are counted at their known monthly cost; **only variable spending is extrapolated** from your actual pace: `projected = (variableSpent / daysElapsed) × daysInMonth + fixedMonthlyCommitment`. This prevents the classic "budget will explode" false alarm caused by double-counting rent you already paid. |
| **Trend comparisons** | Like-for-like **month-to-date vs same span of last month**. Comparing a 6-day month against a full month produces fake "spending collapsed 80%" headlines; SpendGuard refuses to do that. |
| **Insights** | Generated with `dedupeKey`s, severities and a full `explanation` object: `dataUsed`, `formula`, `calculation`, `result`, `interpretation`. The UI renders this verbatim in a "Why am I seeing this?" dialog. |
| **Financial health score** | Five weighted components (budget adherence 25, savings rate 25, budget stability 20, recurring burden 15, consistency 15). A component that *cannot be computed fairly* (e.g. no income recorded → no savings rate) is **excluded with proportional weight redistribution**, and the score is `null` with an explicit `insufficientData` flag when nothing is computable. No invented numbers. |
| **Micro-spending detection** | Counts transactions under a threshold and reports their combined share of expenses — presented neutrally as behaviour context, never as judgement. |
| **Recurring detection** | Detects repeating amounts + merchants from transaction history. Detected items are **suggestions** until confirmed; confirmed commitments feed budget projections. |
| **Data-sufficiency guards** | Pattern analysis requires ~2 weeks of expense history; recurring detection requires ~60 days. Below the thresholds the API says so instead of guessing. |

---

## Tech stack

**Frontend** — React 19 + Vite, React Router, Tailwind CSS 3, Recharts, Axios
**Backend** — Node.js + Express (CommonJS), Mongoose, JWT auth (`jsonwebtoken`), `bcryptjs`, `helmet`, `express-rate-limit`, hand-written validators
**Database** — MongoDB 8 (local), Mongoose 8 with compound indexes
**Testing** — Jest + Supertest. Engine unit tests + full HTTP integration tests against a **real** MongoDB (`spendguard_test`), plus an end-to-end smoke script.

```mermaid
flowchart LR
    subgraph client["React client (Vite, :5173)"]
        PAGES["Login · Dashboard · Transactions\nBudgets · Analytics · Recurring · Profile"]
        API["api/client.js — axios + JWT interceptor"]
        PAGES --> API
    end

    subgraph server["Express API (Node, :5000)"]
        R["Routes"] --> V["Validators"] --> AUTH["Auth (JWT) middleware"]
        AUTH --> SVC["Services"]
        SVC --> DB["Mongoose models"]
        SVC --> ENG["SpendingIntelligenceEngine\n(pure functions, no DB/env)\nunit-tested: 28 tests"]
        MW["helmet · rate-limit · CORS allow-list ·\nerror handler (no stack traces)"]
    end

    subgraph mongo[("MongoDB 8")]
        DEV[("spendguard")]
        TEST[("spendguard_test")]
    end

    API -- "/api (Vite dev proxy / CORS in prod)" --> R
    DB --> DEV
    TESTDB["Jest + Supertest\n(30 integration tests)"] --> TEST
```

**Testing layout:** `tests/engine.test.js` unit-tests the pure engine; `tests/api.test.js` drives the real HTTP stack against `spendguard_test`; `scripts/smoke.js` runs the full user journey against a live server.

---

## Quick start

Prerequisites: **Node 18+** and a local **MongoDB** listening on `mongodb://127.0.0.1:27017`.

```bash
# 1. Backend
cd server
npm install
cp .env.example .env        # then edit JWT_SECRET (see below)
npm run seed:fresh          # optional: 6 months of realistic demo data
npm run dev                 # → http://localhost:5000

# 2. Frontend (new terminal)
cd client
npm install
npm run dev                 # → http://localhost:5173
```

**Demo credentials** (fictional data, ~470 transactions over 6 months, 6 budgets, 8 detected recurring commitments):

```
email:    demo@spendguard.app
password: Demo@12345
```

### Environment variables (`server/.env`)

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no | Defaults to `5000`. Non-positive values are treated as unset. |
| `MONGO_URI` | no | Defaults to `mongodb://127.0.0.1:27017/spendguard`. Tests automatically use `spendguard_test`. |
| `JWT_SECRET` | **yes (prod)** | Fails fast in production; a test-only fallback exists under `NODE_ENV=test`. |
| `JWT_EXPIRES_IN` | no | e.g. `7d`. |
| `CLIENT_ORIGINS` | no | Comma-separated CORS allow-list, defaults to `http://localhost:5173`. |

`server/.env` is git-ignored; `server/.env.example` documents every variable.

---

## API overview

Base URL `http://localhost:5000/api`. All responses are `{ success: true, data }` or `{ success: false, error: { message, details? } }`.

| Endpoint | Description |
|---|---|
| `POST /auth/register` · `/auth/login` · `/auth/logout` | JWT auth. Unknown-email and wrong-password produce the **identical 401** (no account enumeration). |
| `GET /auth/me` · `PUT /profile` | Session + profile (currency, monthly income, savings target, target savings rate). |
| `GET /transactions` | `page, limit, sort, order, type, category, paymentMethod, from, to, month, search`. |
| `POST/PUT/DELETE /transactions/:id` | Ownership enforced — a foreign id returns **404, never 200/500**. |
| `GET /budgets` | Budgets enriched by the engine: `spent, remaining, utilizationPct, projected, status (GREEN/AMBER/RED), statusReason, projectionMethod`. |
| `POST/PUT/DELETE /budgets` | One budget per (user, category, month). |
| `GET /analytics/overview` | Dashboard payload: totals, safe-to-spend, velocity, budget statuses, categories, daily series, 6-month history, trends, micro-spending, patterns, recurring totals, health. |
| `GET /analytics/trends` · `/categories` | Month-to-date like-for-like comparisons (`comparisonLabel` documents what was compared). |
| `GET /analytics/insights` | Regenerates insights from live data, persists them (upsert on `{userId, dedupeKey, periodKey}`), returns them with full explanations. |
| `GET /analytics/financial-health` | Weighted score + per-component breakdown + honest exclusion notes. |
| `GET /recurring` · `POST/PUT/DELETE /recurring` | Confirmed recurring commitments + totals. |
| `GET /recurring/detect` | Runs recurring detection over history; detected items are `source: "detected"` suggestions. |
| `GET /health` | Unauthenticated uptime probe. |

Security posture: Helmet headers, 100 KB JSON body cap, general API rate limit (300/min) plus a stricter limiter on credential endpoints, CORS allow-list, JWT middleware on every private route, centralized error handler that never leaks stack traces, and validators that return field-level `details`.

---

## Testing

```bash
cd server
npx cross-env NODE_ENV=test npx jest     # 58 tests: engine (28) + API integration (30)
npm run dev &                            # then, against the running server:
node scripts/smoke.js                    # 22 end-to-end checks
```

- **Engine tests** (`tests/engine.test.js`) verify the pure math against worked examples: period summaries, budget status thresholds, velocity projection, safe-to-spend (both bases), micro-spending, trends (including the `isNew`/null-pct edge), recurring detection, health-score weighting and weight redistribution, and insight generation with explanation integrity.
- **API tests** (`tests/api.test.js`) exercise the real HTTP stack against real MongoDB: auth (including no-enumeration), validation errors with field details, CRUD + pagination + filtering, **cross-user isolation (404 on foreign ids)**, malformed-id 400s, analytics correctness against known inserted data, insight explanations present on every insight, security headers, and oversized-payload rejection.
- **Smoke script** (`scripts/smoke.js`) runs the full user journey against a live server: register → login → CRUD → budgets → analytics → recurring detection → isolation checks.

The rate limiters are disabled only under `NODE_ENV=test` so integration tests don't mask assertion failures with 429s; they are fully active in development and production.

---

## The SpendingIntelligenceEngine

`server/src/analytics/SpendingIntelligenceEngine.js` is the heart of the project: **pure functions** with no database or environment access, which makes every calculation directly unit-testable and quotable.

Key exported calculations:

```text
computePeriodSummary(transactions, {start, end})
  → income, expenses, savings, savingsRate, categories[], dailySeries[]

computeBudgetStatus({budget, transactions, recurringForCategory, now})
  → spent, utilizationPct, projected, projectedOverrun, status, statusReason
    projected = (variableSpent / daysElapsed) × daysInMonth + fixedMonthlyCommitment

computeSafeToSpend({transactions, budgets, recurringMonthlyCost, profile, now})
  → available, perDay, basis, isEstimate, limitation, formula

computeSpendingVelocity({expenses, budget, now})
  → dailyRate, projectedTotal, potentialOverrun, onPaceForOverrun, formula

detectMicroSpending({transactions, threshold, totalExpenses, now})
  → count, total, shareOfExpenses, averageValue, dominantCategory, breakdown[]

computeCategoryTrends(current, previousMtd, {comparisonLabel})
  → comparisonLabel, per-category change/changePct/direction/isNew

detectRecurringExpenses(transactions, {minDays})
  → candidates with occurrence counts, avg amounts and next expected dates

analyzeSpendingPatterns({transactions, minDays, now})
  → weekendVsWeekday, dayOfWeek, monthPhase, concentration (or `available:false` + reason)

computeFinancialHealth({currentSummary, budgetsStatuses, recurringMonthlyCost, patterns, profile, trends})
  → score (0-100 | null), components[{earned, max, weightApplied, formula, detail}],
    positives[], attention[], notes[], insufficientData

generateInsights({...})
  → [{type, severity, title, message, calculatedValues, formula,
      recommendation, explanation{dataUsed, formula, calculation, result, interpretation}, dedupeKey}]
```

Design rules the engine follows (and tests enforce):

1. **Never fabricate.** Every derived number names its inputs and formula. Missing data produces `available: false` / `score: null` with a human-readable reason — never a guessed value.
2. **Like-for-like comparisons.** Partial months are only ever compared against the same span.
3. **Fixed vs variable separation** in projections, so recurring rent is never double-counted.
4. **Neutral tone.** Behaviour findings are context, not judgement; recommendations are framed as considerations.

---

## Project structure

```
spendguard/
├─ client/                      # React + Vite frontend
│  ├─ src/
│  │  ├─ api/client.js          # axios instance + JWT interceptor + error normalisation
│  │  ├─ context/               # AuthContext, ToastContext
│  │  ├─ components/            # Layout, WhyDialog, InsightCard, ProtectedRoute
│  │  ├─ pages/                 # Login, Register, Dashboard, Transactions,
│  │  │                         # Budgets, Analytics, Recurring, Profile
│  │  └─ utils/format.js        # locale-aware currency/date formatting
│  └─ vite.config.js            # /api proxy → :5000
└─ server/
   ├─ src/
   │  ├─ analytics/SpendingIntelligenceEngine.js   # pure intelligence layer
   │  ├─ config/ (env, db, constants)
   │  ├─ middleware/ (auth, validate, errorHandler, rateLimiter)
   │  ├─ models/ (User, Transaction, Budget, RecurringExpense, Insight)
   │  ├─ services/ (transaction, budget, recurring, insight, analytics)
   │  ├─ controllers/ · routes/
   │  ├─ seed/ (deterministic demo-data generator)
   │  └─ app.js · server.js
   ├─ scripts/smoke.js
   ├─ tests/ (setup, engine.test.js, api.test.js)
   ├─ .env.example
   └─ package.json
```

## Deployment

Three pieces need hosting: a **database**, the **Express API**, and the **static React build**. When live, the app is a normal HTTPS site with a JSON API — same code, just real env vars.

### 1. Database — MongoDB Atlas (free M0 tier)

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas) (M0 is free forever).
2. **Database Access** → add a database user (username + strong password).
3. **Network Access** → add your server host's IP (on PaaS hosts, `0.0.0.0/0` is the pragmatic choice for a demo; a VPS lets you allowlist its exact IP).
4. Copy the connection string — it becomes your `MONGO_URI`:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/spendguard
   ```
5. To start a deployed API with demo data, run the seeder locally against Atlas once:
   ```bash
   cd server
   MONGO_URI="mongodb+srv://.../spendguard" npm run seed   # bash
   $env:MONGO_URI="mongodb+srv://.../spendguard"; npm run seed   # Windows PowerShell
   npx cross-env MONGO_URI="mongodb+srv://.../spendguard" npm run seed   # either OS
   ```

### 2. Shared hosting (recommended for a demo) — Render + static host

> GitHub first: this workspace has no git repo yet, so git-connected hosts need one. Commit only after confirming `.gitignore` covers `node_modules/`, `client/dist/` and `.env` (it already does).

```bash
git init && git add . && git commit -m "SpendGuard initial commit"
git remote add origin https://github.com/<you>/spendguard.git
git push -u origin main
```

**API on Render (or Railway/Fly):** new **Web Service**, root directory `server`, build `npm install`, start `npm start`. Environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | the Atlas connection string from step 1 |
| `JWT_SECRET` | long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_ORIGIN` | e.g. `https://spendguard.vercel.app` — comma-separated allow-list |

Verify `https://<your-api>.onrender.com/health` returns `"status":"ok"`.

**Client on Vercel / Netlify / Render Static Site:** root directory `client`, build `npm run build`, output directory `client/dist` (Render) or auto-detected (Vercel/Netlify). Set one variable at build time so the build knows where the API lives:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-api>.onrender.com/api` |

and add a rewrite so client-side routes (`/dashboard`, `/transactions`, …) serve `index.html` rather than 404ing on refresh:

- **Vercel** — `client/vercel.json`: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
- **Netlify** — `client/public/_redirects` file containing: `/*  /index.html  200`

If the API sleeps (Render free tier), first page load may take ~30s to wake it — the UI's "Network error" toast will resolve once it's up.

### 3. Single-host alternative — one Express server serves the API *and* the built client

Cheapest and simplest to reason about (one service, no build-time API URL, no CORS): the API serves `client/dist` as static files with an SPA fallback. Add before the 404/error handlers in `server/src/app.js`:

```js
if (env.isProduction) {
  const path = require('path');
  const dist = path.join(__dirname, '../../client/dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
```

Then one deploy (VPS, Render single service, or any Node host) runs the whole app from `server/`. On a **VPS** (DigitalOcean/Raspberry Pi/any Ubuntu box) the classic stack is `mongod` + `pm2 start src/server.js` + `nginx` reverse-proxying `:80/443 → :5000` with `certbot` for TLS — set `CLIENT_ORIGIN` to your VPS domain and point any DNS name at it.

### Post-deploy smoke test

```bash
node server/scripts/smoke.js https://<your-api>.onrender.com
```

(The script's optional second argument is the base URL; then log into the deployed UI with the demo credentials and confirm the Dashboard renders the seeded data.)

---

## Verification checklist

- ✅ Auth (register/login/logout/me) works; identical 401 for unknown email and wrong password
- ✅ Transactions CRUD with search, filters, sorting, pagination, toasts; invalid input → 400 with field details
- ✅ Budgets with engine-computed status, utilization, and fixed-vs-variable projections
- ✅ Insights generated from real data, each with a working "Why?" dialog (data → formula → calculation → result → interpretation)
- ✅ Financial health score with component breakdown and honest data-sufficiency handling
- ✅ Recurring expenses: manual + detection, monthly/annualised totals
- ✅ Unauthorized access prevented (JWT middleware, cross-user 404s, 401 on invalid token)
- ✅ 58 Jest tests + 22 smoke checks pass
- ✅ Responsive layout (sidebar collapses to top navigation; no horizontal overflow at 390 px)
- ✅ `server/.env` is git-ignored; `server/.env.example` documents all variables
- ✅ No console errors during end-to-end browser verification

## Known limitations (stated honestly)

- Single-user-per-account, no bank/CSV import — transactions are entered manually or seeded.
- Safe-to-spend and projections are estimates; the UI says so next to the numbers.
- Recurring detection is heuristic (repeating amount + merchant + cadence); it may miss irregular-billing subscriptions.
- JWTs are stateless; logout is client-side token discard (an endpoint exists for a future denylist).

## Roadmap ideas

- CSV import with category mapping
- Monthly review report ("what changed and why")
- Multi-currency support with FX history
- PWA + local-first offline capture
