'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/budgetController');

const router = express.Router();

router.use(authenticate);

router.route('/').get(controller.list).post(controller.create);
router.route('/:id').put(controller.update).delete(controller.remove);

module.exports = router;
