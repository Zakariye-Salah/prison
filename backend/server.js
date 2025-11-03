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
// ...



const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// make uploads folder
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

// routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/prisons', require('./routes/prisons'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/criminals', require('./routes/criminals'));
app.use('/api/export', require('./routes/export'));
app.use('/api/dashboard', require('./routes/dashboard')); // if not already added

app.get('/api/health', (req, res) => res.json({ ok: true, now: new Date() }));

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/prison';
const PORT = process.env.PORT || 5000;

mongoose.connect(MONGO)
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
