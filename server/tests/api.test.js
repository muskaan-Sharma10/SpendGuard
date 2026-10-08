'use strict';

/**
 * API integration tests.
 *
 * These exercise the full HTTP stack (routes → validators → services →
 * MongoDB) through supertest, with no mocks, so authorization, validation,
 * aggregation pipelines and Mongoose casting are verified exactly as in
 * production.
 */

const request = require('supertest');
const app = require('../src/app');

const PASSWORD = 'Test@12345';

async function registerUser(email = 'alice@example.com', extra = {}) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Alice Example', email, password: PASSWORD, ...extra });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function createTransaction(token, overrides = {}) {
  const res = await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      amount: 250,
      type: 'expense',
      category: 'Food',
      date: '2026-10-05',
      merchant: 'Test Cafe',
      paymentMethod: 'UPI',
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.data.transaction;
}

// ---------------------------------------------------------------------------
// Health & auth
// ---------------------------------------------------------------------------

describe('GET /api/health', () => {
  it('responds ok without authentication', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });
});

describe('Auth endpoints', () => {
  it('registers a user and returns a token + public user (no passwordHash)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice Example', email: 'alice@example.com', password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe('alice@example.com');
    expect(JSON.stringify(res.body.data.user)).not.toContain('passwordHash');
  });

  it('rejects duplicate email registration with 409', async () => {
    await registerUser('dup@example.com');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dup', email: 'dup@example.com', password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects a short password with field-level details', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Shorty', email: 'short@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === 'password')).toBe(true);
  });

  it('rejects a malformed email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bad', email: 'not-an-email', password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials and returns a token', async () => {
    await registerUser('login@example.com');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe('login@example.com');
  });

  it('returns the same 401 for unknown email and wrong password (no enumeration)', async () => {
    await registerUser('enum@example.com');
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: PASSWORD });
    const wrongPw = await request(app)
      .post('/api/auth/login')
      .send({ email: 'enum@example.com', password: 'WrongPassword1' });
    expect(unknown.status).toBe(401);
    expect(wrongPw.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrongPw.body.error.message);
  });

  it('GET /api/auth/me returns the authenticated user', async () => {
    const { token, user } = await registerUser('me@example.com');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
  });

  it('blocks protected routes without a token and with an invalid token', async () => {
    const noToken = await request(app).get('/api/auth/me');
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.jwt');
    expect(badToken.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Transactions CRUD + list features
// ---------------------------------------------------------------------------

describe('Transactions', () => {
  let token;

  beforeEach(async () => {
    ({ token } = await registerUser('tx@example.com'));
  });

  it('creates a transaction and echoes it back', async () => {
    const tx = await createTransaction(token);
    expect(tx.amount).toBe(250);
    expect(tx.category).toBe('Food');
    expect(tx.id).toBeTruthy();
  });

  it('rejects invalid payloads with 400 and field details', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: -5, type: 'expense', category: 'NotACategory', date: '05-10-2026' });
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['amount', 'category', 'date']));
  });

  it('lists transactions with pagination and total', async () => {
    for (let i = 0; i < 5; i += 1) {
      await createTransaction(token, { amount: 100 + i, date: `2026-10-0${i + 1}` });
    }
    const res = await request(app)
      .get('/api/transactions?page=1&limit=2&sort=amount&order=desc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.pagination.total).toBe(5);
    expect(res.body.data.pagination.totalPages).toBe(3);
    // desc by amount: first item must be the largest (104)
    expect(res.body.data.items[0].amount).toBe(104);
  });

  it('filters by category and search text', async () => {
    await createTransaction(token, { category: 'Food', merchant: 'Pizza Place' });
    await createTransaction(token, { category: 'Transport', merchant: 'Metro' });

    const byCategory = await request(app)
      .get('/api/transactions?category=Transport')
      .set('Authorization', `Bearer ${token}`);
    expect(byCategory.body.data.items).toHaveLength(1);
    expect(byCategory.body.data.items[0].merchant).toBe('Metro');

    const bySearch = await request(app)
      .get('/api/transactions?search=pizza')
      .set('Authorization', `Bearer ${token}`);
    expect(bySearch.body.data.items).toHaveLength(1);
    expect(bySearch.body.data.items[0].category).toBe('Food');
  });

  it('updates and deletes an owned transaction', async () => {
    const tx = await createTransaction(token, { amount: 500 });

    const updated = await request(app)
      .put(`/api/transactions/${tx.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 750, note: 'updated' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.transaction.amount).toBe(750);

    const removed = await request(app)
      .delete(`/api/transactions/${tx.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(200);

    const gone = await request(app)
      .get(`/api/transactions/${tx.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(gone.status).toBe(404);
  });

  it("returns 404 (not 500) for someone else's transaction", async () => {
    const other = await registerUser('other@example.com');
    const foreignTx = await createTransaction(other.token);

    const res = await request(app)
      .get(`/api/transactions/${foreignTx.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);

    const del = await request(app)
      .delete(`/api/transactions/${foreignTx.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    const res = await request(app)
      .get('/api/transactions/not-a-valid-objectid')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

describe('Budgets', () => {
  let token;

  beforeEach(async () => {
    ({ token } = await registerUser('budget@example.com', {
      profile: { monthlyIncome: 50000 },
    }));
  });

  it('creates a budget and lists it with engine-computed status', async () => {
    const createRes = await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'Food', amount: 5000 });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.budget.category).toBe('Food');

    const listRes = await request(app)
      .get('/api/budgets')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.month).toBeTruthy();
    expect(listRes.body.data.items).toHaveLength(1);

    const item = listRes.body.data.items[0];
    expect(item).toHaveProperty('budgetAmount', 5000);
    expect(item).toHaveProperty('spent');
    expect(item).toHaveProperty('status');
  });

  it('rejects an invalid budget (bad category, non-positive amount)', async () => {
    const res = await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'NotACategory', amount: 0 });
    expect(res.status).toBe(400);
  });

  it('updates and deletes a budget', async () => {
    const created = await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'Entertainment', amount: 2000, month: '2026-10' });
    const id = created.body.data.budget.id;

    const updated = await request(app)
      .put(`/api/budgets/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 3000 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.budget.amount).toBe(3000);

    const deleted = await request(app)
      .delete(`/api/budgets/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleted.status).toBe(200);

    const listRes = await request(app)
      .get('/api/budgets')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.body.data.items).toHaveLength(0);
  });

  it("prevents deleting another user's budget (404)", async () => {
    const created = await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'Shopping', amount: 1000, month: '2026-10' });
    const id = created.body.data.budget.id;

    const other = await registerUser('budget-other@example.com');
    const res = await request(app)
      .delete(`/api/budgets/${id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Analytics (real aggregation over real transactions)
// ---------------------------------------------------------------------------

describe('Analytics', () => {
  let token;

  beforeEach(async () => {
    ({ token } = await registerUser('analytics@example.com', {
      profile: { monthlyIncome: 60000 },
    }));
  });

  it('overview reflects exactly the data the user entered', async () => {
    await createTransaction(token, { type: 'income', category: 'Other', amount: 50000, date: '2026-10-01' });
    await createTransaction(token, { category: 'Food', amount: 1000, date: '2026-10-02' });
    await createTransaction(token, { category: 'Food', amount: 500, date: '2026-10-03' });

    const res = await request(app)
      .get('/api/analytics/overview?now=2026-10-18')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const data = res.body.data;
    expect(data.totals.income).toBe(50000);
    expect(data.totals.expenses).toBe(1500);
    expect(data.totals.savings).toBe(48500);
    expect(data.totals.transactionCount).toBe(3);
    expect(data.safeToSpend).toBeTruthy();
    expect(data.health).toBeTruthy();
  });

  it('keeps users isolated: another user sees zero totals', async () => {
    await createTransaction(token, { category: 'Food', amount: 900, date: '2026-10-02' });

    const other = await registerUser('analytics-other@example.com');
    const res = await request(app)
      .get('/api/analytics/overview')
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totals.expenses).toBe(0);
    expect(res.body.data.totals.transactionCount).toBe(0);
  });

  it('insights include explanation objects (the "Why" data)', async () => {
    await createTransaction(token, { type: 'income', category: 'Other', amount: 40000, date: '2026-10-01' });
    for (let i = 0; i < 6; i += 1) {
      await createTransaction(token, { category: 'Food', amount: 300, date: `2026-10-1${i}` });
    }

    const res = await request(app)
      .get('/api/analytics/insights')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.insights)).toBe(true);
    expect(res.body.data.disclaimer).toBeTruthy();

    for (const insight of res.body.data.insights) {
      expect(insight.type).toBeTruthy();
      expect(insight.explanation).toBeTruthy();
      expect(insight.explanation.calculation).toBeTruthy();
    }
  });

  it('financial-health returns a score with component breakdown', async () => {
    await createTransaction(token, { type: 'income', category: 'Other', amount: 40000, date: '2026-10-01' });
    await createTransaction(token, { category: 'Food', amount: 8000, date: '2026-10-05' });

    const res = await request(app)
      .get('/api/analytics/financial-health?now=2026-10-18')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.score).toBeGreaterThanOrEqual(0);
    expect(data.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(data.components)).toBe(true);
  });

  it('trends and categories endpoints respond with trend metadata', async () => {
    const trends = await request(app)
      .get('/api/analytics/trends?now=2026-10-18')
      .set('Authorization', `Bearer ${token}`);
    expect(trends.status).toBe(200);
    expect(trends.body.data.trends.comparisonLabel).toBeTruthy();
    expect(Array.isArray(trends.body.data.monthlyHistory)).toBe(true);
    expect(trends.body.data.monthlyHistory).toHaveLength(6);

    const categories = await request(app)
      .get('/api/analytics/categories?now=2026-10-18')
      .set('Authorization', `Bearer ${token}`);
    expect(categories.status).toBe(200);
    expect(categories.body.data.comparisonLabel).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Recurring expenses
// ---------------------------------------------------------------------------

describe('Recurring', () => {
  let token;

  beforeEach(async () => {
    ({ token } = await registerUser('recurring@example.com'));
  });

  it('creates, lists, updates and deletes a recurring expense', async () => {
    const created = await request(app)
      .post('/api/recurring')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Gym', amount: 1200, frequency: 'monthly', category: 'Other' });
    expect(created.status).toBe(201);
    const id = created.body.data.recurring.id;

    const listRes = await request(app)
      .get('/api/recurring')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items).toHaveLength(1);
    expect(listRes.body.data.totals.monthlyTotal).toBeGreaterThan(0);

    const updated = await request(app)
      .put(`/api/recurring/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1500 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.recurring.amount).toBe(1500);

    const deleted = await request(app)
      .delete(`/api/recurring/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleted.status).toBe(200);
  });

  it('validates recurring payloads', async () => {
    const res = await request(app)
      .post('/api/recurring')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '', amount: 100, frequency: 'weeklyish' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting security edges
// ---------------------------------------------------------------------------

describe('Security edge cases', () => {
  it('rejects oversized JSON bodies (100kb cap)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Big', email: 'big@example.com', password: PASSWORD, note: 'x'.repeat(200 * 1024) });
    expect([400, 413]).toContain(res.status);
  });

  it('sets security headers via helmet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeTruthy();
  });

  it('does not expose stack traces on unexpected errors', async () => {
    const res = await request(app)
      .get('/api/transactions/507f1f77bcf86cd799439011')
      .set('Authorization', 'Bearer invalid-token');
    expect(JSON.stringify(res.body)).not.toMatch(/at .+\(.+:\d+:\d+\)/);
  });
});
