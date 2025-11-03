// backend/models/Criminal.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PaymentSchema = new Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  paidBy: { type: String },
  note: { type: String }
});

const CriminalSchema = new Schema({
  prisonId: { type: String, required: true, unique: true },
  nationalId: { type: String },
  fullName: { type: String, required: true },
  photoUrl: { type: String },
  roomId: { type: mongoose.Types.ObjectId, ref: 'Room', default: null },
  prisonRef: { type: mongoose.Types.ObjectId, ref: 'Prison', default: null }, // new - reference to Prison
  phone: { type: String },
  parentName: { type: String },
  parentPhone: { type: String },
  committedType: { type: String },
  committedTypeOther: { type: String },
  dob: { type: Date },
  gender: { type: String, enum: ['male','female'] },
  judgment: { type: String },
  overview: { type: String },
  status: { type: String, enum: ['not_sentenced','sentenced','in_prison','out','dead'], default: 'in_prison' },
  placeOfBirth: { type: String },
  timeHeldStart: { type: Date },
  pausedRemainingMs: { type: Number, default: null }, // ms left when someone is released (paused)
  releaseDate: { type: Date },
  fineAmount: { type: Number, default: 0 },
  payments: [PaymentSchema],
  createdBy: { type: mongoose.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null }
},{ timestamps: true });

CriminalSchema.virtual('age').get(function(){
  if(!this.dob) return null;
  const diff = Date.now() - this.dob.getTime();
  return Math.floor(diff / (365.25*24*3600*1000));
});
CriminalSchema.set('toJSON', { virtuals: true });
module.exports = mongoose.model('Criminal', CriminalSchema);
