// backend/routes/rooms.js
const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Criminal = require('../models/Criminal');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { nextSeq } = require('../utils/counters');

// GET rooms (includes non-deleted by default)
// optional ?prisonId=<prisonObjectId>
router.get('/', async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const prisonId = req.query.prisonId; // optional prison filter
    const query = includeDeleted ? {} : { deletedAt: null };
    if (prisonId) query.prisonRef = prisonId;
    const rooms = await Room.find(query).populate('prisonRef').sort({ createdAt: -1 });
    res.json({ rooms });
  } catch (err) {
    console.error('GET /api/rooms error', err);
    res.status(500).json({ error: err.message });
  }
});

// POST create
router.post('/', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const { name, capacity, prisonRef } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    // generate unique roomId
    const seq = await nextSeq('room', 4, '');
    const roomId = 'RM' + seq;

    const room = await Room.create({ roomId, name, capacity: capacity ? Number(capacity) : 0, prisonRef: prisonRef || null });
    res.json({ ok: true, room });
  } catch (err) {
    console.error('POST /api/rooms error', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update
router.put('/:id', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const { name, capacity, prisonRef } = req.body;
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { name, capacity: capacity ? Number(capacity) : 0, prisonRef: prisonRef || null },
      { new: true }
    ).populate('prisonRef');
    if (!room) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, room });
  } catch (err) {
    console.error('PUT /api/rooms/:id error', err);
    res.status(500).json({ error: err.message });
  }
});

// soft delete
router.delete('/:id', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    await Room.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/rooms/:id error', err);
    res.status(500).json({ error: err.message });
  }
});

// restore
router.post('/:id/restore', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    await Room.findByIdAndUpdate(req.params.id, { deletedAt: null });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/rooms/:id/restore error', err);
    res.status(500).json({ error: err.message });
  }
});

// permanent delete
router.delete('/:id/permanent', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const assigned = await Criminal.findOne({ roomId: req.params.id, deletedAt: null });
    if (assigned) return res.status(400).json({ error: 'Room not empty. Reassign or remove criminals first.' });
    await Room.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/rooms/:id/permanent error', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
