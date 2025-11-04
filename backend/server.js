// backend/server.js
'use strict';
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const criminalRoutes = require('./routes/criminals');
const roomRoutes = require('./routes/rooms');
const dashboardRoutes = require('./routes/dashboard');
const exportRoutes = require('./routes/export');
const prisonRoutes = require('./routes/prisons');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');

// CORS origin: read from CORS_ORIGIN env. Can be '*' or a single origin or comma-separated list.
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
function corsOriginChecker(origin, callback) {
  // allow requests with no origin (curl, server-to-server)
  if (!origin) return callback(null, true);

  if (CORS_ORIGIN === '*') return callback(null, true);

  // support comma-separated list
  const allowed = Array.isArray(CORS_ORIGIN) ? CORS_ORIGIN : String(CORS_ORIGIN).split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return callback(null, true);

  return callback(new Error('Not allowed by CORS'));
}

app.use(cors({
  origin: corsOriginChecker,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true
}));

// create socket.io with the same origin check
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      // socket.io passes origin or undefined
      try { corsOriginChecker(origin, cb); } catch (e) { cb(null, false); }
    },
    methods: ['GET','POST']
  }
});
app.set('io', io);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// uploads dir (disk fallback)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/prisons', prisonRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/criminals', criminalRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, now: new Date() }));

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/prison';
const PORT = process.env.PORT || 5000;

mongoose.connect(MONGO, { })
  .then(()=> {
    console.log('Mongo connected');
    server.listen(PORT, ()=> console.log('Server running on', PORT));
  })
  .catch(err => {
    console.error('Mongo connection error:', err.message);
    process.exit(1);
  });

// socket heartbeat
setInterval(()=>{
  io.emit('server:heartbeat', { t: new Date() });
}, 60000);

// graceful error handler for CORS
app.use((err, req, res, next) => {
  if (err && /cors/i.test(err.message || '')) return res.status(403).json({ error: 'CORS blocked request' });
  next(err);
});
