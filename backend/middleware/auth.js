// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Missing auth' });

  const parts = header.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Invalid auth header' });

  const token = parts[1];
  let data;
  try {
    data = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Reject temp tokens — temp tokens are only for admin-secret verification flow
  if (data && data.temp) return res.status(401).json({ error: 'Temp token not allowed for this endpoint' });

  try {
    const user = await User.findById(data.sub).select('-passwordHash -secretHash');
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.disabled) return res.status(403).json({ error: 'Account disabled' });
    req.user = user;
    next();
  } catch (err) {
    console.error('authMiddleware error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Auth required' });
    if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

module.exports = { authMiddleware, requireRole };
