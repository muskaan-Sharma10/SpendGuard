'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/authController');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.me);
router.put('/', controller.updateProfile);

module.exports = router;
