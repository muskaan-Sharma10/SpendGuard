'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/analyticsController');

const router = express.Router();

router.use(authenticate);

router.get('/overview', controller.overview);
router.get('/trends', controller.trends);
router.get('/categories', controller.categories);
router.get('/insights', controller.insights);
router.get('/financial-health', controller.financialHealth);

module.exports = router;
