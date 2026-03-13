const express = require('express');
const router = express.Router();
const reportController = require('./report.controller');

router.get('/stock', reportController.getStockReport);

module.exports = router;