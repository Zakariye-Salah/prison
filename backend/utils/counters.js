const Counter = require('../models/Counter');

async function nextSeq(key, digits=4, prefix='') {
  const doc = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = doc.seq;
  return prefix + String(seq).padStart(digits, '0');
}

module.exports = { nextSeq };
