// routes/users.js  (append or merge into your existing router)
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { nextSeq } = require('../utils/counters');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// --- Public registration for normal users only ---
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) return res.status(400).json({ error: 'Missing required fields' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email exists' });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const userId = await nextSeq('user', 4, 'USR'); // reuse your helper
    const u = await User.create({
      userId,
      fullName,
      email,
      passwordHash,
      role: 'viewer',   // force viewer (normal user)
      provider: 'local'
    });

    // create token
    const token = jwt.sign({ sub: u._id, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, role: u.role, fullName: u.fullName });
  } catch (err) {
    console.error('Register error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Get current user (safe, authenticated) ---
router.get('/me', authMiddleware, async (req, res) => {
  // authMiddleware placed user on req.user (already sanitized in your auth middleware)
  const u = req.user;
  // send only safe fields
  res.json({
    id: u._id,
    userId: u.userId,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    provider: u.provider,
    createdAt: u.createdAt
  });
});

// --- Update current user (self-update) ---
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const u = req.user;
    const updates = {};
    if (req.body.fullName) updates.fullName = req.body.fullName;
    if (req.body.userId) updates.userId = req.body.userId; // be careful: ensure unique elsewhere or check here
    if (req.body.email) updates.email = req.body.email;

    if (req.body.password) {
      updates.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    }

    // allow controllers to change secret number (store hashed)
    if (u.role === 'controller' && req.body.secret) {
      updates.secretHash = await bcrypt.hash(String(req.body.secret), 10);
    }

    const updated = await User.findByIdAndUpdate(u._id, updates, { new: true }).select('-passwordHash -secretHash');
    res.json({ ok: true, user: updated });
  } catch (err) {
    console.error('Update /me error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// list (Controller only)
// replace existing list route with this
router.get('/', authMiddleware, requireRole('controller'), async (req, res) => {
  // return only users that have provider === 'local' (registered in this app)
  const users = await User.find({ provider: 'local' }).select('-passwordHash -secretHash');
  res.json({ users });
});


// create user (controller)
// create user (controller)
router.post('/', authMiddleware, requireRole('controller'), async (req, res) => {
  const { fullName, email, password, role, secret } = req.body;
  if (!fullName || !email) return res.status(400).json({ error: 'Missing' });
  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: 'Email exists' });
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
  const secretHash = role === 'controller' && secret ? await bcrypt.hash(String(secret), 10) : undefined;
  const userId = await nextSeq('user', 4, 'USR');
  const u = await User.create({ userId, fullName, email, passwordHash, role, secretHash });
  res.json({ ok: true, user: { id: u._id, userId: u.userId, email: u.email, role: u.role } });
});


// update and soft-delete
router.put('/:id', authMiddleware, requireRole('controller'), async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-passwordHash -secretHash');
  res.json({ ok: true, user: u });
});

router.delete('/:id', authMiddleware, requireRole('controller'), async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { disabled: true });
  res.json({ ok: true });
});

module.exports = router;
