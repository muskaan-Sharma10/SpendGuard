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
**Database** — MongoDB with Mongoose 8 and compound indexes
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

Prerequisites: **Node.js 20.19+ or 22.12+** (required by Vite 8) and a local **MongoDB** listening on `mongodb://127.0.0.1:27017`.

```bash
# 1. Backend
cd server
npm install
cp .env.example .env        # macOS/Linux; then set a strong JWT_SECRET
# PowerShell equivalent: Copy-Item .env.example .env
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
| `CLIENT_ORIGIN` | no | Comma-separated CORS allow-list, defaults to `http://localhost:5173,http://localhost:4173`. |

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
| `GET /budgets` | Budgets enriched by the engine: `spent, remaining, utilizationPct, projected, status (GREEN/YELLOW/RED), statusReason, projectionMethod`. |
| `POST/PUT/DELETE /budgets` | One budget per (user, category, month). |
| `GET /analytics/overview` | Dashboard payload: totals, safe-to-spend, velocity, budget statuses, categories, daily series, 6-month history, trends, micro-spending, patterns, recurring totals, health. |
| `GET /analytics/trends` · `/categories` | Month-to-date like-for-like comparisons (`comparisonLabel` documents what was compared). |
| `GET /analytics/insights` | Regenerates insights from live data, persists them (upsert on `{userId, dedupeKey, periodKey}`), returns them with full explanations. |
| `GET /analytics/financial-health` | Weighted score + per-component breakdown + honest exclusion notes. |
| `GET /recurring` · `POST/PUT/DELETE /recurring` | Confirmed recurring commitments + totals. |
| `GET /recurring/detect` | Runs recurring detection over history; detected items are `source: "detected"` suggestions. |
| `GET /health` | Unauthenticated uptime probe (full URL: `http://localhost:5000/api/health`). |

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

> Git-connected hosts need a remote repository. Before pushing, confirm `.gitignore` excludes `node_modules/`, `client/dist/` and environment files.

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

Verify `https://<your-api>.onrender.com/api/health` returns `"status":"ok"`.

**Client on Vercel / Netlify / Render Static Site:** root directory `client`, build `npm run build`, output directory `client/dist` (Render) or auto-detected (Vercel/Netlify). Set one variable at build time so the build knows where the API lives:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-api>.onrender.com/api` |

and add a rewrite so client-side routes (`/dashboard`, `/transactions`, …) serve `index.html` rather than 404ing on refresh:

- **Vercel** — `client/vercel.json`: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
- **Netlify** — `client/public/_redirects` file containing: `/*  /index.html  200`

If the API sleeps (Render free tier), first page load may take ~30s to wake it — the UI's "Network error" toast will resolve once it's up.

### 3. Single-host alternative — one Express server serves the API *and* the built client

The server already supports this mode in production (one service, no build-time API URL, and same-origin API requests). Build the client before starting the server:

```js
npm --prefix client run build
cd server
NODE_ENV=production npm start
```

Then one deploy (VPS, Render single service, or any Node host) runs the whole app from `server/`. Set `MONGO_URI` and a strong `JWT_SECRET` in the host's environment. On a **VPS**, a typical setup is MongoDB + a process manager + a reverse proxy with TLS; restrict network access and configure trusted proxy settings for the actual host.

### Post-deploy smoke test

```bash
node server/scripts/smoke.js https://<your-api>.onrender.com
```

(The script's optional second argument is the base URL; then log into the deployed UI with the demo credentials and confirm the Dashboard renders the seeded data.)

---

## Learn the codebase

This section is a guided map for understanding the technologies and the specific
problems they solve here. Start at the request flow, then trace one feature all
the way from the page to the database and back.

### Architecture and request lifecycle

For example, loading the dashboard follows this path:

1. A React page calls `getData()` in `client/src/api/client.js`.
2. Axios sends an HTTP request to `/api/...`. In development, Vite proxies it
   to the Express server; in a split deployment, `VITE_API_URL` supplies the
   API origin.
3. Express applies security headers, JSON parsing, CORS policy, request
   logging, and the API rate limiter in `server/src/app.js`.
4. The route maps the URL and HTTP method to a controller. Private routes run
   JWT authentication first.
5. The controller coordinates a service; the service owns database queries
   and calls pure analytics functions as needed.
6. Mongoose reads the relevant user-scoped documents from MongoDB. The
   controller returns the common `{ success, data }` response shape.
7. The Axios response helper unwraps `data`; UI components render the result.
   Errors are normalized into a message and optional validation details.

Routes define the HTTP interface, controllers handle HTTP-level input/output,
services coordinate domain operations, models define persisted data, and the
intelligence engine performs calculations. Keeping these responsibilities
separate makes behavior easier to test and change.

### Concepts in use

| Concept | What it means | How SpendGuard uses it |
|---|---|---|
| **React components** | Reusable functions that render UI from props and state. | Pages and shared UI live under `client/src/pages` and `client/src/components`. |
| **Hooks and context** | Hooks manage component state/effects; context shares values across a component tree. | `AuthContext` shares session state and `ToastContext` exposes notifications. |
| **Client-side routing** | The browser changes views without a full document reload. | React Router maps the login, dashboard, transactions, budgets, analytics, recurring, and profile screens. |
| **HTTP/REST** | Resources are accessed through methods such as GET, POST, PUT, and DELETE. | Express exposes `/api` endpoints; the frontend uses Axios for requests. |
| **Middleware** | A function that can inspect/modify a request or response and pass control onward. | Express middleware handles authentication, validation, rate limiting, logging, CORS, and centralized errors. |
| **JWT authentication** | A signed token proves the identity/claims of the caller; it is not encrypted storage. | Login issues a token; the frontend sends it as a Bearer token; the server verifies it and loads the user. |
| **Authorization and ownership** | Authentication asks who the caller is; authorization asks what they may access. | Services scope private records to `req.user.id`; cross-user records are not returned. |
| **Schema validation** | Data is checked against expected types and constraints. | Request validators provide field-level API errors; Mongoose schemas enforce persisted-data rules too. |
| **ODM** | An object-document mapper maps application objects to database documents. | Mongoose defines MongoDB schemas, casting, model operations, and indexes. |
| **Compound indexes** | An index over multiple fields accelerates queries that filter/sort on those fields. | Transaction indexes begin with `userId` and pair it with date, category/type, or merchant. Index choice should be revisited as query patterns grow. |
| **Pure functions** | Functions without external side effects return the same output for the same inputs. | `SpendingIntelligenceEngine` receives plain data and returns calculations without accessing MongoDB or environment variables. |
| **Deterministic analytics** | Results follow explicit formulas rather than opaque model output. | Budget projections, summaries, trends, and health components are computed from transaction data and documented inputs. |
| **Idempotent upsert** | Repeating a write can update the same logical record instead of creating duplicates. | Insights use a user/dedupe-key/period identity when persisted. |
| **Environment configuration** | Runtime-specific settings are provided outside source code. | `server/src/config/env.js` validates defaults and requires a JWT secret outside tests. |
| **CORS** | Browser policy controlling which origins can call a cross-origin API. | The Express API uses an origin allow-list configured through `CLIENT_ORIGIN`; CORS is not a replacement for authentication. |
| **Security headers** | Browser-facing headers reduce exposure to common web risks. | Helmet adds headers; it complements, rather than replaces, input validation and authorization. |
| **Rate limiting** | Limits repeated requests over a time window. | General API and stricter credential-endpoint limiters reduce abuse; limits are disabled for tests. |
| **Unit tests** | Check a small unit in isolation. | Engine tests cover calculations with known inputs/expected results. |
| **Integration tests** | Check that multiple layers work together. | Supertest exercises the Express API and MongoDB-backed behavior against an isolated test database. |
| **Smoke tests** | Check that a deployed/running system can complete an important journey. | `server/scripts/smoke.js` exercises a user workflow against a live API. |

### Where to study each layer

| Study this | Start here |
|---|---|
| App bootstrap, middleware order, production static hosting | `server/src/app.js`, `server/src/server.js` |
| Route/controller/service separation | `server/src/routes`, `server/src/controllers`, `server/src/services` |
| Authentication and private data isolation | `server/src/middleware/auth.js`, `server/src/services` |
| Input validation and error responses | `server/src/middleware/validate.js`, `server/src/middleware/errorHandler.js`, `server/src/utils/ApiError.js` |
| MongoDB models and indexes | `server/src/models` |
| Analytics rules and formulas | `server/src/analytics/SpendingIntelligenceEngine.js` |
| Date and money helpers | `server/src/utils/dateUtils.js`, `server/src/utils/money.js` |
| Frontend routing and session state | `client/src/App.jsx`, `client/src/context/AuthContext.jsx` |
| API calls and error normalization | `client/src/api/client.js` |
| Explainable insight UI | `client/src/components/InsightCard.jsx`, `client/src/components/WhyDialog.jsx` |
| Tests and seed data | `server/tests`, `server/src/seed`, `server/scripts/smoke.js` |

### Important calculation trade-offs

- **Money and precision:** amounts are represented as JavaScript numbers and
  rounded to two decimals in the engine. This is adequate for the current
  single-currency demo, but production financial systems often use integer
  minor units or a decimal type to avoid binary floating-point edge cases.
- **Budget status:** the engine distinguishes money already spent from a
  month-end projection. Fixed recurring commitments are counted at their
  monthly cost while only variable spending is extrapolated, avoiding the
  assumption that an early rent payment repeats every day.
- **Trend comparison:** current month-to-date values are compared with the
  same elapsed span in the prior month. The comparison is fairer than
  comparing a partial month with a full one, though it is still descriptive
  and not a causal explanation.
- **Insufficient data:** some analytics need a minimum history span. The app
  returns availability/reason information rather than presenting an
  unsupported pattern as fact.
- **Recurring detection:** repeated merchant/amount/cadence behavior is a
  heuristic. A candidate remains a suggestion until the user confirms it.
- **Financial health:** a weighted score is only meaningful for computable
  components. Unavailable components are excluded and the remaining weights
  are redistributed; if no component can be computed, the score is `null`.

### A practical study path

1. Run the project and trace a normal screen interaction in the browser's
   network panel.
2. Read `client/src/api/client.js`, then follow one URL through its route,
   controller, service, model, and response.
3. Trace a transaction from request validation through user scoping and
   persistence. Explain what prevents a user from reading another user's row.
4. Pick one pure engine function, calculate its result by hand, then read the
   matching unit tests. Be ready to discuss boundary conditions.
5. Read the matching API integration test and identify which real layers it
   covers that a unit test does not.
6. Change a small behavior, add a test first or alongside it, and run the
   focused test/build command. This is the best way to turn familiarity into
   demonstrated ownership.

---

## Interview preparation

### A concise project walkthrough

Use this as a structure, not a script to memorize. Replace any statement that
does not describe work you personally did:

> “SpendGuard is a full-stack personal-finance analytics app built with React
> and Vite, an Express API, and MongoDB through Mongoose. Users can record
> transactions, set budgets, and review recurring expenses and trends. The
> central engineering decision was to keep financial calculations in a
> deterministic, database-independent engine. That lets me test the formulas
> directly and show the inputs, formula, arithmetic, result, and limitations
> behind each insight instead of presenting a black-box score. The API uses
> JWT authentication and user-scoped queries, and I test both the pure engine
> and the HTTP/database integration. One trade-off is that recurring detection
> is heuristic, so detections are suggestions rather than automatic facts.
> I’d be happy to walk through one request or calculation in the code.”

### Common deep-dive questions

**Why did you build an analytics engine instead of putting the formulas in
controllers?**

Controllers should coordinate HTTP behavior, not own financial rules. The
engine accepts plain values and has no database or environment dependencies,
so its behavior is deterministic and easy to unit-test. Services fetch and
prepare data; controllers shape the API response.

**Walk me through a private API request.**

The request reaches Express middleware, then the route's authentication and
validation middleware. JWT verification identifies the caller; the user is
loaded and attached to the request. The controller calls a service, and
database operations are scoped to that user's ID. The response uses the
standard success/error shape. Invalid IDs, validation failures, missing
authentication, and unexpected errors are handled through the API error
path.

**How do you prevent one user from accessing another user's transactions?**

Authentication alone is not enough. The server uses the verified user's ID in
the database query and ownership checks. A foreign record is treated as not
found rather than exposing its existence. I would verify this with the
cross-user isolation integration tests and by tracing each private service
query—not merely by checking that a route requires a token.

**What does the JWT contain, and what does it not do?**

A JWT is signed so the server can detect tampering; its payload is not
encrypted and should not contain secrets. This app sends the token in the
Authorization Bearer header. The server verifies the signature and expiration
and loads the user. Tokens are stateless, so the current logout behavior
discards the token client-side; immediate server-side revocation would need a
denylist, token versioning, or short-lived access tokens with refresh-token
rotation.

**Why MongoDB/Mongoose? What is the trade-off?**

Mongoose provides schema validation and a convenient document model for this
project's user-owned transaction, budget, recurring, and insight records.
Compound indexes support common user-plus-date/category/merchant queries.
The choice is not universally better than SQL: financial ledgers often benefit
from relational constraints and transactional workflows. If the product
needed stronger cross-record invariants, complex joins, or accounting-grade
ledger guarantees, I would reassess the data model and database.

**How is the budget projection calculated?**

For a category, the engine separates a known recurring monthly commitment
from the variable portion of spending. It subtracts the fixed amount already
paid (up to the commitment), extrapolates variable spending from the elapsed
days, and adds the fixed monthly commitment once:
`projected = (variableSpent / daysElapsed) * daysInMonth + fixedMonthlyCommitment`.
The result is an estimate based on the observed pace, not a guarantee.

**Why compare the same month-to-date span?**

A partial current month compared with a complete prior month creates a
misleading ratio. Comparing equivalent elapsed spans reduces that bias.
It does not remove seasonality, unusual one-off purchases, or other causal
factors, so the UI describes the comparison rather than claiming why it
happened.

**How do you make insights explainable?**

Each insight carries its data, formula, calculation, result, and
interpretation. The UI presents that explanation in a “Why am I seeing this?”
dialog. This also makes it possible to test that an insight's displayed
explanation matches its computed result.

**How do you test it?**

Engine unit tests cover pure calculations and edge cases. API integration
tests use Supertest against the actual Express stack and a dedicated MongoDB
test database; the setup clears collections between tests. The smoke script
checks a larger live user journey. I would mention exactly which commands I
ran and any failures rather than claim tests passed without running them.

**What would you improve next?**

I would prioritize secure deployment and session lifecycle, then data
portability (CSV import with preview and validation), and stronger monetary
precision using integer minor units or a decimal representation. I would add
observability and query-performance checks as the data volume grows. I would
choose based on user needs rather than presenting a roadmap as completed work.

### Demonstrate authorship through understanding

Interviewers are usually testing whether you can reason about, modify, and
maintain the project—not whether you can recite a README. Be ready to:

- draw the browser → API → service → database → response flow;
- explain one formula, its assumptions, and an edge case;
- locate the test that proves an important behavior;
- make a small requested change and add a regression test;
- name one thing you would redesign and justify the trade-off.

Do not claim features, tests, scale, deployment, or individual contributions
that you cannot substantiate. If this is collaborative work, describe your own
part precisely.

### If an AI agent helped build the project

Be direct; do not imply that AI-generated work was independently authored if
that is not true. A credible answer, if accurate for your process, is:

> “I used an AI coding agent as a development assistant. I treated its output
> as a proposal, not as proof of correctness. I reviewed the architecture,
> ran the application, traced the important request paths, checked the
> financial formulas against examples, and used tests to verify behavior. I
> can explain the trade-offs and change the code without relying on the agent.
> For example, [describe a specific decision or change you personally
> verified]. I’m happy to work through a small change live.”

If you did not personally verify or change something, say so and explain how
you would investigate it. To stand out, bring evidence: a focused test you
added, a bug you found and fixed, a formula you validated, or a design choice
you reconsidered. Never invent a contribution or present AI output as proof
that you understand the system.

### Before the interview

- Run the app and sign in with the demo account; know which data is seeded.
- Verify the commands and tests you plan to mention on your current machine.
- Practice the walkthrough in your own words, then follow up with one
  concrete request path and one calculation.
- Prepare one honest limitation and one improvement, with a reason for each.
- Be ready to distinguish what is implemented, what is tested, and what is
  only a future idea.

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
