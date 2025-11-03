//api

// frontend/js/api.js  (replace the old file with this)
(function(){
  // Auto-detect API root:
  // - If the frontend is opened from Live Server (e.g. port 5500) we point to the dev backend on port 5002.
  // - Otherwise (served from the backend) we use relative '/api'.
  const DEV_BACKEND_PORT = 5002;
  const isLocalhost = ['localhost','127.0.0.1'].includes(window.location.hostname);
  const servedFromDevServer = isLocalhost && window.location.port && window.location.port !== String(DEV_BACKEND_PORT);
  const API_ROOT = (servedFromDevServer ? `${window.location.protocol}//${window.location.hostname}:${DEV_BACKEND_PORT}/api` : '/api');

  // token helpers
  function getAuthToken(){ return localStorage.getItem('token'); }
  function setAuthToken(t){ if(t) localStorage.setItem('token', t); else localStorage.removeItem('token'); }

  // parse response and produce useful Error on non-OK
  async function parseResponse(res){
    const ct = res.headers.get('content-type') || '';
    let body = null;
    try {
      if (ct.includes('application/json')) body = await res.json();
      else body = await res.text();
    } catch(e){
      body = null;
    }

    if (res.ok) return body;
    // try to pull meaningful message from body
    const msg = (body && (body.error || body.message || body.msg)) || (typeof body === 'string' ? body : `HTTP ${res.status}`);
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  // low-level fetch wrapper with timeout and smart body handling
  async function fetchRaw(url, opts = {}, timeoutMs = 30000){
    opts = Object.assign({}, opts);
    opts.headers = opts.headers ? Object.assign({}, opts.headers) : {};

    // If body is a plain object (not FormData), encode as JSON
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData) && !(opts.body instanceof Blob)) {
      if (!opts.headers['Content-Type'] && !opts.headers['content-type']) {
        opts.headers['Content-Type'] = 'application/json';
      }
      if (opts.headers['Content-Type'].includes('application/json') && typeof opts.body !== 'string') {
        opts.body = JSON.stringify(opts.body);
      }
    }

    const controller = new AbortController();
    const id = setTimeout(()=> controller.abort(), timeoutMs);
    opts.signal = controller.signal;

    try {
      const res = await fetch(url, opts);
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      if (err.name === 'AbortError') {
        const e = new Error('Request timed out');
        e.code = 'ETIMEDOUT';
        throw e;
      }
      throw err;
    }
  }

  // fetch without attaching existing token (for login / verify flows)
  async function fetchNoAuth(path, opts = {}, timeoutMs = 30000){
    const url = path.startsWith('http') ? path : (API_ROOT + (path.startsWith('/') ? path : '/' + path));
    const res = await fetchRaw(url, opts, timeoutMs);
    return await parseResponse(res);
  }

  // fetch and attach token if present
  async function fetchWithToken(path, opts = {}, timeoutMs = 30000){
    const url = path.startsWith('http') ? path : (API_ROOT + (path.startsWith('/') ? path : '/' + path));
    opts = Object.assign({}, opts);
    opts.headers = opts.headers ? Object.assign({}, opts.headers) : {};

    const token = getAuthToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    const res = await fetchRaw(url, opts, timeoutMs);

    // if 401, clear token (session expired) and throw a clear error
    if (res.status === 401) {
      setAuthToken(null);
      const parsed = await (async ()=>{
        try { return await parseResponse(res); } catch(e){ return null; }
      })();
      const e = new Error(parsed && parsed.error ? parsed.error : 'Unauthorized');
      e.status = 401;
      throw e;
    }

    return await parseResponse(res);
  }

  // convenience HTTP methods returning parsed body (or throwing Error)
  async function get(path, opts) { return fetchWithToken(path, Object.assign({ method: 'GET' }, opts)); }
  async function post(path, body, opts) { return fetchWithToken(path, Object.assign({ method: 'POST', body }, opts)); }
  async function put(path, body, opts) { return fetchWithToken(path, Object.assign({ method: 'PUT', body }, opts)); }
  async function del(path, opts) { return fetchWithToken(path, Object.assign({ method: 'DELETE' }, opts)); }

  // Public API functions used by the app:
  async function login(email, password){
    if (!email || !password) throw new Error('Email and password are required');
    // use fetchNoAuth so token isn't cleared in case of bad credentials
    return fetchNoAuth(`${API_ROOT}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: { email, password }
    });
  }

  async function verifyAdminSecret(tempToken, secret){
    if (!tempToken || !secret) throw new Error('Missing temp token or secret');
    return fetchNoAuth(`${API_ROOT}/auth/verify-admin-secret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: { tempToken, secret }
    });
  }

  async function getCriminals(q = ''){ return get(`/criminals?q=${encodeURIComponent(q)}`); }
  async function getCriminalById(id){ return get(`/criminals/${id}`); }
  async function createCriminal(formData){ return fetchWithToken(`/criminals`, { method: 'POST', body: formData }, 60000); }
  async function updateCriminal(id, formData){ return fetchWithToken(`/criminals/${id}`, { method: 'PUT', body: formData }, 60000); }
  async function deleteCriminal(id){ return del(`/criminals/${id}`); }
  async function restoreCriminal(id){ return post(`/criminals/${id}/restore`); }
  async function permanentDeleteCriminal(id){ return del(`/criminals/${id}/permanent`); }

  async function createPayment(id, amount, paidBy, note){
    if (typeof amount !== 'number' && typeof amount !== 'string') throw new Error('Invalid amount');
    return post(`/criminals/${id}/payments`, { amount: Number(amount), paidBy, note });
  }
  async function deletePayment(id, pid){ return del(`/criminals/${id}/payments/${pid}`); }

  async function getRooms(){ return get('/rooms'); }
  async function createRoom(data){ return post('/rooms', data); }

  async function getDashboard(){ return get('/dashboard'); }
  async function exportPdf(q){ /* returns blob/text handled by caller */ return fetchWithToken(`/export?type=pdf&q=${encodeURIComponent(q)}`, { method: 'GET' }, 120000); }

  // expose to window for easy use by app.js
  window.api = {
    // low-level
    API_ROOT, getAuthToken, setAuthToken, fetchRaw, fetchWithToken, fetchNoAuth,
    // http helpers
    get, post, put, del,
    // domain methods
    login, verifyAdminSecret, getCriminals, getCriminalById, createCriminal, updateCriminal,
    deleteCriminal, restoreCriminal, permanentDeleteCriminal,
    createPayment, deletePayment, getRooms, createRoom, getDashboard, exportPdf
  };
})();

//criminal
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const PaymentSchema = new Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  paidBy: { type: String },
  note: { type: String }
});
const CriminalSchema = new Schema({
  prisonId: { type: String, required: true, unique: true },
  nationalId: { type: String },
  fullName: { type: String, required: true },
  photoUrl: { type: String },
  roomId: { type: mongoose.Types.ObjectId, ref: 'Room', default: null },
  phone: { type: String },
  parentName: { type: String },
  parentPhone: { type: String },
  committedType: { type: String },
  committedTypeOther: { type: String },
  dob: { type: Date },
  gender: { type: String, enum: ['male','female'] },
  judgment: { type: String },
  overview: { type: String },
  status: { type: String, enum: ['not_sentenced','sentenced','in_prison','out','dead'], default: 'in_prison' },
  timeHeldStart: { type: Date },
  releaseDate: { type: Date },
  fineAmount: { type: Number, default: 0 },
  payments: [PaymentSchema],
  createdBy: { type: mongoose.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

CriminalSchema.virtual('age').get(function(){
  if(!this.dob) return null;
  const diff = Date.now() - this.dob.getTime();
  return Math.floor(diff / (365.25*24*3600*1000));
});
CriminalSchema.set('toJSON', { virtuals: true });
module.exports = mongoose.model('Criminal', CriminalSchema);
//criminals

// backend/routes/criminals.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const Criminal = require('../models/Criminal');
const Room = require('../models/Room');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { nextSeq } = require('../utils/counters');

const multer = require('multer');

// ensure uploads dir exists
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// multer storage - keep extension and create safe filename
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safe = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + ext;
    cb(null, safe);
  }
});
function fileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image uploads are allowed'), false);
  }
  cb(null, true);
}
const upload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024 }, fileFilter });

// helper to ensure absolute photoUrl
function normalizePhotoUrl(obj, req) {
  if (!obj) return obj;
  if (obj.photoUrl && typeof obj.photoUrl === 'string' && !obj.photoUrl.startsWith('http')) {
    // obj.photoUrl might be '/uploads/xxx' or 'uploads/xxx' or just filename
    let p = obj.photoUrl;
    if (!p.startsWith('/')) p = '/' + p;
    obj.photoUrl = `${req.protocol}://${req.get('host')}${p}`;
  }
  return obj;
}

// GET list with filters and pagination
router.get('/', async (req, res) => {
  try {
    const { q, status, page = 1, perPage = 20, committedType, minAge, maxAge } = req.query;
    const query = { deletedAt: null };
    if (q) {
      query.$or = [
        { prisonId: new RegExp('^' + q, 'i') },
        { nationalId: new RegExp(q, 'i') },
        { fullName: new RegExp(q, 'i') }
      ];
    }
    if (status) query.status = status;
    if (committedType) query.committedType = committedType;
    if (minAge || maxAge) {
      const now = new Date();
      query.dob = {};
      if (minAge) query.dob.$lte = new Date(now.getFullYear() - Number(minAge), now.getMonth(), now.getDate());
      if (maxAge) query.dob.$gte = new Date(now.getFullYear() - Number(maxAge), now.getMonth(), now.getDate());
    }
    const skip = (Number(page) - 1) * Number(perPage);
    const docs = await Criminal.find(query).populate('roomId').sort({ createdAt: -1 }).skip(skip).limit(Number(perPage));
    // normalize photoUrl for each doc
    const out = docs.map(d => normalizePhotoUrl(d.toObject(), req));
    res.json({ criminals: out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create (controller)
router.post('/', authMiddleware, requireRole('controller'), upload.single('photo'), async (req, res) => {
  try {
    const data = Object.assign({}, req.body);

    if (!data.fullName) return res.status(400).json({ error: 'fullName required' });

    // parse numeric and date fields properly
    if (data.fineAmount !== undefined) data.fineAmount = Number(data.fineAmount) || 0;
    if (data.timeHeldStart) data.timeHeldStart = new Date(data.timeHeldStart);
    if (data.releaseDate) data.releaseDate = new Date(data.releaseDate);
    if (data.roomId === '') data.roomId = null;

    // generate prisonId: DNB + DDMMYY + seq (seq per day)
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const seq = await nextSeq('prison-' + d.toISOString().slice(0, 10), 3, '');
    const prisonId = 'DNB' + dd + mm + yy + seq;

    data.prisonId = prisonId;

    if (req.file) {
      // make absolute URL for photo
      data.photoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    data.createdBy = req.user ? req.user._id : null;

    const c = await Criminal.create(data);
    const obj = normalizePhotoUrl(c.toObject(), req);

    // emit socket update
    const io = req.app.get('io');
    if (io) io.emit('criminal:created', obj);

    res.json({ ok: true, criminal: obj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET one
router.get('/:id', async (req, res) => {
  try {
    const c = await Criminal.findById(req.params.id).populate('roomId');
    if (!c) return res.status(404).json({ error: 'Not found' });
    const obj = normalizePhotoUrl(c.toObject(), req);
    res.json({ criminal: obj });
  } catch (err) {
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

    if (req.file) {
      data.photoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }
    const c = await Criminal.findByIdAndUpdate(req.params.id, data, { new: true }).populate('roomId');
    if (!c) return res.status(404).json({ error: 'Not found' });
    const obj = normalizePhotoUrl(c.toObject(), req);
    const io = req.app.get('io');
    if (io) io.emit('criminal:updated', obj);
    res.json({ ok: true, criminal: obj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// soft delete
router.delete('/:id', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    await Criminal.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// restore
router.post('/:id/restore', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    await Criminal.findByIdAndUpdate(req.params.id, { deletedAt: null });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// permanent delete (controller)
router.delete('/:id/permanent', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const c = await Criminal.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// status toggle / mark dead
router.post('/:id/status', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const { action } = req.body; // 'toggle' or 'dead' or set status
    const c = await Criminal.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    if (action === 'toggle') {
      c.status = c.status === 'out' ? 'in_prison' : 'out';
    } else if (action === 'dead') {
      c.status = 'dead';
    } else if (['in_prison', 'out', 'dead'].includes(action)) {
      c.status = action;
    }
    await c.save();
    const io = req.app.get('io');
    if (io) io.emit('criminal:status', c);
    res.json({ ok: true, criminal: c });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// payments
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// delete payment
router.delete('/:id/payments/:paymentId', authMiddleware, requireRole('controller'), async (req, res) => {
  try {
    const c = await Criminal.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    c.payments = c.payments.filter(p => p._id.toString() !== req.params.paymentId);
    await c.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
//index:
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
    <aside class="sidebar" role="navigation" aria-label="Main">
      <div class="sidebar-brand">Prison<span class="brand-accent">App</span></div>
      <nav class="sidebar-nav" id="nav-links" role="menu"></nav>
      <div class="sidebar-foot">v1.0 • Demo</div>
    </aside>

    <div class="main-column">
      <header class="topbar">
        <div class="top-left">
          <button id="toggle-sidebar" class="icon-btn" aria-label="Toggle sidebar">☰</button>
          <div class="app-title">Prison Management</div>
        </div>
        <div class="top-right" id="nav-actions"></div>
      </header>

      <div class="page-toolbar" id="page-toolbar" aria-hidden="false">
        <div class="search-wrap">
          <input id="global-search" class="input" placeholder="Search by prisonId, name or national ID..." />
          <button id="search-btn" class="btn secondary">Search</button>
        </div>
        <div class="toolbar-actions" id="toolbar-actions"></div>
      </div>

      <main id="app" class="app" role="main">
        <div id="spinner" class="loading-spinner hidden" role="status" aria-live="polite">Loading…</div>
        <div id="view" class="view"></div>
      </main>
    </div>
  </div>

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

<script src="js/api.js"></script>
<script src="js/app.js"></script>
</body>
</html>

//app.js
// Simplified app UI for demo: uses window.api
(async function(){
  const view = document.getElementById('view');
  const navLinks = document.getElementById('nav-links');
  const navActions = document.getElementById('nav-actions');
  const toolbarActions = document.getElementById('toolbar-actions');
  const searchInput = document.getElementById('global-search');
  const searchBtn = document.getElementById('search-btn');
  const sidebar = document.querySelector('.sidebar');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');

  function showSpinner(show=true){ document.getElementById('spinner').classList.toggle('hidden', !show); }
  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    for(const k in attrs){
      if(k==='class') e.className = attrs[k];
      else if(k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children)?children:[]).forEach(c => typeof c === 'string' ? e.appendChild(document.createTextNode(c)) : e.appendChild(c));
    return e;
  }





  function isController(){ return localStorage.getItem('role') === 'controller'; }
  function isLogged(){ return !!localStorage.getItem('token'); }

  toggleSidebarBtn?.addEventListener('click', ()=> sidebar.classList.toggle('collapsed'));

  function clearView(){ view.innerHTML=''; }

  function renderNav(){
    navLinks.innerHTML='';
    const addLink = (id,label,fn)=>{
      const a = el('a',{href:'#', onclick:(e)=>{ e.preventDefault(); setActiveNav(id); fn(); }},[label]);
      a.id = 'nav-' + id;
      navLinks.appendChild(a);
    };
    addLink('criminals','Criminals', renderCriminals);
    addLink('rooms','Rooms', renderRooms);
    addLink('recycle','Recycle Bin', renderRecycleBin);
    if(isController()) addLink('dashboard','Dashboard', renderDashboard);

    navActions.innerHTML = '';
    if(!isLogged()){
      navActions.appendChild(el('button',{class:'btn',onclick:showLoginModal},['Login']));
    } else {
      navActions.appendChild(el('div',{class:'badge'},['You']));
      navActions.appendChild(el('button',{class:'btn',onclick:()=>{ localStorage.removeItem('token'); localStorage.removeItem('role'); renderNav(); renderCriminals(); }},['Logout']));
    }

    toolbarActions.innerHTML = '';
    toolbarActions.appendChild(el('button',{class:'btn secondary', onclick: renderExport},['Export']));
    if(isController()){
      toolbarActions.appendChild(el('button',{class:'btn', onclick: ()=> showEditCriminalModal(null)},['Add Criminal']));
      toolbarActions.appendChild(el('button',{class:'btn', onclick: showAddRoomModal},['Add Room']));
    }
  }

  function setActiveNav(id){
    document.querySelectorAll('.sidebar-nav a').forEach(a=>a.classList.remove('active'));
    const elId = document.getElementById('nav-' + id);
    if(elId) elId.classList.add('active');
  }

  function showLoginModal(){
    const modal = el('div',{class:'modal'},[]);
    const inner = el('div',{class:'inner'},[]);
    const email = el('input',{placeholder:'email', class:'input'});
    const pass = el('input',{placeholder:'password',type:'password', class:'input'});
    const submit = el('button',{class:'btn',onclick:async ()=>{
      try{
        const r = await window.api.login(email.value.trim(), pass.value);
        if(r.requiresAdminSecret && r.tempToken){
          const secret = prompt('Enter 4-digit admin secret:');
          if(!secret){ location.reload(); return; }
          const v = await window.api.verifyAdminSecret(r.tempToken, secret);
          if(v.token){ localStorage.setItem('token', v.token); localStorage.setItem('role', v.role); modal.remove(); renderNav(); renderDashboard(); return; }
          alert('Invalid secret — page will refresh'); location.reload(); return;
        } else if(r.token){
          localStorage.setItem('token', r.token); localStorage.setItem('role', r.role || 'viewer'); modal.remove(); renderNav(); renderCriminals(); return;
        } else {
          alert('Login failed');
        }
      } catch(e){ alert('Login error: ' + (e.message||e)); }
    }},['Sign in']);
    inner.appendChild(el('h3',{},['Login']));
    inner.appendChild(el('div',{},[el('div',{class:'label'},['Email']), email]));
    inner.appendChild(el('div',{},[el('div',{class:'label'},['Password']), pass]));
    inner.appendChild(el('div',{},[submit]));
    modal.appendChild(inner); document.body.appendChild(modal);
  }

  async function renderCriminals(){
    setActiveNav('criminals');
    showSpinner(true);
    clearView();
    view.appendChild(el('h2',{},['Criminals']));
    const list = el('div',{},[]);
    for(let i=0;i<6;i++){
      const temp = document.getElementById('criminal-row').content.cloneNode(true);
      list.appendChild(temp);
    }
    view.appendChild(list);
    try{
      const q = searchInput.value || '';
      const data = await window.api.getCriminals(q);
      list.innerHTML='';
      const rows = data.criminals || [];
      if(rows.length === 0) list.appendChild(el('div',{class:'card'},['No criminals found.']));
      rows.forEach(c=>{
        const card = el('div',{class:'card criminal-row'},[]);
        const thumb = el('div',{class:'thumb'},[]);
        if (c.photoUrl) {
          let src = String(c.photoUrl);
          if (!src.startsWith('http://') && !src.startsWith('https://')) {
            if (!src.startsWith('/')) src = '/' + src;
            src = BACKEND_BASE + src;
          }
          const i = el('img', {
            src: src,
            alt: c.fullName || 'photo',
            onerror: "this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2256%22 height=%2256%22><rect width=%2256%22 height=%2256%22 fill=%22%23e6ecf8%22/><text x=%2228%22 y=%2232%22 font-size=%2212%22 text-anchor=%22middle%22 fill=%22%236b7280%22>no image</text></svg>'"
          });
          thumb.appendChild(i);
        } else {
          thumb.className='skeleton skeleton--avatar';
        }
        const meta = el('div',{class:'meta'},[]);
        meta.appendChild(el('div',{},[el('strong',{},[c.prisonId || '—']), ' ', c.fullName]));
        meta.appendChild(el('div',{class:'muted'},[
          c.nationalId ? ('NID: ' + c.nationalId + ' • ') : '',
          c.roomId ? (c.roomId.name || '') : 'No room', ' • ', c.status || '—'
        ]));
        const actions = el('div',{},[]);
        actions.appendChild(el('button',{class:'icon-small', onclick:()=> showCriminalDetails(c._id)},['View']));
        if(isController()){
          actions.appendChild(el('button',{class:'icon-small', onclick:()=> showEditCriminalModal(c)},['Edit']));
          actions.appendChild(el('button',{class:'icon-small', onclick:async ()=>{ if(confirm('Move to Recycle Bin?')){ await window.api.deleteCriminal(c._id); alert('Moved to Recycle Bin'); renderCriminals(); } }},['Delete']));
          const paidSum = (c.payments||[]).reduce((s,p)=>s+p.amount,0);
          const remaining = (c.fineAmount||0) - paidSum;
          if(remaining > 0) actions.appendChild(el('button',{class:'btn', onclick:()=> showPayModal(c)},['Pay']));
        }
        card.appendChild(thumb); card.appendChild(meta); card.appendChild(actions);
        list.appendChild(card);
      });
    } catch(e){ list.innerHTML = '<div class="card">Failed to load. ' + (e.message||e) + '</div>'; }
    finally{ showSpinner(false); }
  }
  

  async function renderDashboard(){
    setActiveNav('dashboard');
    showSpinner(true);
    clearView();
    view.appendChild(el('h2',{},['Dashboard']));
    const wrap = el('div',{},[]);
    view.appendChild(wrap);
    try{
      const d = await window.api.getDashboard();
      wrap.innerHTML='';
      const s = d.stats || {};
      const grid = el('div',{style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;'},[]);
      grid.appendChild(el('div',{class:'card'},['Total criminals: ' + (s.totalCriminals || 0)]));
      grid.appendChild(el('div',{class:'card'},['Currently in prison: ' + (s.currentlyIn || 0)]));
      grid.appendChild(el('div',{class:'card'},['Total rooms: ' + (s.totalRooms || 0)]));
      grid.appendChild(el('div',{class:'card'},['Total users: ' + (s.totalUsers || 0)]));
      wrap.appendChild(grid);
    } catch(e){ wrap.innerHTML = '<div class="card">Failed to load dashboard</div>'; }
    finally{ showSpinner(false); }
  }

  async function renderRooms(){
    setActiveNav('rooms');
    showSpinner(true);
    clearView();
    view.appendChild(el('h2',{},['Rooms']));
    const list = el('div',{},[]);
    view.appendChild(list);
    try{
      const r = await window.api.getRooms();
      const rooms = r.rooms || [];
      if(rooms.length===0) list.appendChild(el('div',{class:'card'},['No rooms yet']));
      rooms.forEach(room=>{
        const card = el('div',{class:'card'},[]);
        card.appendChild(el('div',{style:'flex:1'},[el('strong',{},[room.roomId || '—']), ' ', room.name]));
        if(isController()){
          const actions = el('div',{},[]);
          actions.appendChild(el('button',{class:'btn', onclick:()=> showEditRoomModal(room)},['Edit']));
          actions.appendChild(el('button',{class:'btn secondary', onclick:async ()=>{ if(confirm('Delete room?')){ await window.api.deleteRoom(room._id); alert('Deleted'); renderRooms(); } }},['Delete']));
          card.appendChild(actions);
        }
        list.appendChild(card);
      });
    } catch(e){ list.innerHTML = '<div class="card">Failed to load rooms</div>'; }
    finally{ showSpinner(false); }
  }

  async function renderRecycleBin(){
    setActiveNav('recycle');
    showSpinner(true);
    clearView();
    view.appendChild(el('h2',{},['Recycle Bin']));
    const list = el('div',{},[]);
    view.appendChild(list);
    try{
      const all = await window.api.getCriminals('');
      const deleted = (all.criminals || []).filter(c => c.deletedAt);
      if(deleted.length===0) list.appendChild(el('div',{class:'card'},['Recycle bin is empty']));
      deleted.forEach(c=>{
        const card = el('div',{class:'card'},[]);
        card.appendChild(el('div',{style:'flex:1'},[c.prisonId + ' — ' + c.fullName]));
        card.appendChild(el('div',{},[
          el('button',{class:'btn', onclick:async ()=>{ await window.api.restoreCriminal(c._id); alert('Restored'); renderRecycleBin(); }},['Restore']),
          el('button',{class:'btn secondary', onclick:async ()=>{ if(confirm('Delete permanently?')){ await window.api.permanentDeleteCriminal(c._id); alert('Deleted permanently'); renderRecycleBin(); } }},['Delete Permanently'])
        ]));
        list.appendChild(card);
      });
    } catch(e){ list.innerHTML = '<div class="card">Failed to load recycle bin</div>'; }
    finally{ showSpinner(false); }
  }

  //----- Protect views: require login before showing details ----------
  async function showCriminalDetails(id){
    if(!isLogged()){
      showAuthRequiredModal('Please login to view this criminal');
      return;
    }
    const modal = el('div',{class:'modal'},[]);
    const inner = el('div',{class:'inner'},[]);
    inner.appendChild(el('h3',{},['Loading...']));
    modal.appendChild(inner); document.body.appendChild(modal);
  
    let iv = null;
  
    try{
      const r = await window.api.get(`/criminals/${id}`);
      const c = r.criminal;
      inner.innerHTML = '';
  
      // header + photo preview
      const header = el('div',{style:'display:flex;gap:12px;align-items:center;'},[]);
      if(c.photoUrl){
        let src = String(c.photoUrl);
        if (!src.startsWith('http')) src = (BACKEND_BASE + (src.startsWith('/') ? src : '/' + src));
        header.appendChild(el('div',{},[ el('img',{src, style:'width:96px;height:96px;border-radius:8px;object-fit:cover', alt:c.fullName||'photo'}) ]));
      }
      const title = el('div',{},[]);
      title.appendChild(el('h3',{},[c.fullName || '—']));
  
      const prisonDisplay = (c.prisonName) || (c.prisonRef && c.prisonRef.name) || (c.prisonId || '—');
      const dobStr = c.dob ? (new Date(c.dob)).toLocaleDateString() : '';
      const age = computeAgeFromDOB(c.dob) || c.age || null;
      const ageText = age ? (' • ' + age + ' yrs') : '';
  
      title.appendChild(el('div',{class:'muted'},[
        'Prison: ' + prisonDisplay,
        ' • ID: ' + (c._id || '—'),
        dobStr ? (' • DOB: ' + dobStr + (age ? (' • Age: ' + age + ' yrs') : '')) : ''
      ]));
      header.appendChild(title);
      inner.appendChild(header);
  
      const dl = el('div',{style:'margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px'},[]);
      function row(label, value){ return el('div',{},[el('div',{class:'label'},[label]), el('div',{},[value || '—'])]); }
      dl.appendChild(row('National ID', c.nationalId || ''));
      dl.appendChild(row('Gender', c.gender || ''));
      dl.appendChild(row('DOB', dobStr + (age ? (' • ' + age + ' yrs') : '')));
      dl.appendChild(row('Room', c.roomId ? (c.roomId.name || '') : 'No room'));
      dl.appendChild(row('Prison', prisonDisplay));
      dl.appendChild(row('Phone', c.phone || ''));
      dl.appendChild(row('Parent', (c.parentName ? c.parentName + (c.parentPhone ? ' • ' + c.parentPhone : '') : '')));
      dl.appendChild(row('Place of birth', c.placeOfBirth || ''));
      dl.appendChild(row('Committed Type', (c.committedType || '') + (c.committedTypeOther ? (' • ' + c.committedTypeOther) : '')));
      dl.appendChild(row('Judgment', c.judgment || ''));
      dl.appendChild(row('Status', c.status || ''));
      dl.appendChild(row('Time Held', c.timeHeldStart ? new Date(c.timeHeldStart).toLocaleString() : ''));
      dl.appendChild(row('Release', c.releaseDate ? new Date(c.releaseDate).toLocaleString() : ''));
      dl.appendChild(row('Fine', (c.fineAmount||0)));
      inner.appendChild(dl);
  
      if (c.overview){
        inner.appendChild(el('div',{style:'margin-top:12px'},[
          el('div',{class:'label'},['Overview / Description']),
          el('div',{},[c.overview])
        ]));
      }
  
      const paid = (c.payments||[]).reduce((s,p)=>s+p.amount,0);
      inner.appendChild(el('div',{style:'margin-top:12px'},['Payments: Paid ' + paid + ' / Remaining ' + ((c.fineAmount||0)-paid)]));
  
      if (c.payments && c.payments.length){
        const ul = el('div',{style:'margin-top:8px;display:flex;flex-direction:column;gap:6px'},[]);
        c.payments.forEach(p => ul.appendChild(el('div',{class:'card'},[(new Date(p.date)).toLocaleString() + ' — ' + p.amount + (p.note ? (' — ' + p.note) : '') + (p.paidBy ? (' — by ' + p.paidBy) : '')])));
        inner.appendChild(ul);
      }
  
      if (c.releaseDate){
        const rd = new Date(c.releaseDate);
        const countdown = el('div',{class:'countdown', style:'margin-top:12px;font-weight:700'},['--']);
        inner.appendChild(el('div',{},[el('div',{class:'label'},['Time remaining until release']), countdown]));
        function tick(){
          const now = new Date();
          const diff = rd - now;
          if(diff <= 0){ countdown.textContent = 'Released'; if(iv) { clearInterval(iv); iv = null; } return; }
          const dd = Math.floor(diff/(24*3600*1000));
          const hh = Math.floor((diff % (24*3600*1000)) / 3600000);
          const mm = Math.floor((diff % 3600000) / 60000);
          const ss = Math.floor((diff % 60000) / 1000);
          countdown.textContent = `${dd}d ${hh}h ${mm}m ${ss}s`;
        }
        tick();
        iv = setInterval(tick,1000);
      }
  
      const originalRemove = modal.remove.bind(modal);
      modal.remove = function(){ if(iv) { clearInterval(iv); iv = null; } originalRemove(); };
  
      inner.appendChild(el('div', {style:'margin-top:12px'},[
        el('button',{class:'btn', type:'button', onclick:()=> modal.remove()},['Close'])
      ]));
    } catch(e){
      if (iv) { clearInterval(iv); iv = null; }
      inner.innerHTML = '<div class="card">Error loading criminal: ' + (e.message || e) + '</div>';
    }
  }
  

  async function showEditCriminalModal(existing){
    const isEdit = !!existing;
    const modal = el('div',{class:'modal'},[]);
    const inner = el('div',{class:'inner'},[]);
    inner.appendChild(el('h3',{},[isEdit ? 'Edit Criminal' : 'Add Criminal']));
    const form = document.createElement('form');
    form.className = 'form-grid';
    form.innerHTML = `
      <div class="form-row"><label class="label">Full name<input name="fullName" class="input" required></label></div>
      <div class="form-row"><label class="label">National ID<input name="nationalId" class="input"></label></div>
      <div class="form-row"><label class="label">Phone<input name="phone" class="input" pattern="\d*"></label></div>
      <div class="form-row"><label class="label">Parent name<input name="parentName" class="input"></label></div>
      <div class="form-row"><label class="label">Parent phone<input name="parentPhone" class="input" pattern="\d*"></label></div>
      <div class="form-row"><label class="label">Committed type<select name="committedType" class="input">
        <option value="">--select--</option>
        <option value="dil">dil</option><option value="dhac">dhac</option><option value="kufsi">kufsi</option>
        <option value="is dabmarin">is dabmarin</option><option value="musuqmaasuq">musuqmaasuq</option><option value="other">other</option>
      </select></label></div>
      <div class="form-row"><label class="label">Committed (other)<input name="committedTypeOther" class="input"></label></div>
      <div class="form-row"><label class="label">Gender<select name="gender" class="input"><option value="male">Male</option><option value="female">Female</option></select></label></div>
      <div class="form-row"><label class="label">DOB<input name="dob" type="date" class="input"></label></div>
      <div class="form-row"><label class="label">Room<select name="roomId" class="input"></select></label></div>
      <div class="form-row"><label class="label">Judgment<input name="judgment" class="input"></label></div>
      <div class="form-row"><label class="label">Fine amount<input name="fineAmount" type="number" min="0" step="0.01" class="input"></label></div>
      <div class="form-row"><label class="label">Release date<input name="releaseDate" type="datetime-local" class="input"></label></div>
      <div class="form-row"><label class="label">Photo<input name="photo" type="file" accept="image/*"></label></div>
      <div class="form-row"><label class="label">Overview / Description<textarea name="overview" class="input" rows="3"></textarea></label></div>

    `;
    const roomsSel = form.querySelector('select[name="roomId"]');
    try{
      const rr = await window.api.getRooms();
      (rr.rooms||[]).forEach(room=> roomsSel.appendChild(el('option',{value:room._id},[room.name + ' (' + (room.roomId||'') + ')'])));
    } catch(e){ roomsSel.appendChild(el('option',{value:''},['Failed to load rooms'])); }

    if(isEdit){
      form.fullName.value = existing.fullName || '';
      form.nationalId.value = existing.nationalId || '';
      form.phone.value = existing.phone || '';
      form.parentName.value = existing.parentName || '';
      form.parentPhone.value = existing.parentPhone || '';
      form.committedType.value = existing.committedType || '';
      form.committedTypeOther.value = existing.committedTypeOther || '';
      form.gender.value = existing.gender || 'male';
      if(existing.dob) form.dob.value = new Date(existing.dob).toISOString().slice(0,10);
      if(existing.releaseDate) form.releaseDate.value = new Date(existing.releaseDate).toISOString().slice(0,16);
      form.judgment.value = existing.judgment || '';
      form.fineAmount.value = existing.fineAmount || '';
      if(existing.roomId) form.roomId.value = existing.roomId._id || existing.roomId;
    }

    const submit = el('button',{class:'btn', onclick: async (e)=>{ e.preventDefault();
      const fd = new FormData(form);
      if(!form.fullName.value.trim()) return alert('Full name required');
      try{
        if(isEdit){
          await window.api.updateCriminal(existing._id, fd);
          alert('Saved');
        } else {
          await window.api.createCriminal(fd);
          alert('Created');
        }
        modal.remove(); renderCriminals();
      } catch(err){ alert('Error: ' + (err.message||err)); }
    }}, [isEdit ? 'Save' : 'Create']);
    inner.appendChild(form);
    inner.appendChild(el('div',{},[submit, el('button',{class:'btn secondary', onclick:()=> modal.remove()},['Cancel'])]));
    modal.appendChild(inner); document.body.appendChild(modal);
  }

  function showAddRoomModal(){
    const modal = el('div',{class:'modal'},[]);
    const inner = el('div',{class:'inner'},[]);
    inner.appendChild(el('h3',{},['Add Room']));
    const name = el('input',{class:'input', placeholder:'Room name'});
    const capacity = el('input',{class:'input', type:'number', placeholder:'Capacity'});
    const submit = el('button',{class:'btn', onclick:async ()=>{
      try{
        await window.api.createRoom({ name: name.value, capacity: Number(capacity.value||0) });
        alert('Room created');
        modal.remove();
        renderRooms();
      } catch(e){ alert('Failed: ' + (e.message||e)); }
    }},['Create']);
    inner.appendChild(el('div',{},[el('div',{class:'label'},['Name']), name]));
    inner.appendChild(el('div',{},[el('div',{class:'label'},['Capacity']), capacity]));
    inner.appendChild(el('div',{},[submit, el('button',{class:'btn secondary', onclick:()=> modal.remove()},['Cancel'])]));
    modal.appendChild(inner); document.body.appendChild(modal);
  }

  function showPayModal(c){
    const modal = el('div',{class:'modal'},[]);
    const inner = el('div',{class:'inner'},[]);
    inner.appendChild(el('h3',{},['Pay fine: ' + c.fullName]));
    const paid = (c.payments||[]).reduce((s,p)=>s+p.amount,0);
    const remaining = (c.fineAmount||0) - paid;
    inner.appendChild(el('div',{},['Remaining: ' + remaining]));
    const amt = el('input',{type:'number',placeholder:'Amount', min:'0.01', class:'input'});
    const note = el('input',{placeholder:'Note (optional)', class:'input'});
    const btn = el('button',{class:'btn', onclick: async ()=>{
      const a = Number(amt.value);
      if(!a || a<=0 || a>remaining) return alert('Invalid amount');
      try{
        await window.api.createPayment(c._id, a, 'admin', note.value);
        alert('Payment saved');
        modal.remove();
        renderCriminals();
      } catch(e){ alert('Error: ' + (e.message||e)); }
    }},['Pay']);
    inner.appendChild(amt); inner.appendChild(note); inner.appendChild(btn);
    modal.appendChild(inner); document.body.appendChild(modal);
  }
// Export: download blob (now respects criminalFilters and accepts optional params)
async function renderExport(extra = {}) {
  try {
    showSpinner(true);

    // build params from global filter state plus any extra overrides (e.g. roomId)
    const params = Object.assign({}, {
      q: criminalFilters.q || '',
      status: criminalFilters.status || '',
      committedType: criminalFilters.committedType || '',
      roomId: criminalFilters.roomId || ''   // <-- ensure roomId is included
    }, extra || {});

    // call API (raw response)
    const res = await window.api.exportPdf(params);
    if (!res) throw new Error('No response from export endpoint');

    if (res.ok) {
      const blob = await res.blob();
      // filename including filters or room
      const parts = [];
      if (params.roomId) parts.push('room-' + params.roomId);
      if (params.committedType) parts.push(params.committedType);
      if (params.status) parts.push(params.status);
      if (params.q) parts.push('q-' + params.q.replace(/\s+/g,'_').slice(0,60));
      const date = (new Date()).toISOString().slice(0,19).replace(/[:T]/g,'-');
      const filename = 'criminals-export' + (parts.length ? '-' + parts.join('-') : '') + '-' + date + '.pdf';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } else {
      // try to get text for debugging
      let text = '';
      try { text = await res.text(); } catch(e){ text = ''; }
      alert('Export request failed. Server response: ' + (text || `HTTP ${res.status}`));
    }
  } catch (e) {
    alert('Export failed: ' + (e.message || e));
  } finally {
    showSpinner(false);
  }
}


  renderNav();
  if(isController()) renderDashboard(); else renderCriminals();

  searchBtn.addEventListener('click', ()=> renderCriminals());
  searchInput.addEventListener('keydown', (e)=> { if(e.key === 'Enter') renderCriminals(); });

  window.appRender = { renderCriminals, renderRooms, renderDashboard, renderRecycleBin };

})();
//server

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
app.use('/api/criminals', criminalRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/export', exportRoutes);

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
