// backend/routes/dashboard.js
const express = require('express');
const router = express.Router();
const Criminal = require('../models/Criminal');
const Room = require('../models/Room');
const User = require('../models/User'); // adjust path if needed
const mongoose = require('mongoose');

// optional auth
const { authMiddleware, requireRole } = require('../middleware/auth');

// Helper to compute start date for period
function startForPeriod(period) {
  const now = new Date();
  switch((period||'monthly').toLowerCase()) {
    case 'daily': { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }   // last 30 days
    case 'weekly': { const d = new Date(now); d.setDate(d.getDate() - (7 * 12)); return d; } // last 12 weeks
    case 'monthly': { const d = new Date(now); d.setMonth(d.getMonth() - 12); return d; } // last 12 months
    case 'yearly': { const d = new Date(now); d.setFullYear(d.getFullYear() - 5); return d; } // last 5 years
    case 'live': { const d = new Date(now); d.setDate(d.getDate() - 1); return d; } // last 24 hours
    default: { const d = new Date(now); d.setMonth(d.getMonth() - 12); return d; }
  }
}

// Map period -> dateTrunc unit and readable format
const PERIOD_CONFIG = {
  daily: { unit: 'day', fmt: date => date.toISOString().slice(0,10) },          // YYYY-MM-DD
  weekly: { unit: 'week', fmt: date => {
      // week label like YYYY-Wxx (simple): use ISO week derived from date
      const tmp = new Date(date);
      tmp.setHours(0,0,0,0);
      // Thursday-based ISO week calculation
      tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
      const week1 = new Date(tmp.getFullYear(),0,4);
      const weekNo = 1 + Math.round(((tmp - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
      return `${tmp.getFullYear()}-W${String(weekNo).padStart(2,'0')}`;
    }
  },
  monthly: { unit: 'month', fmt: date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}` }, // YYYY-MM
  yearly: { unit: 'year', fmt: date => `${date.getFullYear()}` }, // YYYY
  live: { unit: 'hour', fmt: date => date.toISOString().slice(0,13) + ':00' } // YYYY-MM-DDTHH:00
};

router.get('/', /* authMiddleware, requireRole('controller'), // uncomment if you want auth */ async (req, res) => {
  try {
    const period = (req.query.period || 'monthly').toLowerCase();
    const cfg = PERIOD_CONFIG[period] || PERIOD_CONFIG['monthly'];
    const start = startForPeriod(period);

    // Stats (counts)
    const [ totalCriminals, currentlyIn, totalRooms, totalUsers ] = await Promise.all([
      Criminal.countDocuments({ deletedAt: null }),
      Criminal.countDocuments({ deletedAt: null, status: 'in_prison' }),
      Room.countDocuments({ deletedAt: null }),
      User.countDocuments({})
    ]);

    // Chart aggregation: prefer $dateTrunc (Mongo >= 5.0). If server does not support $dateTrunc, fallback to $dateToString grouping.
    let chartLabels = [];
    let chartValues = [];

    const match = { deletedAt: null, createdAt: { $gte: start } };

    // try dateTrunc pipeline first
    try {
      const pipeline = [
        { $match: match },
        {
          $project: {
            truncated: {
              $dateTrunc: { date: "$createdAt", unit: cfg.unit, binSize: 1, timezone: "UTC" }
            }
          }
        },
        { $group: { _id: "$truncated", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ];

      const agg = await Criminal.aggregate(pipeline).allowDiskUse(true);
      chartLabels = agg.map(r => cfg.fmt(new Date(r._id)));
      chartValues = agg.map(r => r.count);
    } catch (errTrunc) {
      // fallback for older mongo: use dateToString formats (less precise for week)
      const fmt = (period === 'monthly') ? "%Y-%m" : (period === 'yearly') ? "%Y" : "%Y-%m-%d";
      const pipeline = [
        { $match: match },
        { $project: { ds: { $dateToString: { format: fmt, date: "$createdAt", timezone: "UTC" } } } },
        { $group: { _id: "$ds", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ];
      const agg = await Criminal.aggregate(pipeline).allowDiskUse(true);
      chartLabels = agg.map(r => r._id);
      chartValues = agg.map(r => r.count);
    }

    res.json({
      stats: {
        totalCriminals,
        currentlyIn,
        totalRooms,
        totalUsers
      },
      chart: {
        period,
        labels: chartLabels,
        values: chartValues
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

module.exports = router;
