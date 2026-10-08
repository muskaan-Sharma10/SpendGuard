'use strict';

/* eslint-disable no-console */
/**
 * Seed runner.
 *
 *   npm run seed          → create/refresh the demo account and its data
 *   npm run seed:fresh    → drop the demo account's data first
 *
 * The demo account is intentionally identifiable as demo data:
 *   email:    demo@spendguard.app
 *   password: Demo@12345
 */

const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const RecurringExpense = require('../models/RecurringExpense');
const Insight = require('../models/Insight');
const { generateTransactions, generateBudgets, MONTHS_OF_HISTORY } = require('./demoData');

const DEMO_EMAIL = 'demo@spendguard.app';
const DEMO_PASSWORD = 'Demo@12345';

async function seed({ fresh = false } = {}) {
  await connectDB();

  let user = await User.findOne({ email: DEMO_EMAIL });
  if (!user) {
    user = await User.create({
      name: 'Demo Student',
      email: DEMO_EMAIL,
      passwordHash: await User.hashPassword(DEMO_PASSWORD),
      profile: {
        currency: 'INR',
        monthlyIncome: 42000,
        monthlySavingsTarget: 8000,
        targetSavingsRate: 20,
        riskPreference: 'balanced',
        preferredCategories: ['Food', 'Transport', 'Bills', 'Groceries'],
      },
    });
    console.log(`✓ Created demo user ${DEMO_EMAIL}`);
  } else {
    console.log(`• Demo user ${DEMO_EMAIL} already exists — refreshing its data`);
  }

  if (fresh) {
    await Promise.all([
      Transaction.deleteMany({ userId: user._id }),
      Budget.deleteMany({ userId: user._id }),
      RecurringExpense.deleteMany({ userId: user._id }),
      Insight.deleteMany({ userId: user._id }),
    ]);
    console.log('✓ Cleared existing demo data');
  } else {
    // Idempotent refresh: clear only the derived/seedable collections.
    await Promise.all([
      Transaction.deleteMany({ userId: user._id }),
      Budget.deleteMany({ userId: user._id }),
      RecurringExpense.deleteMany({ userId: user._id }),
      Insight.deleteMany({ userId: user._id }),
    ]);
  }

  const transactions = generateTransactions();
  await Transaction.insertMany(
    transactions.map((t) => ({ ...t, userId: user._id })),
    { ordered: false }
  );
  console.log(`✓ Inserted ${transactions.length} demo transactions across ${MONTHS_OF_HISTORY} months`);

  const budgets = generateBudgets();
  await Budget.insertMany(budgets.map((b) => ({ ...b, userId: user._id })), { ordered: false });
  console.log(`✓ Inserted ${budgets.length} demo budgets for the current month`);

  // Recurring expenses are detected by the engine itself — the seed does not
  // hard-code them, which doubles as a live demonstration of detection.
  const engine = require('../analytics/SpendingIntelligenceEngine');
  const recurringService = require('../services/recurringService');
  const detection = engine.detectRecurringExpenses({
    transactions: await Transaction.find({ userId: user._id, type: 'expense' }).lean(),
    minDaysForRecurring: 60,
  });
  await Promise.all(
    detection.committed.map((c) =>
      RecurringExpense.create({
        userId: user._id,
        name: c.name,
        amount: c.amount,
        frequency: c.frequency,
        category: c.category,
        paymentMethod: c.paymentMethod,
        merchant: c.merchant,
        nextExpectedDate: new Date(c.nextExpectedDate),
        status: 'active',
        source: 'detected',
        evidence: { occurrenceCount: c.occurrenceCount, detectedAt: new Date() },
      })
    )
  );
  const totals = recurringService.computeTotals(await recurringService.listRecurring(user._id));
  console.log(
    `✓ Detected ${detection.committed.length} recurring expenses → ₹${totals.monthlyTotal}/month, ₹${totals.annualTotal}/year`
  );

  console.log('\nDemo credentials (fictional data):');
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);

  await disconnectDB();
}

if (require.main === module) {
  const fresh = process.argv.includes('--fresh');
  seed({ fresh })
    .then(() => {
      console.log('\nSeed complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = { seed, DEMO_EMAIL, DEMO_PASSWORD };
