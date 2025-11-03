// scripts/seed-admin.js
// Usage examples:
//   ADMIN_EMAIL=admin@local.com ADMIN_PASSWORD=MyPass123! ADMIN_SECRET_SEED=1234 node scripts/seed-admin.js
//   FORCE=true node scripts/seed-admin.js   -> force update existing controller
//
// This script will create (or optionally update) a controller user in your MongoDB.

const mongoose = require('mongoose');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const User = require('../models/User');        // adjust path if needed
const { nextSeq } = require('../utils/counters'); // adjust path if needed

async function normalizeEmail(e) {
  if (!e) return null;
  const s = String(e).trim();
  // If no @, append .local domain to avoid "invalid email" UI checks
  if (!s.includes('@')) return s + (s.endsWith('.') ? 'local.com' : '@local.com');
  return s;
}

async function run() {
  const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/prison';
  console.log('Connecting to MongoDB:', MONGO);
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    // allow overrides from env
    const envEmail = await normalizeEmail(process.env.ADMIN_EMAIL || 'admin@local.com');
    const envPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';
    const envSecret = process.env.ADMIN_SECRET_SEED;
    const force = String(process.env.FORCE || '').toLowerCase() === 'true';

    // ensure a 4-digit secret (use provided if valid, else generate)
    let secret;
    if (envSecret && /^\d{4}$/.test(String(envSecret))) secret = String(envSecret);
    else secret = String(Math.floor(1000 + Math.random() * 9000));

    // check existing controller user (search by role OR by email)
    let existing = await User.findOne({ role: 'controller' });

    if (existing && !force) {
      console.log('A controller already exists. Use FORCE=true to overwrite or set a different ADMIN_EMAIL.');
      console.log('Existing controller email:', existing.email);
      process.exit(0);
    }

    // prepare hashes
    const secretHash = await bcrypt.hash(secret, 10);
    const passwordHash = await bcrypt.hash(String(envPassword), 10);

    if (existing && force) {
      // update existing controller (email, password, secret)
      existing.email = envEmail;
      existing.passwordHash = passwordHash;
      existing.secretHash = secretHash;
      existing.fullName = existing.fullName || 'Admin';
      existing.disabled = false;
      await existing.save();
      console.log('Updated existing controller account:');
      console.log(' email:', existing.email);
      console.log(' password:', envPassword);
      console.log(' 4-digit admin secret:', secret);
      process.exit(0);
    }

    // create new userId with helper (falls back to timestamp if helper fails)
    let userId;
    try {
      userId = await nextSeq('user', 4, 'USR');
    } catch (err) {
      userId = 'USR' + Date.now().toString().slice(-8);
      console.warn('nextSeq failed, using fallback userId:', userId);
    }

    // create controller user
    const newUser = await User.create({
      userId,
      fullName: process.env.ADMIN_FULLNAME || 'Admin',
      email: envEmail,
      passwordHash,
      role: 'controller',
      secretHash,
      provider: 'local',
      disabled: false
    });

    console.log('Controller created successfully:');
    console.log(' email:', envEmail);
    console.log(' password:', envPassword);
    console.log(' 4-digit admin secret:', secret);
    process.exit(0);
  } catch (err) {
    console.error('Seed script error:', err);
    process.exit(1);
  } finally {
    // close connection
    // (process will exit anyway but close nicely)
    try { await mongoose.disconnect(); } catch(e) {}
  }
}

run();
