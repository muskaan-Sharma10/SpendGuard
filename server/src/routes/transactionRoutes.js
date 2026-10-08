'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/transactionController');

const router = express.Router();

// Every route below requires a valid JWT; handlers scope queries to req.user.
router.use(authenticate);

router.route('/').get(controller.list).post(controller.create);
router.route('/:id').get(controller.getOne).put(controller.update).delete(controller.remove);

module.exports = router;
