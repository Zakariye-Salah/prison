const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RoomSchema = new Schema({
  roomId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  capacity: { type: Number, default: 0 },
  prisonRef: { type: mongoose.Types.ObjectId, ref: 'Prison', default: null },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);
