const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const AuditLog = new Schema({
  action: String,
  entity: String,
  entityId: Schema.Types.Mixed,
  byUser: { type: Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now },
  meta: Schema.Types.Mixed
});
module.exports = mongoose.model('AuditLog', AuditLog);
