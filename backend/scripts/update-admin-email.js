// scripts/update-admin-email.js
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

async function run(){
  const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/prison';
  await mongoose.connect(MONGO, { useNewUrlParser:true, useUnifiedTopology:true });
  const admin = await User.findOne({ role: 'controller' });
  if(!admin){ console.log('No controller found'); process.exit(1); }
  admin.email = process.env.ADMIN_EMAIL || 'admin@local.com';
  await admin.save();
  console.log('Updated controller email to', admin.email);
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e=>{ console.error(e); process.exit(1); });
