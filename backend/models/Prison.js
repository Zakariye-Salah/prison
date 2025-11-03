// backend/models/Prison.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PrisonSchema = new Schema({
  prisonId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  region: { type: String },
  district: { type: String },
  location: { type: String },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Prison', PrisonSchema);
