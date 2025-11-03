// backend/routes/prisons.js
const express = require('express');
const router = express.Router();
const Prison = require('../models/Prison');
const Criminal = require('../models/Criminal');
const Room = require('../models/Room');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { nextSeq } = require('../utils/counters');

// GET /api/prisons?includeDeleted=1&includeCounts=1
router.get('/', async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const includeCounts = req.query.includeCounts === '1' || req.query.includeCounts === 'true';
    const query = includeDeleted ? {} : { deletedAt: null };
    const prisons = await Prison.find(query).sort({ createdAt: -1 });

    if (!includeCounts) return res.json({ prisons });

    // compute counts per prison (concurrent)
    const out = await Promise.all(prisons.map(async p => {
      const totalCriminals = await Criminal.countDocuments({ prisonRef: p._id, deletedAt: null });
      const totalRooms = await Room.countDocuments({ prisonRef: p._id, deletedAt: null });
      return Object.assign(p.toObject(), { totalCriminals, totalRooms });
    }));
    res.json({ prisons: out });
  } catch (err) {
    console.error('GET /api/prisons error', err);
    res.status(500).json({ error: err.message });
  }
});

// GET single prison with rooms and counts (useful for "View" button)
router.get('/:id', async (req, res) => {
  try {
    const p = await Prison.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });

    // rooms for this prison, include count of criminals per room
    const rooms = await Room.find({ prisonRef: p._id, deletedAt: null }).sort({ createdAt: -1 });
    const roomsWithCounts = await Promise.all(rooms.map(async r => {
      const count = await Criminal.countDocuments({ roomId: r._id, deletedAt: null });
      return Object.assign(r.toObject(), { totalCriminals: count });
    }));

    // total criminals in prison
    const totalCriminals = await Criminal.countDocuments({ prisonRef: p._id, deletedAt: null });
    const totalRooms = rooms.length;

    res.json({ prison: p.toObject(), rooms: roomsWithCounts, totalCriminals, totalRooms });
  } catch (err) {
    console.error('GET /api/prisons/:id error', err);
    res.status(500).json({ error: err.message });
  }
});

// POST create
router.post('/', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const { name, region, district, location } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const seq = await nextSeq('prison', 4, '');
    const prisonId = 'PRN' + seq;
    const p = await Prison.create({ prisonId, name, region, district, location });
    res.json({ ok: true, prison: p });
  } catch (err) {
    console.error('POST /api/prisons error', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update
router.put('/:id', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const { name, region, district, location } = req.body;
    const p = await Prison.findByIdAndUpdate(req.params.id, { name, region, district, location }, { new: true });
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, prison: p });
  } catch (err) {
    console.error('PUT /api/prisons/:id error', err);
    res.status(500).json({ error: err.message });
  }
});

// soft delete
router.delete('/:id', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    await Prison.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/prisons/:id error', err);
    res.status(500).json({ error: err.message });
  }
});

// restore
router.post('/:id/restore', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    await Prison.findByIdAndUpdate(req.params.id, { deletedAt: null });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/prisons/:id/restore error', err);
    res.status(500).json({ error: err.message });
  }
});

// permanent delete — prevent deletion if criminals assigned (use prisonRef)
router.delete('/:id/permanent', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const assigned = await Criminal.findOne({ prisonRef: req.params.id, deletedAt: null });
    if (assigned) return res.status(400).json({ error: 'Prison has assigned criminals. Reassign or remove first.' });
    // delete rooms attached to this prison? we keep safe: require manual cleanup or add cascade here if desired.
    await Prison.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/prisons/:id/permanent error', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
