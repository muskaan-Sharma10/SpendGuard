'use strict';

/* eslint-disable no-console */
/**
 * End-to-end API smoke test against a running server.
 * Usage: node scripts/smoke.js [baseUrl]
 */

const BASE = process.argv[2] || 'http://localhost:5000';
const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
};

const assert = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) process.exitCode = 1;
};

(async () => {
  const unique = Date.now();
  const email = `smoke${unique}@test.com`;

  // 1. register
  const reg = await api('POST', '/api/auth/register', { body: { name: 'Smoke User', email, password: 'password123', profile: { monthlyIncome: 40000 } } });
  assert('register', reg.status === 201 && reg.json.data.token);
  const token = reg.json.data.token;

  // 2. duplicate register
  const dup = await api('POST', '/api/auth/register', { body: { name: 'X', email, password: 'password123' } });
  assert('duplicate register rejected', dup.status === 409);

  // 3. login
  const login = await api('POST', '/api/auth/login', { body: { email, password: 'password123' } });
  assert('login', login.status === 200 && login.json.data.token);
  const wrong = await api('POST', '/api/auth/login', { body: { email, password: 'wrongpass1' } });
  assert('wrong password rejected', wrong.status === 401);

  // 4. protected route without token
  const noAuth = await api('GET', '/api/transactions');
  assert('protected route rejects missing token', noAuth.status === 401);

  // 5. transactions CRUD
  const tx1 = await api('POST', '/api/transactions', { token, body: { amount: 250, type: 'expense', category: 'Food', date: new Date().toISOString().slice(0, 10), merchant: 'Cafe Mocha', paymentMethod: 'UPI' } });
  assert('create expense', tx1.status === 201 && tx1.json.data.transaction.id);
  const tx2 = await api('POST', '/api/transactions', { token, body: { amount: 40000, type: 'income', category: 'Other', date: new Date().toISOString().slice(0, 10), note: 'Salary', paymentMethod: 'Bank Transfer' } });
  assert('create income', tx2.status === 201);

  const invalid = await api('POST', '/api/transactions', { token, body: { amount: -5, type: 'expense', category: 'Food', date: '2026-13-40' } });
  assert('invalid amount rejected', invalid.status === 400);

  const updated = await api('PUT', `/api/transactions/${tx1.json.data.transaction.id}`, { token, body: { amount: 320 } });
  assert('update transaction', updated.status === 200 && updated.json.data.transaction.amount === 320);

  const list = await api('GET', '/api/transactions?search=salary', { token });
  assert('search finds salary', list.status === 200 && list.json.data.items.length === 1);

  // 6. budgets
  const month = new Date().toISOString().slice(0, 7);
  const budget = await api('POST', '/api/budgets', { token, body: { category: 'Food', amount: 5000, month } });
  assert('create budget', budget.status === 201);
  const budgetDup = await api('POST', '/api/budgets', { token, body: { category: 'Food', amount: 100, month } });
  assert('duplicate budget rejected', budgetDup.status === 409);
  const budgets = await api('GET', '/api/budgets', { token });
  assert('budget status computed', budgets.status === 200 && budgets.json.data.items[0].status && budgets.json.data.items[0].spent === 320, JSON.stringify(budgets.json.data.items[0]?.status));

  // 7. analytics
  const overview = await api('GET', '/api/analytics/overview', { token });
  assert('overview', overview.status === 200 && overview.json.data.totals.income === 40000, `savingsRate=${overview.json.data.totals.savingsRate}`);
  const insights = await api('GET', '/api/analytics/insights', { token });
  assert('insights generated', insights.status === 200 && insights.json.data.insights.length > 0, `${insights.json.data.insights?.length} insights`);
  const health = await api('GET', '/api/analytics/financial-health', { token });
  assert('financial health', health.status === 200 && health.json.data.score !== undefined, `score=${health.json.data.score}`);

  // 8. authorization isolation: second user cannot access first user's transaction
  const other = await api('POST', '/api/auth/register', { body: { name: 'Other User', email: `other${unique}@test.com`, password: 'password123' } });
  const otherToken = other.json.data.token;
  const foreign = await api('GET', `/api/transactions/${tx1.json.data.transaction.id}`, { token: otherToken });
  assert('foreign transaction access blocked', foreign.status === 404);
  const foreignUpdate = await api('DELETE', `/api/transactions/${tx1.json.data.transaction.id}`, { token: otherToken });
  assert('foreign delete blocked', foreignUpdate.status === 404);

  // 9. delete own transaction
  const del = await api('DELETE', `/api/transactions/${tx1.json.data.transaction.id}`, { token });
  assert('delete own transaction', del.status === 200);

  // 10. recurring
  const rec = await api('POST', '/api/recurring', { token, body: { name: 'Netflix', amount: 649, frequency: 'monthly', category: 'Subscriptions', nextExpectedDate: '2026-11-01' } });
  assert('create recurring', rec.status === 201);
  const recList = await api('GET', '/api/recurring', { token });
  assert('recurring totals', recList.status === 200 && recList.json.data.totals.monthlyTotal === 649, `monthly=${recList.json.data.totals?.monthlyTotal}`);

  // 11. malformed id
  const badId = await api('GET', '/api/transactions/not-a-valid-id', { token });
  assert('malformed id handled', badId.status === 400);

  console.log('\nSmoke test complete.');
})().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
