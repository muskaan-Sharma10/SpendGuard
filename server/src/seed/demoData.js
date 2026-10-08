'use strict';

/**
 * Deterministic demo dataset generator.
 *
 * ALL DATA IS FICTIONAL. It describes a plausible Indian student/young
 * professional so that every SpendGuard feature has something real to compute
 * from: category trends, budget overruns, recurring subscriptions,
 * micro-spending leakage, weekend-heavy behaviour and a savings trend.
 *
 * A seeded PRNG (mulberry32) makes the dataset reproducible: re-running the
 * seed produces the same numbers, which matters for demos and for tests.
 */

const MONTHS_OF_HISTORY = 6;
const MICRO_MERCHANTS = ['Cafe Mocha', 'Corner Chai', 'Campus Canteen', 'Bakery Lane', 'Snack Junction', 'Juice Bar'];
const FOOD_MERCHANTS = ['Cafe Mocha', 'Corner Chai', 'Campus Canteen', 'Biryani House', 'Snack Junction'];
const TRANSPORT_MERCHANTS = ['Metro Card', 'Auto Rickshaw', 'City Bus', 'Rapido Bike'];
const GROCERY_MERCHANTS = ['FreshMart', 'Daily Needs Store', 'BigBasket'];
const SHOPPING_MERCHANTS = ['Amazon', 'Myntra', 'Decathlon', 'Flipkart'];
const ENTERTAINMENT_MERCHANTS = ['PVR Cinemas', 'BookMyShow', 'Steam', 'Gaming Cafe'];
const EDUCATION_MERCHANTS = ['Udemy', 'Coursera', 'Campus Bookstore'];
const HEALTHCARE_MERCHANTS = ['Apollo Pharmacy', 'City Clinic'];
const PERSONAL_CARE_MERCHANTS = ['Style Salon', 'Nykaa'];
const TRAVEL_MERCHANTS = ['IRCTC', 'OYO Rooms', 'RedBus'];
const PAYMENT_METHODS = ['UPI', 'UPI', 'UPI', 'Cash', 'Debit Card', 'Credit Card'];

function mulberry32(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
const pick = (random, arr) => arr[Math.floor(random() * arr.length)];
const between = (random, min, max) => min + random() * (max - min);
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const daysInMonthOf = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/**
 * Builds transactions for `months` full months ending with the current
 * (partially elapsed) month.
 */
function generateTransactions({ now = new Date(), seed = 20261006 } = {}) {
  const random = mulberry32(seed);
  const transactions = [];
  const todayDay = now.getUTCDate();
  const todayMonth = now.getUTCMonth();
  const todayYear = now.getUTCFullYear();

  for (let back = MONTHS_OF_HISTORY - 1; back >= 0; back -= 1) {
    const monthDate = new Date(Date.UTC(todayYear, todayMonth - back, 1));
    const y = monthDate.getUTCFullYear();
    const m = monthDate.getUTCMonth();
    const isCurrentMonth = back === 0;
    const lastDay = isCurrentMonth ? todayDay : daysInMonthOf(y, m);
    const monthIndex = MONTHS_OF_HISTORY - 1 - back; // 0 = oldest
    const growth = 1 + monthIndex * 0.04; // gentle inflation/growth of discretionary spend

    const day = (d) => iso(new Date(Date.UTC(y, m, Math.min(d, lastDay))));
    const push = (tx) => {
      if (tx.day <= lastDay) transactions.push({ ...tx, date: day(tx.day) });
    };

    // The current month is only partially elapsed. Counting is scaled by the
    // elapsed fraction so the month shows a realistic PACE (which is exactly
    // what the projection engine measures) instead of a full month's spending
    // crammed into the first few days.
    const elapsedFraction = isCurrentMonth ? lastDay / daysInMonthOf(y, m) : 1;
    const scaled = (n) => Math.max(0, Math.round(n * elapsedFraction));
    const scaledAtLeast = (n, min) => Math.max(min, scaled(n));

    // ---- income -----------------------------------------------------------
    push({ amount: 42000, type: 'income', category: 'Other', subcategory: 'Salary', merchant: 'TechNova Systems', note: 'Monthly salary', paymentMethod: 'Bank Transfer', day: 1 });
    if (random() > 0.5) {
      push({ amount: round2(between(random, 2500, 6000)), type: 'income', category: 'Other', subcategory: 'Freelance', merchant: 'Upwork Client', note: 'Freelance project payment', paymentMethod: 'Bank Transfer', day: Math.floor(between(random, 12, 24)) });
    }

    // ---- recurring commitments (same merchant + amount each month) --------
    push({ amount: 649, type: 'expense', category: 'Subscriptions', subcategory: 'Streaming', merchant: 'Netflix', paymentMethod: 'Credit Card', isRecurring: true, recurringFrequency: 'monthly', day: 5 });
    push({ amount: 119, type: 'expense', category: 'Subscriptions', subcategory: 'Music', merchant: 'Spotify', paymentMethod: 'UPI', isRecurring: true, recurringFrequency: 'monthly', day: 7 });
    push({ amount: 1200, type: 'expense', category: 'Healthcare', subcategory: 'Fitness', merchant: 'FitLife Gym', paymentMethod: 'UPI', isRecurring: true, recurringFrequency: 'monthly', day: 3 });
    push({ amount: 999, type: 'expense', category: 'Bills', subcategory: 'Internet', merchant: 'Airtel Fiber', paymentMethod: 'UPI', isRecurring: true, recurringFrequency: 'monthly', day: 10 });
    push({ amount: 299, type: 'expense', category: 'Bills', subcategory: 'Mobile', merchant: 'Jio Recharge', paymentMethod: 'UPI', isRecurring: true, recurringFrequency: 'monthly', day: 14 });
    push({ amount: 149, type: 'expense', category: 'Subscriptions', subcategory: 'Software', merchant: 'Google One', paymentMethod: 'Credit Card', isRecurring: true, recurringFrequency: 'monthly', day: 21 });

    // ---- bills with seasonal variation -----------------------------------
    push({ amount: round2(between(random, 700, 1500)), type: 'expense', category: 'Bills', subcategory: 'Electricity', merchant: 'State Electricity Board', paymentMethod: 'UPI', day: 12 });
    push({ amount: round2(between(random, 3200, 4200)), type: 'expense', category: 'Bills', subcategory: 'Rent', merchant: 'Landlord', note: 'Room rent share', paymentMethod: 'Bank Transfer', day: 2 });

    // ---- micro-spending leakage (many small food/snack purchases) --------
    const microCount = scaledAtLeast(between(random, 40, 52), 3);
    for (let i = 0; i < microCount; i += 1) {
      const d = 1 + Math.floor(random() * lastDay);
      const weekendBoost = [0, 6].includes(new Date(Date.UTC(y, m, d)).getUTCDay()) ? 1.3 : 1;
      push({
        amount: round2(between(random, 20, 190) * weekendBoost),
        type: 'expense',
        category: 'Food',
        subcategory: 'Snacks',
        merchant: pick(random, MICRO_MERCHANTS),
        paymentMethod: pick(random, PAYMENT_METHODS),
        day: d,
      });
    }

    // ---- regular food (meals out) ---------------------------------------
    const mealCount = scaledAtLeast(between(random, 8, 11) * growth, 2);
    for (let i = 0; i < mealCount; i += 1) {
      push({
        amount: round2(between(random, 240, 620)),
        type: 'expense',
        category: 'Food',
        subcategory: 'Dining out',
        merchant: pick(random, FOOD_MERCHANTS),
        paymentMethod: pick(random, PAYMENT_METHODS),
        day: 1 + Math.floor(random() * lastDay),
      });
    }

    // ---- groceries -------------------------------------------------------
    const groceryCount = scaledAtLeast(between(random, 3, 5), 1);
    for (let i = 0; i < groceryCount; i += 1) {
      push({
        amount: round2(between(random, 700, 1400)),
        type: 'expense',
        category: 'Groceries',
        merchant: pick(random, GROCERY_MERCHANTS),
        paymentMethod: pick(random, PAYMENT_METHODS),
        day: 1 + Math.floor(random() * lastDay),
      });
    }

    // ---- transport -------------------------------------------------------
    const transportCount = scaledAtLeast(between(random, 9, 13), 1);
    for (let i = 0; i < transportCount; i += 1) {
      push({
        amount: round2(between(random, 40, 260)),
        type: 'expense',
        category: 'Transport',
        merchant: pick(random, TRANSPORT_MERCHANTS),
        paymentMethod: pick(random, PAYMENT_METHODS),
        day: 1 + Math.floor(random() * lastDay),
      });
    }

    // ---- shopping: deliberately rising month over month -------------------
    const shoppingCount = scaledAtLeast(between(random, 2, 4) * (1 + monthIndex * 0.12), 1);
    for (let i = 0; i < shoppingCount; i += 1) {
      push({
        amount: round2(between(random, 700, 1600) * (1 + monthIndex * 0.08)),
        type: 'expense',
        category: 'Shopping',
        subcategory: 'Online',
        merchant: pick(random, SHOPPING_MERCHANTS),
        paymentMethod: 'Credit Card',
        day: 1 + Math.floor(random() * lastDay),
      });
    }

    // ---- entertainment: weekend heavy ------------------------------------
    const entCount = scaledAtLeast(between(random, 3, 5), 1);
    for (let i = 0; i < entCount; i += 1) {
      const weekendDay = [1, 2, 8, 9, 15, 16, 22, 23, 29, 30][Math.floor(random() * 10)];
      push({
        amount: round2(between(random, 300, 900)),
        type: 'expense',
        category: 'Entertainment',
        subcategory: 'Movies & games',
        merchant: pick(random, ENTERTAINMENT_MERCHANTS),
        paymentMethod: pick(random, PAYMENT_METHODS),
        day: weekendDay,
      });
    }

    // ---- education -------------------------------------------------------
    if (random() > 0.35) {
      push({ amount: round2(between(random, 500, 2600)), type: 'expense', category: 'Education', subcategory: 'Courses', merchant: pick(random, EDUCATION_MERCHANTS), paymentMethod: 'Credit Card', day: 1 + Math.floor(random() * lastDay) });
    }

    // ---- healthcare (occasional) ----------------------------------------
    if (random() > 0.6) {
      push({ amount: round2(between(random, 250, 1800)), type: 'expense', category: 'Healthcare', subcategory: 'Pharmacy', merchant: pick(random, HEALTHCARE_MERCHANTS), paymentMethod: pick(random, PAYMENT_METHODS), day: 1 + Math.floor(random() * lastDay) });
    }

    // ---- personal care ---------------------------------------------------
    if (random() > 0.55) {
      push({ amount: round2(between(random, 300, 1500)), type: 'expense', category: 'Personal Care', merchant: pick(random, PERSONAL_CARE_MERCHANTS), paymentMethod: pick(random, PAYMENT_METHODS), day: 1 + Math.floor(random() * lastDay) });
    }

    // ---- travel (rare, one month heavy) ----------------------------------
    if (back === 2) {
      push({ amount: 4200, type: 'expense', category: 'Travel', subcategory: 'Train', merchant: 'IRCTC', note: 'Trip home', paymentMethod: 'UPI', day: 18 });
      push({ amount: 2600, type: 'expense', category: 'Travel', subcategory: 'Stay', merchant: 'OYO Rooms', paymentMethod: 'Credit Card', day: 19 });
    } else if (random() > 0.75) {
      push({ amount: round2(between(random, 400, 2200)), type: 'expense', category: 'Travel', merchant: pick(random, TRAVEL_MERCHANTS), paymentMethod: pick(random, PAYMENT_METHODS), day: 1 + Math.floor(random() * lastDay) });
    }
  }

  return transactions.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Budgets for the CURRENT month, tuned so the demo shows every status:
 * one RED (projected overrun), one YELLOW (approaching) and GREEN budgets.
 */
function generateBudgets({ now = new Date() } = {}) {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return [
    { category: 'Food', amount: 5500, month, note: 'Meals, snacks and dining out' },
    { category: 'Groceries', amount: 4500, month, note: 'Monthly ration and essentials' },
    { category: 'Transport', amount: 2500, month, note: 'Metro, autos and cabs' },
    { category: 'Shopping', amount: 4000, month, note: 'Online and retail purchases' },
    { category: 'Entertainment', amount: 3000, month, note: 'Movies, games and outings' },
    { category: 'Bills', amount: 7000, month, note: 'Rent, electricity, internet, mobile' },
  ];
}

module.exports = { generateTransactions, generateBudgets, MONTHS_OF_HISTORY };
