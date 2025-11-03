// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// POST /auth/login
// Accepts: { email, password, secret? }
// If user is controller and has a secretHash and no secret provided -> returns { requiresAdminSecret: true, tempToken }
// If secret provided and correct -> returns token
router.post('/login', async (req, res) => {
  try {
    const { email, password, secret } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    if (user.disabled) return res.status(403).json({ error: 'Disabled' });

    const ok = await bcrypt.compare(String(password), user.passwordHash || '');
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

    // If controller & has secretHash -> require secret verification
    if (user.role === 'controller' && user.secretHash) {
      // if secret provided in same request -> verify and issue final token
      if (typeof secret !== 'undefined') {
        if (!/^\d{4}$/.test(String(secret))) return res.status(400).json({ error: 'Secret must be 4 digits' });
        const sOk = await bcrypt.compare(String(secret), user.secretHash);
        if (!sOk) return res.status(403).json({ error: 'Invalid secret' });
        // success -> issue token
        const token = jwt.sign({ sub: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        user.lastLogin = new Date();
        await user.save();
        return res.json({ token, role: user.role, fullName: user.fullName });
      }
      // no secret in request -> issue short tempToken so frontend can prompt secret
      const tempToken = jwt.sign({ sub: user._id, temp: true }, JWT_SECRET, { expiresIn: '10m' });
      return res.json({ requiresAdminSecret: true, tempToken });
    }

    // non-controller or controller without secretHash -> straight token
    const token = jwt.sign({ sub: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    user.lastLogin = new Date();
    await user.save();
    res.json({ token, role: user.role, fullName: user.fullName });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/verify-admin-secret
// { tempToken, secret } -> returns token if valid
router.post('/verify-admin-secret', async (req, res) => {
  try {
    const { tempToken, secret } = req.body || {};
    if (!tempToken || !secret) return res.status(400).json({ error: 'Missing' });

    // validate format quickly
    if (!/^\d{4}$/.test(String(secret))) return res.status(400).json({ error: 'Secret must be 4 digits' });

    let payload;
    try { payload = jwt.verify(tempToken, JWT_SECRET); } catch (e) { return res.status(400).json({ error: 'Invalid/expired temp token' }); }
    if (!payload || !payload.sub || !payload.temp) return res.status(400).json({ error: 'Invalid temp token' });

    const user = await User.findById(payload.sub);
    if (!user || user.role !== 'controller') return res.status(400).json({ error: 'Invalid user' });

    const ok = await bcrypt.compare(String(secret), user.secretHash || '');
    if (!ok) return res.status(403).json({ error: 'Invalid secret' });

    const token = jwt.sign({ sub: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    user.lastLogin = new Date();
    await user.save();
    res.json({ token, role: user.role, fullName: user.fullName });
  } catch (err) {
    console.error('verify-admin-secret', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
