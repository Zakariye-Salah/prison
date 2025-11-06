// backend/routes/criminals.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const Criminal = require('../models/Criminal');
const Room = require('../models/Room');
const Prison = require('../models/Prison');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { nextSeq } = require('../utils/counters');

const multer = require('multer');

// S3 optional
let upload;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// If S3 env vars present, use multer-s3
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_REGION = process.env.S3_REGION || '';
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || '';
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || '';

if (S3_BUCKET && S3_REGION && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
  // use S3
  const AWS = require('aws-sdk');
  const multerS3 = require('multer-s3');

  AWS.config.update({
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    region: S3_REGION
  });

  const s3 = new AWS.S3();

  const s3Storage = multerS3({
    s3,
    bucket: S3_BUCKET,
    acl: 'public-read',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      const ext = path.extname(file.originalname) || '';
      const filename = Date.now().toString(36) + '-' + crypto.randomBytes(6).toString('hex') + ext;
      cb(null, `uploads/${filename}`);
    }
  });

  upload = multer({
    storage: s3Storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads are allowed'), false);
      cb(null, true);
    }
  });

  console.log('Criminals uploads: using S3 storage ->', S3_BUCKET);
} else {
  // fallback: disk storage
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      const safe = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + ext;
      cb(null, safe);
    }
  });

  upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads are allowed'), false);
      cb(null, true);
    }
  });

  console.log('Criminals uploads: using disk storage ->', UPLOAD_DIR);
}

function normalizePhotoUrl(obj, req) {
  if (!obj) return obj;
  // allow using explicit PUBLIC_BACKEND setting to control the public-facing base URL
  const PUBLIC_BACKEND = process.env.PUBLIC_BACKEND || '';
  if (obj.photoUrl && typeof obj.photoUrl === 'string') {
    // if it's already an absolute URL, keep it
    if (obj.photoUrl.startsWith('http://') || obj.photoUrl.startsWith('https://')) {
      return obj;
    }
    // otherwise it's a relative path (e.g. /uploads/xxxx or uploads/xxx) -> build absolute URL
    let p = obj.photoUrl;
    if (!p.startsWith('/')) p = '/' + p;
    if (PUBLIC_BACKEND) {
      // ensure no trailing slash
      obj.photoUrl = PUBLIC_BACKEND.replace(/\/$/, '') + p;
    } else {
      // fallback to request host (may be localhost if not configured) 
      obj.photoUrl = `${req.protocol}://${req.get('host')}${p}`;
    }
  }
  return obj;
}


router.get('/', async (req, res) => {
  try {
    const { q, status, page = 1, perPage = 20, committedType, minAge, maxAge, includeDeleted, roomId, prisonId } = req.query;
    const query = (includeDeleted === '1' || includeDeleted === 'true') ? {} : { deletedAt: null };
    if (q) {
      query.$or = [
        { prisonId: new RegExp('^' + q, 'i') },
        { nationalId: new RegExp(q, 'i') },
        { fullName: new RegExp(q, 'i') }
      ];
    }
    if (status) query.status = status;
    if (committedType) query.committedType = committedType;
    if (roomId) query.roomId = roomId;
    if (prisonId) query.prisonRef = prisonId;
    if (minAge || maxAge) {
      const now = new Date();
      query.dob = {};
      if (minAge) query.dob.$lte = new Date(now.getFullYear() - Number(minAge), now.getMonth(), now.getDate());
      if (maxAge) query.dob.$gte = new Date(now.getFullYear() - Number(maxAge), now.getMonth(), now.getDate());
    }
    const skip = (Number(page) - 1) * Number(perPage);
    const docs = await Criminal.find(query).populate('roomId').populate('prisonRef').sort({ createdAt: -1 }).skip(skip).limit(Number(perPage));
    const out = docs.map(d => normalizePhotoUrl(d.toObject(), req));
    res.json({ criminals: out });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create
router.post('/', authMiddleware, requireRole('controller'), upload.single('photo'), async (req, res) => {
  try {
    const data = Object.assign({}, req.body);
    if (!data.fullName) return res.status(400).json({ error: 'fullName required' });

    if (data.fineAmount !== undefined) data.fineAmount = Number(data.fineAmount) || 0;
    if (data.timeHeldStart) data.timeHeldStart = new Date(data.timeHeldStart);
    if (data.releaseDate) data.releaseDate = new Date(data.releaseDate);
    if (data.roomId === '') data.roomId = null;
    if (data.prisonId) delete data.prisonId;
    if (data.prisonRef === '') data.prisonRef = null;

    // generate unique prisonId code for this criminal (DNB..)
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const seq = await nextSeq('prison-' + d.toISOString().slice(0,10), 3, '');
    const prisonId = 'DNB' + dd + mm + yy + seq;
    data.prisonId = prisonId;

    if (req.file) {
      // multer-s3 sets req.file.location ; disk sets req.file.filename
      if (req.file.location) data.photoUrl = req.file.location;
      else data.photoUrl = `/uploads/${req.file.filename}`;
    }

    if (!data.prisonRef) data.prisonRef = null;
    data.createdBy = req.user ? req.user._id : null;

    const c = await Criminal.create(data);
    const obj = normalizePhotoUrl(c.toObject(), req);
    const io = req.app.get('io');
    if (io) io.emit('criminal:created', obj);
    res.json({ ok: true, criminal: obj });
  } catch (err) {
    console.error('POST /api/criminals error', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update
router.put('/:id', authMiddleware, requireRole('controller'), upload.single('photo'), async (req, res) => {
  try {
    const data = Object.assign({}, req.body);
    if (data.fineAmount !== undefined) data.fineAmount = Number(data.fineAmount) || 0;
    if (data.timeHeldStart) data.timeHeldStart = new Date(data.timeHeldStart);
    if (data.releaseDate) data.releaseDate = new Date(data.releaseDate);
    if (data.roomId === '') data.roomId = null;
    if (data.prisonId) delete data.prisonId;
    if (data.prisonRef === '') data.prisonRef = null;
    if (req.file) {
      if (req.file.location) data.photoUrl = req.file.location;
      else data.photoUrl = `/uploads/${req.file.filename}`;
    }

    const c = await Criminal.findByIdAndUpdate(req.params.id, data, { new: true }).populate('roomId').populate('prisonRef');
    if (!c) return res.status(404).json({ error: 'Not found' });
    const obj = normalizePhotoUrl(c.toObject(), req);
    const io = req.app.get('io');
    if (io) io.emit('criminal:updated', obj);
    res.json({ ok: true, criminal: obj });
  } catch (err) {
    console.error('PUT /api/criminals/:id error', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const c = await Criminal.findById(req.params.id).populate('roomId').populate('prisonRef');
    if (!c) return res.status(404).json({ error: 'Not found' });
    const obj = normalizePhotoUrl(c.toObject(), req);
    if (obj.prisonRef && obj.prisonRef.name) obj.prisonName = obj.prisonRef.name;
    res.json({ criminal: obj });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// delete/restore/permanent as before...
router.delete('/:id', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    await Criminal.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/restore', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    await Criminal.findByIdAndUpdate(req.params.id, { deletedAt: null });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/permanent', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    await Criminal.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Status endpoint (keeps pausedRemainingMs handling)
router.post('/:id/status', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const { action } = req.body;
    const c = await Criminal.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });

    const now = Date.now();

    if (action === 'toggle') {
      if (c.status === 'in_prison') {
        if (c.releaseDate) {
          const remaining = new Date(c.releaseDate).getTime() - now;
          c.pausedRemainingMs = remaining > 0 ? remaining : 0;
        } else {
          c.pausedRemainingMs = 0;
        }
        c.releaseDate = null;
        c.status = 'out';
      } else {
        if (typeof c.pausedRemainingMs === 'number' && c.pausedRemainingMs > 0) {
          c.releaseDate = new Date(now + Number(c.pausedRemainingMs));
        }
        c.pausedRemainingMs = null;
        c.timeHeldStart = c.timeHeldStart || new Date();
        c.status = 'in_prison';
      }
    } else if (action === 'out') {
      if (c.releaseDate) {
        const remaining = new Date(c.releaseDate).getTime() - now;
        c.pausedRemainingMs = remaining > 0 ? remaining : 0;
      } else {
        c.pausedRemainingMs = 0;
      }
      c.releaseDate = null;
      c.status = 'out';
    } else if (action === 'dead') {
      c.pausedRemainingMs = null;
      c.releaseDate = null;
      c.status = 'dead';
    } else if (action === 'in_prison') {
      if (typeof c.pausedRemainingMs === 'number' && c.pausedRemainingMs > 0) {
        c.releaseDate = new Date(now + Number(c.pausedRemainingMs));
      }
      c.pausedRemainingMs = null;
      c.timeHeldStart = c.timeHeldStart || new Date();
      c.status = 'in_prison';
    } else if (['in_prison','out','dead'].includes(action)) {
      // handled above in specific branches
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    await c.save();

    const updated = await Criminal.findById(c._id).populate('roomId').populate('prisonRef');
    const obj = normalizePhotoUrl(updated.toObject(), req);

    const io = req.app.get('io');
    if (io) io.emit('criminal:status', obj);

    res.json({ ok: true, criminal: obj });
  } catch (err) {
    console.error('POST /api/criminals/:id/status error', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// payments endpoints unchanged...
router.post('/:id/payments', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const amount = Number(req.body.amount || 0);
    const paidBy = req.body.paidBy || 'unknown';
    const note = req.body.note || '';
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const c = await Criminal.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const paidSum = (c.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const remaining = (c.fineAmount || 0) - paidSum;
    if (amount > remaining) return res.status(400).json({ error: 'Amount exceeds remaining fine' });
    c.payments.push({ amount, paidBy, note });
    await c.save();
    res.json({ ok: true, criminal: c });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/payments/:paymentId', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const c = await Criminal.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    c.payments = c.payments.filter(p => p._id.toString() !== req.params.paymentId);
    await c.save();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
