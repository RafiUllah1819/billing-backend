const express = require('express');
const { login, getProfile } = require('./auth.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', login);
router.get('/me', authMiddleware, getProfile);

module.exports = router;