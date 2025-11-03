now i want to our app in online using for frontend netlify and backend github so we use leter for the render.com as backend 

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



// frontend/js/api.js
(function(){
  // dev port used when running frontend via live-server and backend separate
  const DEV_BACKEND_PORT = 5002;
  const isLocalhost = ['localhost','127.0.0.1'].includes(window.location.hostname);
  const servedFromDevServer = isLocalhost && window.location.port && window.location.port !== String(DEV_BACKEND_PORT);
  const API_ROOT = (servedFromDevServer ? `${window.location.protocol}//${window.location.hostname}:${DEV_BACKEND_PORT}/api` : '/api');

  // BACKEND_BASE is origin + optional dev port (no trailing /api)
  const BACKEND_BASE = servedFromDevServer ? `${window.location.protocol}//${window.location.hostname}:${DEV_BACKEND_PORT}` : window.location.origin;

  function getAuthToken(){ return localStorage.getItem('token'); }
  function setAuthToken(t){ if(t) localStorage.setItem('token', t); else localStorage.removeItem('token'); }

  async function parseResponse(res){
    const ct = res.headers.get('content-type') || '';
    let body = null;
    try {
      if (ct.includes('application/json')) body = await res.json();
      else body = await res.text();
    } catch(e){ body = null; }
    if (res.ok) return body;
    const msg = (body && (body.error || body.message || body.msg)) || (typeof body === 'string' ? body : `HTTP ${res.status}`);
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  function prepareRequestOptions(opts){
    opts = Object.assign({}, opts);
    opts.headers = opts.headers ? Object.assign({}, opts.headers) : {};
    const body = opts.body;
    // do not stringify FormData or Blob
    if (body && !(body instanceof FormData) && !(body instanceof Blob) && typeof body === 'object') {
      if (!opts.headers['Content-Type'] && !opts.headers['content-type']) {
        opts.headers['Content-Type'] = 'application/json';
      }
      if (opts.headers['Content-Type'].includes('application/json') && typeof opts.body !== 'string') {
        opts.body = JSON.stringify(opts.body);
      }
    }
    return opts;
  }

  async function fetchRaw(url, opts = {}, timeoutMs = 30000){
    opts = Object.assign({}, opts);
    opts.headers = opts.headers ? Object.assign({}, opts.headers) : {};
    const controller = new AbortController();
    const id = setTimeout(()=> controller.abort(), timeoutMs);
    opts.signal = controller.signal;
    try {
      const res = await fetch(url, opts);
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      if (err.name === 'AbortError') { const e = new Error('Request timed out'); e.code = 'ETIMEDOUT'; throw e; }
      throw err;
    }
  }

  async function fetchWithToken(path, opts = {}, timeoutMs = 30000){
    const url = path.startsWith('http') ? path : (API_ROOT + (path.startsWith('/') ? path : '/' + path));
    opts = prepareRequestOptions(opts);
    opts = Object.assign({}, opts);
    opts.headers = opts.headers ? Object.assign({}, opts.headers) : {};

    const token = getAuthToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    const res = await fetchRaw(url, opts, timeoutMs);
    if (res.status === 401) {
      setAuthToken(null);
      let parsed = null;
      try { parsed = await parseResponse(res); } catch(e){ parsed=null; }
      const err = new Error(parsed && parsed.error ? parsed.error : 'Unauthorized');
      err.status = 401;
      throw err;
    }
    // parseResponse will return parsed body (or throw)
    return await parseResponse(res);
  }

  async function fetchNoAuth(path, opts = {}, timeoutMs = 30000){
    const url = path.startsWith('http') ? path : (API_ROOT + (path.startsWith('/') ? path : '/' + path));
    opts = prepareRequestOptions(opts);
    const res = await fetchRaw(url, opts, timeoutMs);
    return await parseResponse(res);
  }

  // fetchRawWithToken: returns the raw Response (no parse) with Authorization header attached
  async function fetchRawWithToken(path, opts = {}, timeoutMs = 30000){
    const url = path.startsWith('http') ? path : (API_ROOT + (path.startsWith('/') ? path : '/' + path));
    opts = Object.assign({}, opts);
    opts.headers = opts.headers ? Object.assign({}, opts.headers) : {};
    const token = getAuthToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    return await fetchRaw(url, opts, timeoutMs);
  }

  // Basic helpers
  async function get(path, opts){ return fetchWithToken(path, Object.assign({ method: 'GET' }, opts)); }
  async function post(path, body, opts){ return fetchWithToken(path, Object.assign({ method: 'POST', body }, opts), 60000); }
  async function put(path, body, opts){ return fetchWithToken(path, Object.assign({ method: 'PUT', body }, opts)); }
  async function del(path, opts){ return fetchWithToken(path, Object.assign({ method: 'DELETE' }, opts)); }

  // domain helpers
  async function login(email, password){
    if (!email || !password) throw new Error('Email and password are required');
    return fetchNoAuth(`${API_ROOT}/auth/login`, { method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email, password }) });
  }
  async function verifyAdminSecret(tempToken, secret){
    if (!tempToken || !secret) throw new Error('Missing temp token or secret');
    return fetchNoAuth(`${API_ROOT}/auth/verify-admin-secret`, { method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ tempToken, secret }) });
  }

  // criminals (qstr optional)
  async function getCriminals(qstr='') {
    const path = qstr ? ('/criminals?' + qstr) : '/criminals';
    return get(path);
  }
  async function getCriminalById(id){ return get('/criminals/' + id); }
  async function createCriminal(formData){ return fetchWithToken('/criminals', { method:'POST', body: formData }, 60000); }
  async function updateCriminal(id, formData){ return fetchWithToken('/criminals/' + id, { method:'PUT', body: formData }, 60000); }
  async function deleteCriminal(id){ return del('/criminals/' + id); }
  async function restoreCriminal(id){ return post('/criminals/' + id + '/restore'); }
  async function permanentDeleteCriminal(id){ return del('/criminals/' + id + '/permanent'); }

  async function createPayment(id, amount, paidBy, note){ return post(`/criminals/${id}/payments`, { amount: Number(amount), paidBy, note }); }
  async function deletePayment(id, pid){ return del(`/criminals/${id}/payments/${pid}`); }

  // rooms
  async function getRooms(){ return get('/rooms'); }
  async function createRoom(data){ return post('/rooms', data); }
  async function deleteRoom(id){ return del('/rooms/' + id); }
  async function permanentDeleteRoom(id){ return del('/rooms/' + id + '/permanent'); }

  // prisons
  async function getPrisons(){ return get('/prisons'); }
  async function createPrison(data){ return post('/prisons', data); }
  async function updatePrison(id, data){ return put('/prisons/' + id, data); }
  async function deletePrison(id){ return del('/prisons/' + id); }
  async function permanentDeletePrison(id){ return del('/prisons/' + id + '/permanent'); }

  async function getDashboard(params = '') {
    // params could be 'period=monthly' etc
    const path = params ? ('/dashboard?' + params) : '/dashboard';
    return get(path);
  }

  // exportPdf: returns raw Response (use BACKEND_BASE absolute URL to avoid live-server rewriting)
  // exportPdf: returns raw Response (use BACKEND_BASE absolute URL to avoid live-server rewriting)
  // accepts either a string (q) or an object { q, status, committedType, roomId }
  async function exportPdf(params) {
    const p = (typeof params === 'string' || !params) ? { q: params || '' } : Object.assign({}, params);
    const qs = [];
    if (p.q) qs.push('q=' + encodeURIComponent(p.q));
    if (p.status) qs.push('status=' + encodeURIComponent(p.status));
    if (p.committedType) qs.push('committedType=' + encodeURIComponent(p.committedType));
    if (p.roomId) qs.push('roomId=' + encodeURIComponent(p.roomId));
    const url = `${BACKEND_BASE}/api/export?type=pdf${qs.length ? '&' + qs.join('&') : ''}`;
    return fetchRawWithToken(url, { method: 'GET' }, 120000);
  }


  // expose on window.api
  window.api = {
    API_ROOT, BACKEND_BASE, getAuthToken, setAuthToken,
    fetchRaw, fetchWithToken, fetchRawWithToken, fetchNoAuth,
    get, post, put, del,
    login, verifyAdminSecret,
    // criminals
    getCriminals, getCriminalById, createCriminal, updateCriminal, deleteCriminal, restoreCriminal, permanentDeleteCriminal,
    createPayment, deletePayment,
    // rooms
    getRooms, createRoom, deleteRoom, permanentDeleteRoom,
    // prisons
    getPrisons, createPrison, updatePrison, deletePrison, permanentDeletePrison,
    // dashboard + export
    getDashboard, exportPdf
  };
})();


<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Prison Management App</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <div class="app-shell">
    <!-- TOPBAR -->
    <header class="topbar" role="banner">
      <div class="brand">
        <div class="logo">Xabsi<span class="brand-accent">App</span></div>
        <div class="title">Diiwaanka Maxaabiista</div>
      </div>

      <!-- desktop horizontal nav -->
      <nav class="nav-links" id="nav-links" aria-label="Primary navigation"></nav>

      <div class="top-right">
        <!-- mobile menu toggle (hidden on desktop) -->
        <button id="toggle-sidebar" class="icon-btn" aria-expanded="false" aria-controls="mobile-nav-dropdown" aria-label="Open menu">☰</button>

        <!-- mobile dropdown (hidden initially) -->
        <div id="mobile-nav-dropdown" class="mobile-nav hidden" role="menu" aria-hidden="true"></div>
      </div>
    </header>

    <!-- page toolbar: search / actions (below header) -->
    <div class="page-toolbar" id="page-toolbar">
      <div class="search-wrap">
        <input id="global-search" class="search-field" placeholder="Search by prisonId, name or national ID..." />
        <button id="search-btn" class="btn secondary">Raadi</button>
      </div>
      <div class="toolbar-actions" id="toolbar-actions"></div>
    </div>

    <!-- main content -->
    <main id="view-wrap" class="main-column">
      <div id="spinner" class="loading-spinner hidden" role="status" aria-live="polite">Raadin...</div>
      <div id="view" class="view"></div>
    </main>

    <!-- a hidden secondary sidebar kept for progressive enhancement (not shown on desktop) -->
    <aside class="sidebar hidden" id="left-sidebar" aria-label="Secondary navigation">
      <div class="sidebar-brand">Xabsi<span class="brand-accent">App</span></div>
      <nav class="sidebar-nav" id="sidebar-nav"></nav>
      <div class="sidebar-foot">v1.0 • Demo</div>
    </aside>

    <!-- templates -->
    <template id="criminal-row">
      <div class="card criminal-row skeleton" aria-busy="true">
        <div class="thumb skeleton--avatar"></div>
        <div class="meta">
          <div class="line skeleton--line" style="width:45%"></div>
          <div class="line skeleton--line" style="width:30%"></div>
        </div>
        <div class="actions"></div>
      </div>
    </template>
  </div>

  <script src="js/api.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
the linkfor the netlift is:https://DiiwaankaMaxaabiista.netlify.app/
and the render link is : https://study-helper-b11e.onrender.com


# MongoDB connection
MONGO_URI=mongodb+srv://HRghjopfYpuTjLZB:HRghjopfYpuTjLZB@cluster0.lussphk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0

# JWT secret key
JWT_SECRET=0b89b7b28f92f0575535dbeab74055901618a2a1b161cd88796b28ff92fee1bb0ac9e17b9dc7235bebf2a74feb04859d730c566eaeef0191c149b3ae91d145b5

# Backend port
PORT=5002

