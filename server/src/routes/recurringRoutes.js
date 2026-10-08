'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/recurringController');

const router = express.Router();

router.use(authenticate);

// Detection must be declared before /:id so "detect" is not treated as an id.
router.get('/detect', controller.detect);
router.route('/').get(controller.list).post(controller.create);
router.route('/:id').put(controller.update).delete(controller.remove);

module.exports = router;
