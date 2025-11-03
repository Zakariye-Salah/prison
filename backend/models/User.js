const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const UserSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },
  provider: { type: String, default: 'local' },
  role: { type: String, enum: ['controller','viewer'], default: 'viewer' },
  secretHash: { type: String },
  disabled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date }
});
module.exports = mongoose.model('User', UserSchema);
