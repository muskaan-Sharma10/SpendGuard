'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// --- security headers + parsing -------------------------------------------------
app.use(helmet());
app.use(express.json({ limit: '100kb' })); // body size cap — no unbounded payloads

// --- CORS ------------------------------------------------------------------------
// Cross-origin requests must come from the configured client origins
// (CLIENT_ORIGIN allow-list). Requests from this server's own origin are always
// allowed — that is the single-server deployment where Express serves the client
// itself, and same-origin is never a cross-origin risk by definition.
function corsOriginCheck(req, origin, callback) {
  if (!origin) return callback(null, true); // curl / server-to-server: no CORS to enforce
  if (env.clientOrigins.includes(origin)) return callback(null, true);
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  if (origin === `${proto}://${req.headers.host}`) return callback(null, true); // same origin
  return callback(new Error('Not allowed by CORS'));
}

app.use(
  cors((req, callback) => {
    const isApiRoute = req.url === '/api' || req.url.startsWith('/api/');
    callback(null, {
      origin: (origin, cb) => corsOriginCheck(req, origin, cb),
      credentials: true,
      ...(isApiRoute ? {} : { origin: false }), // non-API paths: no CORS headers, never rejected
    });
  })
);

app.use(morgan(env.isProduction ? 'combined' : 'dev'));
app.use('/api', apiLimiter);

app.use('/api', routes);

// --- single-server deployment (production only) ---------------------------------
// When NODE_ENV=production, serve the built React client (client/dist) from this
// same process with an SPA fallback: deep links like /dashboard or /analytics
// return index.html, while /api/* keeps its own 404/error handling below.
if (env.isProduction) {
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// 404 for unknown API routes, then centralised error handling.
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
