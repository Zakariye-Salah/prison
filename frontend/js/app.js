// frontend/js/app.js
(function(){
  const view = document.getElementById('view');
  const navLinks = document.getElementById('nav-links');          // desktop nav container
  const mobileNavDropdown = document.getElementById('mobile-nav-dropdown'); // mobile dropdown
  const toolbarActions = document.getElementById('toolbar-actions'); // right-side toolbar actions (page toolbar)
  const spinner = document.getElementById('spinner');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');
  const globalSearch = document.getElementById('global-search');
  const searchBtn = document.getElementById('search-btn');

  const BACKEND_BASE = (window.api && window.api.BACKEND_BASE)
    ? window.api.BACKEND_BASE
    : (window.api && window.api.API_ROOT ? window.api.API_ROOT.replace(/\/api$/,'') : window.location.origin);

  function showSpinner(show=true){ spinner?.classList.toggle('hidden', !show); }

  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    for(const k in attrs){
      if(k==='class') e.className = attrs[k];
      else if(k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children)?children:[]).forEach(c => {
      if (c === null || c === undefined) return;
      if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
        e.appendChild(document.createTextNode(String(c)));
      } else if (c instanceof Node) {
        e.appendChild(c);
      } else {
        e.appendChild(document.createTextNode(String(c)));
      }
    });
    return e;
  }
  
  let dashboardChart = null;
  let dashboardInterval = null;
/* ---------- small helpers ---------- */
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'').trim());
}
function validateSecret4(s) {
  return /^\d{4}$/.test(String(s||'').trim());
}
function computeAgeFromDOB(dob) {
  if(!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth)) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}



 /* ---------- Add/Edit Prison modal with region->district dependent selects ---------- */
 /* small region->district map derived from your list; you can extend */
 const REGION_DISTRICTS = {
  "Awdal": ["Borama","Zeila","Lughaya","Baki"],
  "Bakool": ["El Barde","Hudur","Tiyeglow","Wajid","Rabdhure"],
  "Banaadir": ["Abdiaziz","Bondhere","Daynile","Dharkenley","Hamar Jajab","Hamar Weyne","Hodan","HawlWadag","Huriwa","Karan","Shibis","Shangani","Waberi","Wadajir","Wardhigley","Yaqshid","Kaxda"],
  "Bari": ["Bayla","Bosaso","Alula","Iskushuban","Qandala","Qardho"],
  "Bay": ["Baidoa","Burhakaba","Dinsoor","Qasahdhere"],
  "Galguduud": ["Abudwaq","Adado","Dhusamareb","El Buur","El Dher"],
  "Gedo": ["Bardhere","Beled Hawo","El Wak","Dolow","Garbaharey","Luuq"],
  "Hiiraan": ["Beledweyne","Buloburde","Jalalaqsi","Mataban","Mahas","Farlibax","Moqokori","Halgan"],
  "Jubbada Hoose": ["Afmadow","Badhadhe","Jamame","Kismayo"],
  "Shabeellaha Hoose": ["Afgooye","Barawa","Kurtunwarey","Merca","Qoriyoley","Sablale","Wanlaweyn"],
  "Jubbada Dhexe": ["Bu'ale","Jilib","Sakow"],
  "Shabeellaha Dhexe": ["Adale","Adan Yabal","Balad","Jowhar","Mahaday","Runirgod","Warsheikh"],
  "Mudug": ["Galkayo","Galdogob","Harardhere","Hobyo","Jariban"],
  "Nugaal": ["Garowe","Burtinle","Eyl","Dangorayo","Godobjiran"],
  "Sanaag": ["Erigavo","Badhan","Dhahar"],
  "Sool": ["Laascaanood","Hudun","Taleex"],
  "Togdheer": ["Burao","Oodweyne","Buhoodle","Sheikh"],
  "Woqooyi Galbeed": ["Hargeisa","Berbera","Gabiley"]
};
/* ---------- small centered login-required modal ---------- */
function showAuthRequiredModal(msg='Please login to view this item') {
  const modal = el('div',{class:'modal'},[]);
  const inner = el('div',{class:'inner'},[]);
  const closeBtn = el('button',{class:'close-btn', onclick:()=> modal.remove(), title:'Close'},['✕']);
  inner.appendChild(closeBtn);
  inner.appendChild(el('h3',{},['inaad isdiwangelid waa qasab']));
  inner.appendChild(el('div',{style:'margin:8px 0'},[msg]));
  const loginBtn = el('button',{class:'btn', onclick: ()=> { modal.remove(); showLoginModal(); }},['Login']);
  const cancelBtn = el('button',{class:'btn secondary', onclick: ()=> modal.remove()},['Cancel']);
  inner.appendChild(el('div',{},[loginBtn, cancelBtn]));
  modal.appendChild(inner);
  document.body.appendChild(modal);
  return modal;
}
  function isController(){ return localStorage.getItem('role') === 'controller'; }
  function isLogged(){ return !!localStorage.getItem('token'); }
  function currentUserName(){ return localStorage.getItem('fullName') || localStorage.getItem('username') || 'You'; }

  // NAV config in desired order: username first, then dashboard..., then logout
// NAV config: [labelText, id, fn, controllerOnly]
const NAV_ITEMS_ORDER = [
  // special "user" slot (renderNav handles this id to show Login or username)
  ['You','user', null, false],

  // main nav entries (label shown to user, id used internally — keep ids simple)
  ['Bogga Hore','dashboard', renderDashboard, true],          // controllerOnly = true (as you had)
  ['Maxaabiis','criminals', renderCriminals, false],
  ['Qololka maxaabiista','rooms', renderRooms, false],
  ['Xabsiyada','prisons', renderPrisons, false],
  ['Santuuqa Qashinka','recycle', renderRecycleBin, true],
  ['Isticmaalyaasha','users', renderUsers, true],

  // logout (renderNav treats this id specially)
  ['Logout','logout', null, false]
];


  // Build nav for desktop & mobile (mobile dropdown uses same items)
  function renderNav(){
    navLinks.innerHTML = '';
    mobileNavDropdown.innerHTML = '';

    NAV_ITEMS_ORDER.forEach(([labelText, id, fn, controllerOnly])=>{
      if(controllerOnly && !isController()) return;

      // user slot: show username when logged in, otherwise show 'Login' action
      if(id === 'user'){
        if(isLogged()){
          const name = currentUserName();
          const userEl = el('div',{class:'nav-user', title: name},[name]);
          navLinks.appendChild(userEl);
          const mu = el('div',{class:'mobile-user', onclick: ()=> { hideMobileNav(); } },[name]);
          mobileNavDropdown.appendChild(mu);
        } else {
          // show Login button if not logged in
          const loginDesktop = el('a',{href:'#', onclick:(e)=>{ e.preventDefault(); showLoginModal(); }},['Login']);
          loginDesktop.id = 'nav-login';
          navLinks.appendChild(loginDesktop);
          const loginMobile = el('a',{href:'#', onclick:(e)=>{ e.preventDefault(); showLoginModal(); hideMobileNav(); }},['Login']);
          mobileNavDropdown.appendChild(loginMobile);
        }
        return;
      }

      // logout entry handled below (only when logged)
      if(id === 'logout'){
        if(isLogged()){
          const a = el('a',{href:'#', onclick:(e)=>{ e.preventDefault(); doLogout(); }},['Logout']);
          a.id = 'nav-logout';
          navLinks.appendChild(a);
          const ma = el('a',{href:'#', onclick:(e)=>{ e.preventDefault(); doLogout(); hideMobileNav(); }},['Logout']);
          mobileNavDropdown.appendChild(ma);
        } else {
          // when not logged, do not show Logout in nav (Login is shown in user slot)
        }
        return;
      }

      // normal nav items
      const a = el('a',{href:'#', onclick:(e)=>{ e.preventDefault(); setActiveNav(id); if(fn) fn(); }},[labelText.charAt(0).toUpperCase() + labelText.slice(1)]);
      a.id = 'nav-' + id;
      navLinks.appendChild(a);

      const ma = el('a',{href:'#', onclick:(e)=>{ e.preventDefault(); setActiveNav(id); if(fn) fn(); hideMobileNav(); }},[labelText.charAt(0).toUpperCase() + labelText.slice(1)]);
      mobileNavDropdown.appendChild(ma);
    });

    // toolbar actions (export / add buttons) on the page toolbar area
    if(toolbarActions){
      toolbarActions.innerHTML = '';
     
      if(isController()){
        toolbarActions.appendChild(el('button',{class:'btn secondary', onclick: renderExport},['Degso']));
        toolbarActions.appendChild(el('button',{class:'btn', onclick: ()=> showEditCriminalModal(null)},['kudar Maxbuus']));
        toolbarActions.appendChild(el('button',{class:'btn', onclick: showAddRoomModal},['kudar qol']));
      }
    }

    // set the default active nav (prefer criminals)
    setActiveNav('criminals');
  }

  function setActiveNav(id){
    // clear all
    document.querySelectorAll('.nav-links a').forEach(a=>a.classList.remove('active'));
    // mark desktop
    const elDesktop = document.getElementById('nav-' + id);
    if(elDesktop) elDesktop.classList.add('active');

    // mobile highlight
    const mItems = Array.from(mobileNavDropdown.querySelectorAll('a'));
    mItems.forEach(a=> a.classList.remove('active'));
    const match = mItems.find(a => a.textContent.trim().toLowerCase() === (id.toLowerCase()));
    if(match) match.classList.add('active');
  }


  // ===== header fixed helper: measure header/toolbars and set layout =====
(function fixHeaderLayout(){
  const topbarEl = document.querySelector('.topbar');
  const toolbarEl = document.querySelector('.page-toolbar');
  const appShell = document.querySelector('.app-shell') || document.querySelector('#view') || document.body;

  function updateLayout(){
    if(!topbarEl || !toolbarEl) return;
    // measure real heights
    const topH = Math.ceil(topbarEl.getBoundingClientRect().height);
    const toolbarH = Math.ceil(toolbarEl.getBoundingClientRect().height);
    // write CSS vars (use documentElement so CSS can read them)
    document.documentElement.style.setProperty('--topbar-height', topH + 'px');
    document.documentElement.style.setProperty('--toolbar-height', toolbarH + 'px');
    // ensure app content is pushed down so nothing is hidden
    const extra = 16; // breathing room
    const pad = topH + toolbarH + extra;
    if(appShell) appShell.style.paddingTop = pad + 'px';
    // position mobile dropdown below toolbar (if it exists)
    const mobile = document.getElementById('mobile-nav-dropdown');
    if(mobile){
      // absolute from top of viewport
      mobile.style.top = (topH + toolbarH + 8) + 'px';
    }
    // also make sure the mobile toggle button stays on top
    const toggle = document.getElementById('toggle-sidebar');
    if(toggle) toggle.style.zIndex = 2400;
  }

  // run once now and on next animation frame (helpful after DOM mutations)
  updateLayout();
  requestAnimationFrame(updateLayout);

  // update on resize and if DOM changes (like login adding buttons) we recalc
  window.addEventListener('resize', updateLayout);
  // also observe mutations that might change header height
  try {
    const obs = new MutationObserver(updateLayout);
    if(topbarEl) obs.observe(topbarEl, { subtree: true, childList: true, characterData: true });
    if(toolbarEl) obs.observe(toolbarEl, { subtree: true, childList: true, characterData: true });
  } catch(e){ /* ignore in old browsers */ }
})();

  // mobile nav show/hide helpers
  function showMobileNav(){
    mobileNavDropdown.classList.remove('hidden');
    mobileNavDropdown.setAttribute('aria-hidden','false');
    toggleSidebarBtn.setAttribute('aria-expanded','true');
  }
  function hideMobileNav(){
    mobileNavDropdown.classList.add('hidden');
    mobileNavDropdown.setAttribute('aria-hidden','true');
    toggleSidebarBtn.setAttribute('aria-expanded','false');
  }
  function toggleMobileNav(){
    if(mobileNavDropdown.classList.contains('hidden')) showMobileNav(); else hideMobileNav();
  }

  // clicking outside closes mobile nav
  document.addEventListener('click', (e)=>{
    if(!mobileNavDropdown || mobileNavDropdown.classList.contains('hidden')) return;
    const inside = mobileNavDropdown.contains(e.target) || toggleSidebarBtn.contains(e.target);
    if(!inside) hideMobileNav();
  });

  // wire toggle click (hamburger visible only on mobile via CSS)
  toggleSidebarBtn?.addEventListener('click', (e)=>{
    e.stopPropagation();
    toggleMobileNav();
  });

  // log out helper with confirmation; on success show Login in nav
  function doLogout(){
    const ok = confirm('Ma hubtaa inaad ka baxayso (Logout)?');
    if(!ok) return;
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('fullName');
    // re-render nav and show default page (criminals)
    renderNav();
    renderCriminals();
    hideMobileNav();
  }

  // SEARCH wiring: search box is in page-toolbar now
  if(searchBtn){
    searchBtn.addEventListener('click', ()=> {
      const top = globalSearch;
      // copy to criminals local (if open) and run search
      const local = document.getElementById('criminal-search');
      if(local && top){ local.value = top.value; renderCriminals(); }
      else renderCriminals();
      hideMobileNav();
    });
  }
  if(globalSearch){
    globalSearch.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){
        const local = document.getElementById('criminal-search');
        if(local) local.value = globalSearch.value;
        renderCriminals();
        hideMobileNav();
      }
    });
  }

  
/* ---------- Wire page-level search buttons so they update criminalFilters before render ---------- */
if (typeof searchBtn !== 'undefined' && searchBtn) {
  searchBtn.addEventListener('click', (e)=> {
    e.preventDefault();
    if(globalSearch) criminalFilters.q = globalSearch.value.trim();
    // if on criminals page, copy to local and render
    const local = document.getElementById('criminal-search');
    if(local) local.value = criminalFilters.q;
    renderCriminals();
    hideMobileNav();
  });
}
if (typeof globalSearch !== 'undefined' && globalSearch) {
  globalSearch.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){
      e.preventDefault();
      criminalFilters.q = globalSearch.value.trim();
      const local = document.getElementById('criminal-search');
      if(local) local.value = criminalFilters.q;
      renderCriminals();
      hideMobileNav();
    }
  });
}


  // spinner and helpers
  function clearView(){ if(view) view.innerHTML=''; }

 /* ---------- LOGIN modal (supports two-step secret flow) ---------- */
 function showLoginModal(){
  const modal = el('div',{class:'modal'},[]);
  const inner = el('div',{class:'inner'},[]);
  const closeBtn = el('button',{class:'close-btn', onclick: ()=> modal.remove(), title:'Close'},['✕']);
  inner.appendChild(closeBtn);

  const email = el('input',{placeholder:'email', class:'input', type:'email'});
  const pass  = el('input',{placeholder:'password', type:'password', class:'input'});
  const submit = el('button',{class:'btn', onclick: async ()=>{
    try {
      if(!validateEmail(email.value)) return alert('Iimayl aan sax ahayn');
      const r = await window.api.post('/auth/login', { email: email.value.trim(), password: pass.value });
      // if server requests admin secret
      if (r && r.requiresAdminSecret && r.tempToken) {
        const secret = prompt('Gali Numberka  Xaqiijinta 2FA:');
        if(!secret) return alert('2FA Qasab waayo');
        if(!validateSecret4(secret)) return alert('2FA waa inuu noqdaa 4 number');
        // verify
        const v = await window.api.post('/auth/verify-admin-secret', { tempToken: r.tempToken, secret: secret });
        if(v && v.token){
          localStorage.setItem('token', v.token);
          localStorage.setItem('role', v.role || 'viewer');
          if(v.fullName) localStorage.setItem('fullName', v.fullName);
          modal.remove(); renderNav(); renderDashboard();
          return;
        }
        return alert('Invalid secret');
      } else if (r && r.token) {
        localStorage.setItem('token', r.token);
        localStorage.setItem('role', r.role || 'viewer');
        if(r.fullName) localStorage.setItem('fullName', r.fullName);
        modal.remove(); renderNav(); renderCriminals(); return;
      } else {
        return alert('Gelitaanku wuu fashilmay');
      }
    } catch(err){ alert('Cilad baa jirta: ' + (err.message||err)); }
  }},['Sign in']);

  inner.appendChild(el('h3',{},['Login']));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Email']), email]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Password']), pass]));
  inner.appendChild(el('div',{},[submit]));

  inner.appendChild(el('div',{style:'margin-top:10px;text-align:center'},[
    el('a',{href:'#', onclick:(e)=>{ e.preventDefault(); modal.remove(); showRegisterModal(); }},["koonto ma lihi - is diwaangeli"])
  ]));

  modal.appendChild(inner);
  document.body.appendChild(modal);
}

/* ---------- REGISTER modal ---------- */
function showRegisterModal(){
  const modal = el('div',{class:'modal'},[]);
  const inner = el('div',{class:'inner'},[]);
  const closeBtn = el('button',{class:'close-btn', onclick: ()=> modal.remove(), title:'Close'},['✕']);
  inner.appendChild(closeBtn);

  inner.appendChild(el('h3',{},['Isdiwaangelin']));
  const fullName = el('input',{class:'input', placeholder:'Magacaada oo dhameestiran'});
  const email = el('input',{class:'input', placeholder:'Email', type:'email'});
  const password = el('input',{class:'input', type:'password', placeholder:'Password'});
  const password2 = el('input',{class:'input', type:'password', placeholder:'Xaqiiji password'});

  const submit = el('button',{class:'btn', onclick: async ()=>{
    if(!fullName.value.trim() || !email.value.trim() || !password.value) return alert('Fadlan buuxi meelaha loo baahan yahay ee banaan');
    if(!validateEmail(email.value)) return alert('Invalid email');
    if(password.value !== password2.value) return alert(' passwordka isma lahan');
    try {
      const res = await window.api.post('/users/register', { fullName: fullName.value.trim(), email: email.value.trim(), password: password.value });
      if(res && res.token) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('role', res.role || 'viewer');
        if(res.fullName) localStorage.setItem('fullName', res.fullName);
        modal.remove();
        renderNav();
        renderCriminals();
        return;
      }
      alert('Diiwaangelintu way fashilantay');
    } catch(err){ alert('Cilad diwaangelin: ' + (err.message||err)); }
  }},['Create account']);

  inner.appendChild(el('div',{},[el('div',{class:'label'},['Full name']), fullName]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Email']), email]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Password']), password]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Confirm password']), password2]));
  inner.appendChild(el('div',{},[submit, el('button',{class:'btn secondary', onclick:()=> modal.remove()},['Cancel'])]));

  inner.appendChild(el('div',{style:'margin-top:10px;text-align:center'},[
    el('a',{href:'#', onclick:(e)=>{ e.preventDefault(); modal.remove(); showLoginModal(); }},["Horay ayaan isku diwaangeliyay[Login]"])
  ]));

  modal.appendChild(inner);
  document.body.appendChild(modal);
}
  
// global filters
let criminalFilters = {
  q: '',
  status: '',
  committedType: '',
  roomId: ''   // new: selected room filter (empty = all)
};


/* ---------- Build criminals header (search & filters) - uses criminalFilters ---------- */
function buildCriminalsHeader() {
  const header = el('div',{class:'toolbar', style:'display:flex;gap:8px;align-items:center;flex-wrap:wrap'},[]);

  // local search input
  const qNode = el('input',{
    id:'criminal-search',
    placeholder:'Ku raadi Maxbuuska ID, magaca ama Lambarka Aqoonsiga Qaran...',
    class:'search-field',
    style:'min-width:220px'
  },[]);
  qNode.value = criminalFilters.q || (globalSearch && globalSearch.value) || '';

  qNode.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') {
      e.preventDefault();
      criminalFilters.q = qNode.value.trim();
      renderCriminals();
    }
  });
  header.appendChild(qNode);

  // ROOM select (default: All rooms). We'll populate options async.
  const roomSel = el('select',{id:'filter-room', class:'search-field'},[
    el('option',{value:''},['Dhaamaan Qoloka'])
  ]);
  // if previously selected, set value after creating
  try { roomSel.value = criminalFilters.roomId || ''; } catch(e){}

  header.appendChild(roomSel);

  // status select
  const statusSel = el('select',{id:'filter-status', class:'search-field'},[
    el('option',{value:''},['All statuses']),
    el('option',{value:'in_prison'},['In prison']),
    el('option',{value:'out'},['Out']),
    el('option',{value:'dead'},['Dead'])
  ]);

  // type select
  const typeSel = el('select',{id:'filter-type', class:'search-field'},[
    el('option',{value:''},['All types']),
    el('option',{value:'dil'},['dil']), el('option',{value:'dhac'},['dhac']),
    el('option',{value:'kufsi'},['kufsi']), el('option',{value:'is dabmarin'},['is dabmarin']),
    el('option',{value:'musuqmaasuq'},['musuqmaasuq']), el('option',{value:'other'},['other'])
  ]);

  // Initialize selects from state so they don't reset
  try{ statusSel.value = criminalFilters.status || ''; }catch(e){}
  try{ typeSel.value = criminalFilters.committedType || ''; }catch(e){}

  // Filter button updates state and re-renders
  const filterBtn = el('button',{ type:'button', class:'btn secondary' },['Sifee']);
  filterBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    criminalFilters.q = qNode.value.trim();
    criminalFilters.status = statusSel.value || '';
    criminalFilters.committedType = typeSel.value || '';
    criminalFilters.roomId = roomSel.value || '';
    renderCriminals();
  });

  header.appendChild(statusSel);
  header.appendChild(typeSel);
  header.appendChild(filterBtn);

  // async populate rooms (non-blocking)
  (async () => {
    try {
      const r = await window.api.getRooms();
      const rooms = r.rooms || [];
      // clear existing options except the first ("All rooms")
      roomSel.innerHTML = '';
      roomSel.appendChild(el('option',{value:''},['All rooms']));
      rooms.forEach(room => {
        // show readable label: room.name (prisonName)
        const prisonName = room.prisonRef ? (room.prisonRef.name || '') : (room.prisonId || '');
        const label = (room.name || '—') + (prisonName ? (' • ' + prisonName) : '');
        roomSel.appendChild(el('option',{value: room._id},[ label ]));
      });
      // restore previous selection if present
      try { roomSel.value = criminalFilters.roomId || ''; } catch(e){}
    } catch(err) {
      // ignore: keep default "All rooms"
    }
  })();

  return header;
}


  // fetch wrapper
  async function fetchCriminalsByQuery(qstr){
    return await window.api.getCriminals(qstr || '');
  }

  /* ---------- RENDER criminals — uses the criminalFilters state to construct query ---------- */
async function renderCriminals(){
  setActiveNav('criminals');
  showSpinner(true);
  clearView();

  // Make sure globalSearch value is applied to filters if user typed there
  if(globalSearch && globalSearch.value && !criminalFilters.q) {
    criminalFilters.q = globalSearch.value.trim();
  }

  view.appendChild(el('h2',{},['Maxaabiis']));
  const header = buildCriminalsHeader();
  view.appendChild(header);

  // grid container for the criminal cards (responsive)
  const list = el('div',{class:'criminal-grid'},[]);
  // skeleton rows
  for(let i=0;i<6;i++){
    const temp = document.getElementById('criminal-row')?.content.cloneNode(true);
    if(temp) list.appendChild(temp);
  }
  view.appendChild(list);

  try{
       // build query string from state
       const params = [];
       if(criminalFilters.q) params.push(`q=${encodeURIComponent(criminalFilters.q)}`);
       if(criminalFilters.status) params.push(`status=${encodeURIComponent(criminalFilters.status)}`);
       if(criminalFilters.committedType) params.push(`committedType=${encodeURIComponent(criminalFilters.committedType)}`);
       if(criminalFilters.roomId) params.push(`roomId=${encodeURIComponent(criminalFilters.roomId)}`);
       const qstr = params.join('&');
   
    const data = await fetchCriminalsByQuery(qstr);

    list.innerHTML = '';
    const rows = data.criminals || [];
    if(rows.length === 0) list.appendChild(el('div',{class:'card'},['Dembiile lama helin']));
    rows.forEach(c=>{
      const card = el('div',{class:'card criminal-row'},[]);
      const thumb = el('div',{class:'thumb'},[]);
      if (c.photoUrl) {
        let src = String(c.photoUrl);
        if (!src.startsWith('http://') && !src.startsWith('https://')) {
          if (!src.startsWith('/')) src = '/' + src;
          src = BACKEND_BASE + src;
        }
        const img = el('img', { src, alt: c.fullName || 'photo' });
        img.onerror = function(){ this.onerror=null; this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#e6ecf8"/><text x="28" y="32" font-size="12" text-anchor="middle" fill="#6b7280">no image</text></svg>'; };
        thumb.appendChild(img);
      } else {
        thumb.className='skeleton skeleton--avatar';
      }

      const meta = el('div',{class:'meta'},[]);
      const prisonName = c.prisonRef ? (c.prisonRef.name || '') : (c.prisonId ? c.prisonId : '');
      const roomName = c.roomId ? (c.roomId.name || '') : 'No room';
      meta.appendChild(el('div',{class:'muted'},[
        c.nationalId ? ('NIRA ID: ' + c.nationalId + ' • ') : '',
        roomName ? (roomName + ' • ') : '',
        prisonName ? (prisonName + ' • ') : '',
        (c.status || '—'),
        (c.pausedRemainingMs ? (' • paused') : '')
      ]));
      

      const actions = el('div',{class:'actions'},[]);
      // View should require login -> your showCriminalDetails already checks isLogged()
      actions.appendChild(el('button',{class:'icon-small', onclick:()=> showCriminalDetails(c._id)},['Fiiri']));


   



      if(isController()){
           // add status button for controllers (shows current status text)
  const statusText = (c.status === 'in_prison') ? 'In prison' : (c.status === 'out' ? 'Out' : (c.status === 'dead' ? 'Dead' : c.status));
  actions.appendChild(el('button', { class: 'icon-small', onclick: () => openStatusModal(c) }, [statusText]));
        actions.appendChild(el('button',{class:'icon-small', onclick:()=> showEditCriminalModal(c)},['Edit']));
        actions.appendChild(el('button',{class:'icon-small', onclick:async ()=>{ if(confirm('Kutuur Qashinka?')){ await window.api.deleteCriminal(c._id); alert('Qashinkaad ku tuurtay'); renderCriminals(); } }},['Delete']));
        const paidSum = (c.payments||[]).reduce((s,p)=>s+p.amount,0);
        const remaining = (c.fineAmount||0) - paidSum;
        if(remaining > 0) actions.appendChild(el('button',{class:'btn', onclick:()=> showPayModal(c)},['Pay']));
      }

      card.appendChild(thumb); card.appendChild(meta); card.appendChild(actions);
      list.appendChild(card);
    });
  } catch(e){
    list.innerHTML = '<div class="card">Failed to load. ' + (e.message||e) + '</div>';
  } finally{
    showSpinner(false);
    // keep the top globalSearch synced with current filter.q
    if(globalSearch) globalSearch.value = criminalFilters.q || '';
  }
}


  // Render only criminals in a specific room (from Rooms -> View)
  async function showRoomCriminals(room){
    setActiveNav('rooms');
    showSpinner(true);
    clearView();
    view.appendChild(el('h2',{},['Criminals in ' + (room.name || '—')]));
    const list = el('div',{},[]);
    view.appendChild(list);
    try{
      const data = await fetchCriminalsByQuery(`roomId=${encodeURIComponent(room._id)}`);
      const rows = data.criminals || [];
      if(rows.length===0) list.appendChild(el('div',{class:'card'},['Maxbuus maku jiro Qolkaan..']));
      rows.forEach(c=>{
        const card = el('div',{class:'card criminal-row'},[]);
        const thumb = el('div',{class:'thumb'},[]);
        if(c.photoUrl){
          let src = String(c.photoUrl);
          if (!src.startsWith('http')) src = BACKEND_BASE + (src.startsWith('/')?src:'/'+src);
          thumb.appendChild(el('img',{src, alt:c.fullName}));
        } else thumb.className='skeleton skeleton--avatar';
        const meta = el('div',{class:'meta'},[]);
        meta.appendChild(el('div',{},[el('strong',{},[c.prisonId || '—']), ' ', c.fullName]));
        meta.appendChild(el('div',{class:'muted'},[c.status || '—']));
        const actions = el('div',{},[ el('button',{class:'icon-small', onclick:()=> showCriminalDetails(c._id)},['View']) ]);
        card.appendChild(thumb); card.appendChild(meta); card.appendChild(actions);
        list.appendChild(card);
      });
    } catch(e){ list.innerHTML = '<div class="card">Failed: ' + (e.message||e) + '</div>'; }
    finally{ showSpinner(false); }
  }
// helper: ensure Chart.js is loaded (returns Promise)
function ensureChartJs() {
  if (window.Chart) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('waa Ku guul daraystay in la soo geliyo Shaxda dembiilayaasha'));
    document.head.appendChild(s);
  });
}


// number formatter
function formatNumber(n){
  try { return new Intl.NumberFormat().format(n); } catch (e) { return String(n); }
}

// get CSS variable safely
function cssVar(name, fallback){
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch(e){ return fallback; }
}
// ---------- helpers ----------

// small helper: animate a number inside an element from 0 -> to over duration (ms)
function animateCount(el, to, duration = 800) {
  if (el.__rafCancel) { el.__rafCancel(); el.__rafCancel = null; }
  const start = 0;
  const target = Number(to) || 0;
  const startTime = performance.now();
  const fmt = new Intl.NumberFormat();
  let rafId = null;
  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const value = Math.round(start + (target - start) * ease);
    el.textContent = fmt.format(value);
    if (t < 1) rafId = requestAnimationFrame(step);
    else { el.textContent = fmt.format(target); rafId = null; }
  }
  rafId = requestAnimationFrame(step);
  el.__rafCancel = () => { if (rafId) cancelAnimationFrame(rafId); rafId = null; };
  return el.__rafCancel;
}

// draw & animate a tiny sparkline on a canvas element
function animateSparkline(canvas, values = [], duration = 800, opts = {}) {
  // cancel previous
  if (canvas.__sparkCancel) { canvas.__sparkCancel(); canvas.__sparkCancel = null; }

  // basic options
  const width = opts.width || 120;
  const height = opts.height || 36;
  const padding = opts.padding || 4;
  const lineColor = opts.lineColor || getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#0b5ed7';
  const fillColor = opts.fillColor || (lineColor + '33');
  const bg = opts.bg || 'transparent';

  // HiDPI support
  const ratio = window.devicePixelRatio || 1;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  // clamp & sanitize values
  const data = Array.isArray(values) && values.length ? values.slice() : [0];
  const n = data.length;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = (max - min) || 1;

  // map data -> points in pixel coords
  function computePoints() {
    const w = width - padding * 2;
    const h = height - padding * 2;
    const pts = data.map((v, i) => {
      const x = padding + (w * (i / Math.max(1, n - 1)));
      const y = padding + h - ((v - min) / range) * h;
      return { x, y, v };
    });
    return pts;
  }

  const pts = computePoints();

  // animate drawing from 0 -> full over duration
  const startTime = performance.now();
  let rafId = null;

  function draw(progress) {
    // clear
    ctx.clearRect(0, 0, width, height);
    // background (if desired)
    if (bg !== 'transparent') {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
    }

    // compute how many points to show
    const t = Math.min(1, progress);
    // partial length along x
    const totalX = pts.length > 1 ? pts[pts.length - 1].x - pts[0].x : 0;
    const drawToX = pts[0].x + totalX * t;

    // build path up to drawToX
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // path
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        // if next point is beyond drawToX, interpolate to partial point
        if (p.x > drawToX) {
          const prev = pts[i - 1];
          const frac = (drawToX - prev.x) / Math.max(0.0001, (p.x - prev.x));
          const ix = prev.x + (p.x - prev.x) * frac;
          const iy = prev.y + (p.y - prev.y) * frac;
          ctx.lineTo(ix, iy);
          break;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
    }
    // stroke
    ctx.strokeStyle = lineColor;
    ctx.stroke();

    // fill under curve if desired (subtle)
    ctx.lineTo(pts[Math.max(0, Math.min(pts.length - 1, Math.floor((pts.length - 1) * t)))].x, height - padding);
    ctx.lineTo(pts[0].x, height - padding);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // easing
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

  function step(now) {
    const elapsed = now - startTime;
    const rawT = Math.min(1, elapsed / duration);
    const t = easeOutCubic(rawT);
    draw(t);
    if (rawT < 1) rafId = requestAnimationFrame(step);
    else rafId = null;
  }

  rafId = requestAnimationFrame(step);

  canvas.__sparkCancel = () => { if (rafId) cancelAnimationFrame(rafId); rafId = null; };
  return canvas.__sparkCancel;
}

// small utility: read CSS var (returns fallback if not set)
function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v ? v.trim() : fallback;
  } catch (e) { return fallback; }
}

// ---------- updated renderDashboard with sparkline support ----------
async function renderDashboard(){
  setActiveNav('dashboard');

  // clear previous live interval / chart
  if (dashboardInterval){ clearInterval(dashboardInterval); dashboardInterval = null; }
  if (dashboardChart){ try{ dashboardChart.destroy(); } catch(e){} dashboardChart = null; }

  showSpinner(true);
  clearView();

  const headerRow = el('div',{style:'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap'},[]);
  headerRow.appendChild(el('h2',{},['Dashboard']));
  if(isLogged()){
    headerRow.appendChild(el('button',{class:'btn', onclick: showEditProfileModal},['Edit profile']));
  }
  view.appendChild(headerRow);

  const wrap = el('div',{style:'display:flex;flex-direction:column;gap:12px'},[]);
  view.appendChild(wrap);

  try{
    const initialPeriod = 'monthly';
    let d;
    try { d = await window.api.get(`/dashboard?period=${initialPeriod}`); } catch(err) {
      try { d = await window.api.getDashboard(); } catch(e) { d = { stats: {}, chart: { labels: [], values: [] } }; }
    }

    // prepare sparklines source: prefer d.chart.values if present
    const chartValues = (d.chart && Array.isArray(d.chart.values) && d.chart.values.length) ? d.chart.values.slice() : null;

    // top stats cards with sparkline area
    const s = d.stats || {};
    const grid = el('div',{style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;'},[]);

    function makeStatCard(title, val, statKey){
      const targetVal = Number(val) || 0;
      // container elements
      const valueEl = el('span',{class:'stat-value', 'data-target': String(targetVal), style:'font-size:20px;font-weight:800;color:var(--accent);display:inline-block;min-width:48px;text-align:right'},['0']);
      // sparkline canvas
      const canvas = document.createElement('canvas');
      canvas.className = 'stat-sparkline';
      canvas.setAttribute('aria-hidden','true');
      canvas.style.display = 'inline-block';
      canvas.style.verticalAlign = 'middle';
      canvas.style.marginLeft = '10px';
      canvas.width = 120;
      canvas.height = 36;

      const row = el('div',{style:'display:flex;align-items:center;justify-content:space-between;gap:8px'},[
        el('div',{},[ el('div',{style:'font-size:13px;color:var(--muted);font-weight:700'},[title]) ]),
        el('div',{},[ valueEl, canvas ])
      ]);

      const card = el('div',{class:'card'},[ row ]);
      // store data-target and canvas on card for later animation
      card._valueEl = valueEl;
      card._sparkCanvas = canvas;
      card._statKey = statKey;
      return card;
    }

    const c1 = makeStatCard('Wadarta Maxaabiista', s.totalCriminals || 0, 'totalCriminals');
    const c2 = makeStatCard('Hadda xabsiga ku jira', s.currentlyIn || 0, 'currentlyIn');
    const c3 = makeStatCard('Wadarta Qololka', s.totalRooms || 0, 'totalRooms');
    const c4 = makeStatCard('Wadarta isticmaalayaasha', s.totalUsers || 0, 'totalUsers');

    grid.appendChild(c1);
    grid.appendChild(c2);
    grid.appendChild(c3);
    grid.appendChild(c4);
    wrap.appendChild(grid);

    // controls + chart area (kept same as before)...
    const ctrl = el('div',{class:'chart-controls', style:'display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap'},[]);
    const periodSel = el('select',{class:'input', id:'dashboard-period'},[
      el('option',{value:'daily'},['Daily']),
      el('option',{value:'weekly'},['Weekly']),
      el('option',{value:'monthly', selected:true},['Monthly']),
      el('option',{value:'yearly'},['Yearly']),
      el('option',{value:'live'},['Live (auto refresh)'])
    ]);
    const chartTypeSel = el('select',{class:'input', id:'dashboard-chart-type'},[
      el('option',{value:'line'},['Line (classic)']),
      el('option',{value:'smooth'},['Smooth Line (area-capable)']),
      el('option',{value:'area'},['Area (filled line)']),
      el('option',{value:'bar'},['Bar']),
      el('option',{value:'stackedBar'},['Stacked Bar'])
    ]);
    const refreshBtn = el('button',{class:'btn secondary', type:'button'},['Refresh']);
    ctrl.appendChild(el('div',{},['Group: '])); ctrl.appendChild(periodSel);
    ctrl.appendChild(el('div',{},['Chart: '])); ctrl.appendChild(chartTypeSel);
    ctrl.appendChild(refreshBtn);
    wrap.appendChild(ctrl);

    // chart canvas
    const chartCard = el('div',{class:'card chart-card', style:'margin-top:12px;flex-direction:column;min-height:360px;'},[]);
    const canvasWrap = el('div',{style:'position:relative;width:100%;height:360px;'},[]);
    const canvas = el('canvas',{id:'dashboardChart', style:'width:100%;height:100%;'},[]);
    canvasWrap.appendChild(canvas);
    chartCard.appendChild(canvasWrap);
    wrap.appendChild(chartCard);

    const fallback = el('div',{id:'dashboard-fallback', style:'margin-top:12px'},[]);
    wrap.appendChild(fallback);

    // helper: create gradient (same as earlier)
    function makeGradient(ctx, height, startColor, endColor){
      const g = ctx.createLinearGradient(0, 0, 0, height || 300);
      g.addColorStop(0, startColor);
      g.addColorStop(1, endColor);
      return g;
    }

    // loadChart (unchanged chart creation logic) - reuse earlier implementation in your code
    async function loadChart(period = 'monthly'){
      if (dashboardInterval){ clearInterval(dashboardInterval); dashboardInterval = null; }
      showSpinner(true);
      fallback.innerHTML = '';
      try {
        let resp;
        try { resp = await window.api.get(`/dashboard?period=${encodeURIComponent(period)}`); } catch(err) { resp = null; }
        let labels = [], values = [];
        if (resp && resp.chart && Array.isArray(resp.chart.labels)) {
          labels = resp.chart.labels;
          values = resp.chart.values || resp.chart.counts || [];
        } else {
          const all = await window.api.getCriminals('perPage=1000');
          const rows = all.criminals || [];
          const map = new Map();
          function keyForDate(dt){
            const y = dt.getFullYear();
            if(period === 'yearly') return String(y);
            if(period === 'monthly') return `${y}-${String(dt.getMonth()+1).padStart(2,'0')}`;
            if(period === 'weekly'){
              const tmp = new Date(dt.getTime());
              tmp.setHours(0,0,0,0);
              tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
              const week1 = new Date(tmp.getFullYear(),0,4);
              const weekNo = 1 + Math.round(((tmp - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
              return `${tmp.getFullYear()}-W${String(weekNo).padStart(2,'0')}`;
            }
            return `${y}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
          }
          rows.forEach(r => {
            const dt = r.createdAt ? new Date(r.createdAt) : new Date();
            const k = keyForDate(dt);
            map.set(k, (map.get(k) || 0) + 1);
          });
          labels = Array.from(map.keys()).sort();
          values = labels.map(k => map.get(k) || 0);
        }

        // (Chart.js rendering code — reuse your existing chart logic here)
        try { await ensureChartJs(); } catch(e) { /* ignore */ }

        const selectedType = (document.getElementById('dashboard-chart-type')?.value) || 'line';
        const canvasEl = document.getElementById('dashboardChart');
        if (!canvasEl) throw new Error('Canvas not found');

        const primary = cssVar('--primary','#0b5ed7') || '#0b5ed7';
        const accent = cssVar('--accent','#6f42c1') || '#6f42c1';
        const ctx = canvasEl.getContext('2d');
        const gradientFill = makeGradient(ctx, canvasEl.height || 300, `${primary}33`, `${primary}00`);
        const gradientBar = makeGradient(ctx, canvasEl.height || 300, `${accent}33`, `${accent}05`);

        if(window.Chart){
          const common = { labels, datasets: [] };
          if(selectedType === 'bar' || selectedType === 'stackedBar'){
            common.datasets.push({
              label: 'Criminals created',
              data: values,
              backgroundColor: gradientBar,
              borderColor: primary,
              borderWidth: 1,
              borderRadius: 6,
              barPercentage: 0.72,
              categoryPercentage: 0.7,
              stack: selectedType === 'stackedBar' ? 'stack1' : undefined
            });
          } else {
            common.datasets.push({
              label: 'Criminals created',
              data: values,
              fill: (selectedType === 'area' || selectedType === 'smooth') ? true : false,
              backgroundColor: (selectedType === 'area' || selectedType === 'smooth') ? gradientFill : 'transparent',
              borderColor: primary,
              borderWidth: 2.5,
              tension: (selectedType === 'smooth') ? 0.48 : 0.22,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: '#fff',
              pointBorderColor: primary,
              pointBorderWidth: 2
            });
          }

          const options = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            animation: { duration: 700, easing: 'easeOutQuart' },
            plugins: {
              legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 12, boxWidth: 10 } },
              tooltip: {
                enabled: true, padding: 10, backgroundColor: '#071124', titleColor: '#fff', bodyColor: '#e6eefc',
                usePointStyle: true,
                callbacks: {
                  label: function(ctx){ const val = ctx.raw ?? ctx.parsed?.y ?? ctx.parsed ?? 0; return `${ctx.dataset.label || ''}: ${formatNumber(val)}`; }
                }
              }
            },
            scales: {
              x: { display: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, title: { display: true, text: 'Period', color: '#071124' } },
              y: { display: true, beginAtZero: true, grid: { color: 'rgba(11,94,215,0.06)' }, title: { display: true, text: 'Count', color: '#071124' } }
            }
          };

          if (selectedType === 'stackedBar') { options.scales.x.stacked = true; options.scales.y.stacked = true; }

          const chartJsType = (selectedType === 'bar' || selectedType === 'stackedBar') ? 'bar' : 'line';
          if (dashboardChart){ try{ dashboardChart.destroy(); } catch(e){} dashboardChart = null; }

          dashboardChart = new Chart(ctx, { type: chartJsType, data: common, options });
        } else {
          // fallback table
          fallback.innerHTML = '';
          fallback.appendChild(el('div',{},['(Chart.js not available — showing table)']));
          const t = el('table',{style:'width:100%;border-collapse:collapse;margin-top:8px'},[]);
          const thead = el('thead',{},[ el('tr',{},[ el('th',{},['Period']), el('th',{},['Count']) ]) ]);
          const tbody = el('tbody',{},[]);
          labels.forEach((k,i) => tbody.appendChild(el('tr',{},[
            el('td',{style:'border:1px solid #eee;padding:6px'},[k]),
            el('td',{style:'border:1px solid #eee;padding:6px;text-align:right'},[String(values[i] || 0)])
          ])));
          t.appendChild(thead); t.appendChild(tbody);
          fallback.appendChild(t);
        }

        if (period === 'live') {
          dashboardInterval = setInterval(()=> loadChart('live'), 10000);
        }

        // After chart values are known, compute sparkline data for each stat card and animate
        // Use chartValues (labels) if available; else synthesize a trend for each stat
        const trendSource = (values && values.length) ? values.slice() : chartValues || null;

        // helper to build sparkline values for a stat
        function getSparkForStat(statKey, target){
          // if we have trendSource use last N points scaled to stat target
          const N = 8;
          if (trendSource && trendSource.length) {
            const arr = trendSource.slice(-N);
            // normalize to 0..target scale if target>0
            const maxSrc = Math.max(...arr) || 1;
            return arr.map(v => Math.round((v / maxSrc) * target));
          }
          // fallback synthetic small fluctuation around a fraction of target
          const out = [];
          for(let i=0;i<8;i++){
            const noise = (Math.random() * 0.24) - 0.12; // -12%..+12%
            const base = Math.max(0, target * (0.45 + (i/8)*0.55));
            out.push(Math.round(Math.max(0, base * (1 + noise))));
          }
          return out;
        }

        // find stat cards (we created c1..c4 above)
        const statCards = [c1, c2, c3, c4];
        statCards.forEach(card => {
          const vEl = card._valueEl;
          const canvasEl = card._sparkCanvas;
          const key = card._statKey;
          const tgt = Number(vEl.dataset.target) || 0;
          const sparkData = getSparkForStat(key, tgt);
          // animate number and sparkline together
          animateCount(vEl, tgt, 800);
          animateSparkline(canvasEl, sparkData, 800, { width: 120, height: 36, lineColor: cssVar('--primary','#0b5ed7') || '#0b5ed7' });
        });

      } catch(err){
        fallback.innerHTML = '<div class="card">Failed to load chart data: ' + (err.message||err) + '</div>';
      } finally {
        showSpinner(false);
      }
    }

    // initial load + bindings
    loadChart(initialPeriod);
    refreshBtn.addEventListener('click', ()=> loadChart(periodSel.value));
    periodSel.addEventListener('change', ()=> loadChart(periodSel.value));
    chartTypeSel.addEventListener('change', ()=> loadChart(periodSel.value));

  } catch(e){
    wrap.innerHTML = '<div class="card">Failed to load dashboard: ' + (e.message||e) + '</div>';
    showSpinner(false);
  } finally {
    showSpinner(false);
  }
}


async function showEditProfileModal(){
  try {
    showSpinner(true);
    const r = await window.api.get('/users/me'); // expects { id, userId, fullName, email, role }
    const u = r;
    showSpinner(false);

    const modal = el('div',{class:'modal'},[]);
    const inner = el('div',{class:'inner'},[]);
    inner.appendChild(el('h3',{},['Tafatir astaanta (profile)']));

    const fullName = el('input',{class:'input', value: u.fullName || '', placeholder:'Magacaada oo Dhameestiran'});
    const userId = el('input',{class:'input', value: u.userId || '', placeholder:'Isticmaalaha ID (Iktiyaar)'});
    const password = el('input',{class:'input', type:'password', placeholder:'New password (leave blank to keep)'});
    // secret only for controllers
    let secret;
    if(u.role === 'controller'){
      secret = el('input',{class:'input', type:'text', placeholder:'Two Fertification (leave blank to keep)'});
    }

    const submit = el('button',{class:'btn', onclick: async ()=>{
      const payload = {};
      if(fullName.value.trim()) payload.fullName = fullName.value.trim();
      if(userId.value.trim()) payload.userId = userId.value.trim();
      if(password.value) payload.password = password.value;
      if(secret && secret.value) payload.secret = secret.value;

      try {
        const res = await window.api.put('/users/me', payload);
        if(res && res.ok){
          if(res.user && res.user.fullName) localStorage.setItem('fullName', res.user.fullName);
          alert('Profile updated');
          modal.remove();
          renderNav();
          // re-render dashboard or current page
          if(isController()) renderDashboard(); else renderCriminals();
        } else {
          alert('Cusbooneysiita waa guuldareystay');
        }
      } catch(err){ alert('Cilada Cusbooneysii!!!: ' + (err.message || err)); }
    }},['Save']);

    inner.appendChild(el('div',{},[el('div',{class:'label'},['Full name']), fullName]));
    inner.appendChild(el('div',{},[el('div',{class:'label'},['User ID']), userId]));
    inner.appendChild(el('div',{},[el('div',{class:'label'},['New password']), password]));
    if(secret) inner.appendChild(el('div',{},[el('div',{class:'label'},['Two Factor number (controller)']), secret]));

    inner.appendChild(el('div',{},[submit, el('button',{class:'btn secondary', onclick:()=> modal.remove()},['Cancel'])]));
    modal.appendChild(inner); document.body.appendChild(modal);

  } catch(err) {
    showSpinner(false);
    alert('Failed to load profile: ' + (err.message||err));
  }
}

async function renderRooms(){
  setActiveNav('rooms');
  showSpinner(true);
  clearView();
  view.appendChild(el('h2',{},['Qololka Xabsiga']));

  // responsive grid container
  const list = el('div',{class:'rooms-grid'},[]);
  view.appendChild(list);

  try{
    const r = await window.api.getRooms();
    const rooms = r.rooms || [];
    if(rooms.length===0) list.appendChild(el('div',{class:'card'},['Weli qolal malahan']));

    rooms.forEach(room=>{
      const card = el('div',{class:'card room-row'},[]);

      // left content: room id, name (styled), and prison if present
      const prisonName = room.prisonRef ? (room.prisonRef.name || '') : '';
      const left = el('div',{style:'flex:1;min-width:0'},[
        el('div',{class:'item-title'},[ room.name || '—' ]),
        el('div',{class:'item-sub muted'},[
          (room.roomId ? ('ID: ' + room.roomId + (prisonName ? ' • ' : '')) : ''),
          (prisonName ? prisonName : '')
        ])
      ]);
      card.appendChild(left);

      // criminals preview block (count + small avatars) - filled async below
      const crimWrap = el('div',{class:'room-criminals', style:'margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap'},[]);
      const crimCountNode = el('div',{class:'crim-count muted'},['Criminals: ' + (typeof room.totalCriminals !== 'undefined' ? room.totalCriminals : '0')]);
      const avatars = el('div',{class:'crim-avatars', style:'display:flex;gap:6px;align-items:center'},[]);
      crimWrap.appendChild(crimCountNode);
      crimWrap.appendChild(avatars);
      left.appendChild(crimWrap);

      // actions: stack on mobile, row on desktop (CSS controls)
      const actions = el('div',{class:'actions'},[]);
      // View always allowed (require login)
      actions.appendChild(el('button',{class:'icon-small', onclick: ()=> {
        if(!isLogged()){ showAuthRequiredModal('Fadlan isdiwaangali si aad u aragto dambiilayaasha qolkan'); return; }
        showRoomCriminals(room);
      }},['Fiiri']));

      // inside renderRooms loop, after left or actions creation
// add Export button that downloads only criminals in this room


      if(isController()){
        actions.appendChild(el('button',{class:'btn', onclick: ()=> renderExport({ roomId: room._id }) },['Degso Qolkaan']));
        actions.appendChild(el('button',{class:'icon-small', onclick: ()=> showEditRoomModal(room)},['Tafatir']));
        actions.appendChild(el('button',{class:'icon-small danger', onclick: async ()=> {
          if(!confirm('tirtit Qolkaan?')) return;
          try { await window.api.deleteRoom(room._id); alert('tirtirtay.'); renderRooms(); }
          catch(err){ alert('Tirtirida laguma guuleysan: ' + (err.message || err)); }
        }},['Tirtir']));
      }

      card.appendChild(actions);
      list.appendChild(card);

      // asynchronously fetch a small preview of criminals for this room (non-blocking)
      (async ()=>{
        try{
          // try to get a few criminals assigned to this room (perPage=5)
          // adjust the query function to match your API endpoint shape if different
          const res = await window.api.getCriminals(`roomId=${encodeURIComponent(room._id)}&perPage=5`);
          const rows = res.criminals || [];
          // determine total count: prefer server-provided field, else fallback
          const total = (typeof room.totalCriminals !== 'undefined' && room.totalCriminals !== null)
                          ? room.totalCriminals
                          : (res.total || rows.length);
          crimCountNode.textContent = 'Maxaabiista: ' + (typeof total !== 'undefined' ? total : (rows.length || 0));

          // populate avatars/names
          avatars.innerHTML = '';
          rows.forEach(c => {
            // build src similar to other parts of your app
            let src = c.photoUrl ? String(c.photoUrl) : '';
            if(src && !src.startsWith('http') && !src.startsWith('//')) {
              if(!src.startsWith('/')) src = '/' + src;
              src = BACKEND_BASE + src;
            }

            const av = el('button',{class:'avatar', title: c.fullName || '', type:'button', onclick: ()=> {
              if(!isLogged()){ showAuthRequiredModal('Fadlan isdiwaangeli si aad u aragto faahfaahinta dembiilahaan'); return; }
              showCriminalDetails(c._id);
            }},[]);
            if(src){
              av.appendChild(el('img',{src, alt: c.fullName || 'photo'}));
            } else {
              // fallback initial (no photo)
              av.appendChild(el('div',{class:'avatar-initial'},[ (c.fullName || '—').slice(0,1).toUpperCase() ]));
            }
            avatars.appendChild(av);
          });

          // if there are more than shown, add a small +N pill
          const shown = rows.length || 0;
          if ((typeof total === 'number' && total > shown) || (res.total && res.total > shown)) {
            const moreCount = (typeof total === 'number' && total > shown) ? (total - shown) : ((res.total && res.total > shown) ? (res.total - shown) : 0);
            if(moreCount > 0){
              avatars.appendChild(el('div',{class:'more-pill muted', title: 'Click View to see all'},['+' + moreCount]));
            }
          }
        }catch(err){
          // ignore errors, keep placeholder
          // optionally show small error mark: avatars.textContent = '…';
        }
      })();
    });
  } catch(e){
    list.innerHTML = '<div class="card">Failed to load rooms: ' + (e.message||e) + '</div>';
  } finally{
    showSpinner(false);
  }
}



  // Recycle bin (criminals, rooms, Recycle bin is emptyprisons)
  async function renderRecycleBin(){
    setActiveNav('recycle');
    showSpinner(true);
    clearView();
    view.appendChild(el('h2',{},['Qashinka la tirtiray']));
    const list = el('div',{},[]);
    view.appendChild(list);
    try{
      const all = await window.api.get('/criminals?includeDeleted=1'); // generic get wrapper
      const deletedCriminals = (all.criminals || []).filter(c => c.deletedAt);
      const roomsResp = await window.api.get('/rooms?includeDeleted=1');
      const deletedRooms = (roomsResp.rooms || []).filter(r => r.deletedAt);
      const prisonsResp = await window.api.get('/prisons?includeDeleted=1');
      const deletedPrisons = (prisonsResp.prisons || []).filter(p => p.deletedAt);

      if(deletedCriminals.length === 0 && deletedRooms.length === 0 && deletedPrisons.length === 0) list.appendChild(el('div',{class:'card'},['']));

      if(deletedCriminals.length){
        list.appendChild(el('h3',{},['Maxaabiista la tirtiray']));
        deletedCriminals.forEach(c=>{
          const card = el('div',{class:'card'},[]);
          card.appendChild(el('div',{style:'flex:1'},[c.prisonId + ' — ' + c.fullName]));
          const buttons = el('div',{},[
            el('button',{class:'btn', onclick:async ()=>{ await window.api.restoreCriminal(c._id); alert('Waad Soo Celisay.'); renderRecycleBin(); }},['Sooceli']),
            el('button',{class:'btn secondary', onclick:async ()=>{ if(confirm('Delete permanently?')){ await window.api.permanentDeleteCriminal(c._id); alert('Deleted permanently'); renderRecycleBin(); } }},['Delete Permanently'])
          ]);
          card.appendChild(buttons);
          list.appendChild(card);
        });
      }

      if(deletedRooms.length){
        list.appendChild(el('h3',{},['Qolosha La tirtiray']));
        deletedRooms.forEach(r=>{
          const card = el('div',{class:'card'},[]);
          card.appendChild(el('div',{style:'flex:1'},[r.roomId + ' — ' + r.name]));
          const buttons = el('div',{},[
            el('button',{class:'btn', onclick:async ()=>{ await window.api.post('/rooms/' + r._id + '/restore'); alert('Waad Soo celisay'); renderRecycleBin(); }},['Dib usoo celi']),
            el('button',{class:'btn secondary', onclick:async ()=>{ if(confirm('Delete permanently?')){ await window.api.permanentDeleteRoom(r._id); alert('Deleted permanently'); renderRecycleBin(); } }},['Delete Permanently'])
          ]);
          card.appendChild(buttons);
          list.appendChild(card);
        });
      }

      if(deletedPrisons.length){
        list.appendChild(el('h3',{},['Xabsiyada latirtiray']));
        deletedPrisons.forEach(p=>{
          const card = el('div',{class:'card'},[]);
          card.appendChild(el('div',{style:'flex:1'},[p.prisonId + ' — ' + p.name]));
          const buttons = el('div',{},[
            el('button',{class:'btn', onclick:async ()=>{ await window.api.post('/prisons/' + p._id + '/restore'); alert('Waad Soo celisay'); renderRecycleBin(); }},['Soo celi']),
            el('button',{class:'btn secondary', onclick:async ()=>{ if(confirm('Delete permanently?')){ await window.api.permanentDeletePrison(p._id); alert('Deleted permanently'); renderRecycleBin(); } }},['Delete Permanently'])
          ]);
          card.appendChild(buttons);
          list.appendChild(card);
        });
      }

    } catch(e){ list.innerHTML = '<div class="card">Failed to load recycle bin: ' + (e.message||e) + '</div>'; }
    finally{ showSpinner(false); }
  }

 /* ---------- Criminal details (require login to view) ---------- */
 async function showCriminalDetails(id){
  if(!isLogged()){
    showAuthRequiredModal('fadlan isdiwangili si aad u aragto Xogta dambiilahaan');
    return;
  }

  const modal = el('div',{class:'modal'},[]);
  const inner = el('div',{class:'inner'},[]);
  inner.appendChild(el('h3',{},['Loading...']));
  modal.appendChild(inner); document.body.appendChild(modal);

  let iv = null;
  try {
    const r = await window.api.get(`/criminals/${id}`);
    const c = r.criminal;
    inner.innerHTML = '';

    const header = el('div',{style:'display:flex;gap:12px;align-items:center'},[]);
    if (c.photoUrl) {
      let src = String(c.photoUrl);
      if (!src.startsWith('http')) src = BACKEND_BASE + (src.startsWith('/') ? src : '/' + src);
    
      // thumbnail (click to open full)
      const thumbWrap = el('div', {}, []);
      const thumbImg = el('img', {
        src,
        alt: c.fullName || 'photo',
        title: 'Guji si aad u aragto sawirka oo Dhamestiran.',
        style: 'width:96px;height:96px;border-radius:8px;object-fit:cover;cursor:pointer'
      });
      thumbWrap.appendChild(thumbImg);
      header.appendChild(thumbWrap);
    
      // image viewer builder
      function openImageViewer(imgSrc, caption) {
        const viewer = el('div', { class: 'image-viewer' }, []);
        const inner = el('div', { class: 'image-viewer-inner' }, []);
        const closeBtn = el('button', { class: 'close-btn', title: 'Close viewer' }, ['✕']);
        const bigImg = el('img', { src: imgSrc, alt: caption || 'image', class: 'image-viewer-img', style: 'touch-action: none; user-select: none;' });
        const captionEl = caption ? el('div', { class: 'image-viewer-caption' }, [caption]) : null;
      
        inner.appendChild(closeBtn);
        inner.appendChild(bigImg);
        if (captionEl) inner.appendChild(captionEl);
        viewer.appendChild(inner);
        document.body.appendChild(viewer);
      
        // Initial transform state
        let scale = 1;
        let translateX = 0, translateY = 0;
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };
        let lastTouchDist = null;
      
        function updateTransform() {
          bigImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
          // cursor hint
          bigImg.style.cursor = (scale > 1 ? 'grab' : 'zoom-in');
        }
      
        // cleanup
        function cleanup() {
          window.removeEventListener('keydown', onKey);
          viewer.removeEventListener('click', onOutsideClick);
          bigImg.removeEventListener('mousedown', onMouseDown);
          window.removeEventListener('mouseup', onMouseUp);
          window.removeEventListener('mousemove', onMouseMove);
          bigImg.removeEventListener('wheel', onWheel);
          bigImg.removeEventListener('touchstart', onTouchStart);
          bigImg.removeEventListener('touchmove', onTouchMove);
          bigImg.removeEventListener('touchend', onTouchEnd);
          try { viewer.remove(); } catch (err) {}
        }
      
        function onKey(e) { if (e.key === 'Escape') cleanup(); }
        function onOutsideClick(e) { if (e.target === viewer) cleanup(); }
      
        // Mouse drag for panning
        function onMouseDown(e) {
          if (scale <= 1) return;
          isDragging = true;
          dragStart.x = e.clientX - translateX;
          dragStart.y = e.clientY - translateY;
          bigImg.style.cursor = 'grabbing';
          e.preventDefault();
        }
        function onMouseMove(e) {
          if (!isDragging) return;
          translateX = e.clientX - dragStart.x;
          translateY = e.clientY - dragStart.y;
          updateTransform();
        }
        function onMouseUp() {
          if (!isDragging) return;
          isDragging = false;
          bigImg.style.cursor = (scale > 1 ? 'grab' : 'zoom-in');
        }
      
        // wheel zoom
        function onWheel(e) {
          e.preventDefault();
          const delta = -e.deltaY;
          const zoomFactor = delta > 0 ? 1.08 : 0.92;
          // zoom around cursor
          const rect = bigImg.getBoundingClientRect();
          const offsetX = e.clientX - rect.left;
          const offsetY = e.clientY - rect.top;
          const prevScale = scale;
          scale = Math.min(6, Math.max(1, scale * zoomFactor));
          // adjust translate so zoom focuses on pointer
          const ratio = scale / prevScale;
          translateX = (translateX - offsetX) * ratio + offsetX;
          translateY = (translateY - offsetY) * ratio + offsetY;
          updateTransform();
        }
      
        // touch gestures (pinch + drag)
        function getTouchDist(t0, t1) {
          const dx = t1.clientX - t0.clientX;
          const dy = t1.clientY - t0.clientY;
          return Math.hypot(dx, dy);
        }
        function onTouchStart(e) {
          if (e.touches.length === 1) {
            // single finger drag
            const t = e.touches[0];
            isDragging = scale > 1;
            dragStart.x = t.clientX - translateX;
            dragStart.y = t.clientY - translateY;
          } else if (e.touches.length === 2) {
            lastTouchDist = getTouchDist(e.touches[0], e.touches[1]);
          }
        }
        function onTouchMove(e) {
          if (e.touches.length === 1 && isDragging) {
            const t = e.touches[0];
            translateX = t.clientX - dragStart.x;
            translateY = t.clientY - dragStart.y;
            updateTransform();
          } else if (e.touches.length === 2) {
            const curDist = getTouchDist(e.touches[0], e.touches[1]);
            if (lastTouchDist) {
              const factor = curDist / lastTouchDist;
              const prevScale = scale;
              scale = Math.min(6, Math.max(1, scale * factor));
              // basic center-preserving zoom (approx)
              updateTransform();
            }
            lastTouchDist = curDist;
          }
          e.preventDefault();
        }
        function onTouchEnd(e){
          if (e.touches.length === 0){
            isDragging = false;
            lastTouchDist = null;
          }
        }
      
        // double-click/tap to reset or zoom
        let lastTap = 0;
        function onDblClick(e){
          const now = Date.now();
          const diff = now - lastTap;
          lastTap = now;
          if (diff < 300){
            // double-tap/double-click: toggle between fit (1) and zoom 2x
            if (scale > 1.5){
              scale = 1; translateX = 0; translateY = 0;
            } else {
              scale = 2;
            }
            updateTransform();
          }
        }
      
        // attach listeners
        bigImg.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('mousemove', onMouseMove);
        bigImg.addEventListener('wheel', onWheel, { passive:false });
        bigImg.addEventListener('touchstart', onTouchStart, { passive:false });
        bigImg.addEventListener('touchmove', onTouchMove, { passive:false });
        bigImg.addEventListener('touchend', onTouchEnd);
        bigImg.addEventListener('dblclick', onDblClick);
        bigImg.addEventListener('click', (e)=>{ // single tap when not zoomed -> zoom in
          if (scale <= 1) {
            scale = 2;
            // center roughly where clicked
            const rect = bigImg.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;
            translateX = (bigImg.clientWidth/2 - offsetX) * (scale-1);
            translateY = (bigImg.clientHeight/2 - offsetY) * (scale-1);
            updateTransform();
          }
        });
      
        window.addEventListener('keydown', onKey);
        viewer.addEventListener('click', onOutsideClick);
        closeBtn.addEventListener('click', cleanup);
      }
      
    
      // open viewer on click
      thumbImg.addEventListener('click', () => openImageViewer(src, c.fullName || ''));
      // also keyboard accessible: open on Enter when focused
      thumbImg.tabIndex = 0;
      thumbImg.addEventListener('keydown', (e) => { if (e.key === 'Enter') openImageViewer(src, c.fullName || ''); });
    }
    
    const title = el('div',{},[]);
    title.appendChild(el('h3',{},[c.fullName || '—']));

    const prisonDisplay = (c.prisonName) || (c.prisonRef && c.prisonRef.name) || (c.prisonId || '—');
    const dobStr = c.dob ? (new Date(c.dob)).toLocaleDateString() : '';
    const age = computeAgeFromDOB(c.dob) || c.age || null;

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
    dl.appendChild(row('Jinsiga', c.gender || ''));
    dl.appendChild(row('Taariishda Dhalashada', dobStr + (age ? (' • ' + age + ' Sano') : '')));
    dl.appendChild(row('Qolka', c.roomId ? (c.roomId.name || '') : 'Qol malahan'));
    dl.appendChild(row('Xabsiga', prisonDisplay));
    dl.appendChild(row('Telefoonka', c.phone || ''));
    dl.appendChild(row('Xogta Waalidka', (c.parentName ? c.parentName + (c.parentPhone ? ' • ' + c.parentPhone : '') : '')));
    dl.appendChild(row('Goobta uuku dhashay', c.placeOfBirth || ''));
    dl.appendChild(row('Nuuca Danbiga uu galay', (c.committedType || '') + (c.committedTypeOther ? (' • ' + c.committedTypeOther) : '')));
    dl.appendChild(row('Xukunka', c.judgment || ''));
    dl.appendChild(row('Xaaldaa', c.status || ''));
    dl.appendChild(row('Time Held', c.timeHeldStart ? new Date(c.timeHeldStart).toLocaleString() : ''));
    dl.appendChild(row('Taariikhda lasiideynaayo', c.releaseDate ? new Date(c.releaseDate).toLocaleString() : ''));
    dl.appendChild(row('Ganaax', (c.fineAmount||0)));
    inner.appendChild(dl);

    if (c.overview){
      inner.appendChild(el('div',{style:'margin-top:12px'},[
        el('div',{class:'label'},['Guudmar / Sharaxaad']),
        el('div',{},[c.overview])
      ]));
    }

    const paid = (c.payments||[]).reduce((s,p)=>s+p.amount,0);
    inner.appendChild(el('div',{style:'margin-top:12px'},['Lacagaha: Bixiyay $' + paid + ' / Ku dhiman $' + ((c.fineAmount||0)-paid)]));

    if (c.payments && c.payments.length){
      const ul = el('div',{style:'margin-top:8px;display:flex;flex-direction:column;gap:6px'},[]);
      c.payments.forEach(p => ul.appendChild(el('div',{class:'card'},[(new Date(p.date)).toLocaleString() + ' — ' + p.amount + (p.note ? (' — ' + p.note) : '') + (p.paidBy ? (' — by ' + p.paidBy) : '')])));
      inner.appendChild(ul);
    }

   // If there is an explicit releaseDate -> live countdown
if (c.releaseDate) {
  const rd = new Date(c.releaseDate);
  const countdown = el('div',{class:'countdown', style:'margin-top:12px;font-weight:700'},['--']);
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Waqtiga u haray illaa laga sii deynaayo']), countdown]));
  function tick(){
    const now = new Date();
    const diff = rd - now;
    if(diff <= 0){ countdown.textContent = 'Released'; if(iv){ clearInterval(iv); iv=null;} return; }
    const dd = Math.floor(diff/(24*3600*1000));
    const hh = Math.floor((diff % (24*3600*1000)) / 3600000);
    const mm = Math.floor((diff % 3600000) / 60000);
    const ss = Math.floor((diff % 60000) / 1000);
    countdown.textContent = `${dd}d ${hh}h ${mm}m ${ss}s`;
  }
  tick();
  iv = setInterval(tick,1000);
}
// If pausedRemainingMs exists -> show paused remaining and do NOT start a timer
else if (typeof c.pausedRemainingMs === 'number' && c.pausedRemainingMs > 0) {
  const ms = Number(c.pausedRemainingMs);
  // helper to format ms -> "Xd Xh Xm Xs"
  function fmtMs(m){
    let s = Math.floor(m/1000);
    const dd = Math.floor(s/(24*3600)); s -= dd*24*3600;
    const hh = Math.floor(s/3600); s -= hh*3600;
    const mm = Math.floor(s/60); s -= mm*60;
    const ss = s;
    return `${dd}d ${hh}h ${mm}m ${ss}s`;
  }
  const pausedEl = el('div',{class:'muted', style:'margin-top:12px;font-weight:700'},['Paused remaining: ' + fmtMs(ms)]);
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Waqtiga u haray illaa laga sii deynaayo (paused)']), pausedEl]));
}


    const originalRemove = modal.remove.bind(modal);
    modal.remove = function(){ if(iv){ clearInterval(iv); iv=null;} originalRemove(); };

    inner.appendChild(el('div', {style:'margin-top:12px'},[ el('button',{class:'btn', onclick: ()=> modal.remove()},['Close']) ]));
  } catch(err){
    if(iv){ clearInterval(iv); iv=null; }
    inner.innerHTML = '<div class="card">Error loading criminal: ' + (err.message || err) + '</div>';
  }
}


 /* ---------- Add/Edit Criminal modal: load prisons, load all rooms then filter by selected prison ---------- */
 async function showEditCriminalModal(existing){
  const isEdit = !!existing;
  const modal = el('div',{class:'modal'},[]);
  const inner = el('div',{class:'inner'},[]);
  const closeBtn = el('button',{class:'close-btn', onclick: ()=> modal.remove(), title: 'Close'},['✕']);
  inner.appendChild(closeBtn);
  inner.appendChild(el('h3',{},[isEdit ? 'Tafatir Maxbuus ' : 'Kudar dar maxbuus']));

  const form = document.createElement('form');
  form.className = 'form-grid';
  form.addEventListener('submit', e => e.preventDefault());

  form.innerHTML = `
    <div class="form-row"><label class="label">Magaca Buuxa<input name="fullName" class="input" required></label></div>
    <div class="form-row"><label class="label">National ID(NIRA)<input name="nationalId" class="input"></label></div>
    <div class="form-row"><label class="label">Numberka <input name="phone" class="input" pattern="\\d*"></label></div>
    <div class="form-row"><label class="label">Xogta Waaaridka <input name="parentName" class="input"></label></div>
    <div class="form-row"><label class="label">Teleefonka waalidka<input name="parentPhone" class="input" pattern="\\d*"></label></div>
    <div class="form-row"><label class="label">Goobta Dhalashada<input name="placeOfBirth" class="input"></label></div>
    <div class="form-row"><label class="label">Nuuca Danbiga<select name="committedType" class="input">
      <option value="">--select--</option>
      <option value="dil">dil</option><option value="dhac">dhac</option><option value="kufsi">kufsi</option>
      <option value="is dabmarin">is dabmarin</option><option value="musuqmaasuq">musuqmaasuq</option><option value="other">other</option>
    </select></label></div>
    <div class="form-row"><label class="label">dabi (kale)<input name="committedTypeOther" class="input"></label></div>
    <div class="form-row"><label class="label">Jinsiga<select name="gender" class="input"><option value="male">Rag</option><option value="female">Dumar</option></select></label></div>
    <div class="form-row"><label class="label">Taariikhda Dhalashada<input name="dob" type="date" class="input"></label></div>

    <div class="form-row"><label class="label">Xabsiga<select name="prisonRef" class="input"></select></label></div>
    <div class="form-row"><label class="label">Qolka<select name="roomId" class="input"></select></label></div>

    <div class="form-row"><label class="label">Xukunka<input name="judgment" class="input"></label></div>
    <div class="form-row"><label class="label">Lacagta Ganaaxa<input name="fineAmount" type="number" min="0" step="0.01" class="input"></label></div>
    <div class="form-row"><label class="label">Waqtiga lasii deynaayo<input name="releaseDate" type="datetime-local" class="input"></label></div>
    <div class="form-row"><label class="label">Sawirka Maxbuska<input name="photo" type="file" accept="image/*" class="input" id="criminal-photo-input"></label></div>
    <div class="form-row" id="photo-preview-wrap" style="display:none"><img id="criminal-photo-preview" style="width:120px;height:120px;object-fit:cover;border-radius:8px"></div>

    <div class="form-row"><label class="label">Guudmar / Sharaxaad<textarea name="overview" class="input" rows="3"></textarea></label></div>
  `;

  const prisonsSel = form.querySelector('select[name="prisonRef"]');
  const roomsSel   = form.querySelector('select[name="roomId"]');
  const photoInput = form.querySelector('#criminal-photo-input');
  const photoPreviewWrap = form.querySelector('#photo-preview-wrap');
  const photoPreview = form.querySelector('#criminal-photo-preview');

  // load prisons
  let allRooms = [];
  try {
    const pr = await window.api.getPrisons();
    (pr.prisons || []).forEach(p => prisonsSel.appendChild(el('option',{value:p._id},[p.name + (p.prisonId ? ' ('+p.prisonId+')' : '')])));
    prisonsSel.insertBefore(el('option',{value:''},['-- none --']), prisonsSel.firstChild);
  } catch(e){
    prisonsSel.appendChild(el('option',{value:''},['Failed to load prisons']));
  }

  // load all rooms once
  try {
    const rr = await window.api.getRooms();
    allRooms = (rr.rooms || []);
    roomsSel.innerHTML = '';
    roomsSel.appendChild(el('option',{value:''},['-- none --']));
  } catch(e){
    roomsSel.appendChild(el('option',{value:''},['Failed to load rooms']));
  }

  // when prison changes, show only rooms of that prison
  prisonsSel.addEventListener('change', ()=>{
    const pid = prisonsSel.value;
    roomsSel.innerHTML = '';
    roomsSel.appendChild(el('option',{value:''},['-- none --']));
    const filtered = allRooms.filter(r => {
      try {
        if(!pid) return true; // if no prison selected -> show none or all? We show only none option
        if(!r.prisonRef) return false;
        if(typeof r.prisonRef === 'string') return String(r.prisonRef) === String(pid);
        if(r.prisonRef && (r.prisonRef._id || r.prisonRef.toString)) {
          return String(r.prisonRef._id || r.prisonRef) === String(pid);
        }
      } catch(e) { return false; }
      return false;
    });
    filtered.forEach(room => roomsSel.appendChild(el('option',{value:room._id},[room.name + (room.roomId ? ' ('+room.roomId+')' : '')])));
  });

  // image preview for upload
  photoInput.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if(!f){ photoPreviewWrap.style.display = 'none'; photoPreview.src = ''; return; }
    const url = URL.createObjectURL(f);
    photoPreview.src = url;
    photoPreviewWrap.style.display = '';
    photoPreview.onload = () => { URL.revokeObjectURL(url); };
  });

  // fill existing data when editing
  if(isEdit){
    form.fullName.value = existing.fullName || '';
    form.nationalId.value = existing.nationalId || '';
    form.phone.value = existing.phone || '';
    form.parentName.value = existing.parentName || '';
    form.parentPhone.value = existing.parentPhone || '';
    form.placeOfBirth.value = existing.placeOfBirth || '';
    form.committedType.value = existing.committedType || '';
    form.committedTypeOther.value = existing.committedTypeOther || '';
    form.gender.value = existing.gender || 'male';
    if(existing.dob) form.dob.value = new Date(existing.dob).toISOString().slice(0,10);
    if(existing.releaseDate) form.releaseDate.value = new Date(existing.releaseDate).toISOString().slice(0,16);
    form.judgment.value = existing.judgment || '';
    form.fineAmount.value = existing.fineAmount || '';
    form.overview.value = existing.overview || '';

    // set prison and then rooms (fire change to populate)
    try {
      const pid = existing.prisonRef && (existing.prisonRef._id || existing.prisonRef) ? (existing.prisonRef._id || existing.prisonRef) : '';
      if(pid){
        prisonsSel.value = pid;
        prisonsSel.dispatchEvent(new Event('change'));
        try { roomsSel.value = existing.roomId && (existing.roomId._id || existing.roomId) ? (existing.roomId._id || existing.roomId) : ''; } catch(e){}
      } else {
        prisonsSel.value = existing.prisonRef || '';
      }
    } catch(e){}
    if(existing.photoUrl){
      let src = String(existing.photoUrl);
      if(!src.startsWith('http')) src = BACKEND_BASE + (src.startsWith('/')?src:'/'+src);
      photoPreview.src = src; photoPreviewWrap.style.display = '';
    }
  }

  const submit = el('button',{class:'btn', type:'button', onclick: async ()=>{
    if(!form.fullName.value.trim()) return alert('Full name required');
    const fd = new FormData(form);
    try {
      if(isEdit) { await window.api.updateCriminal(existing._id, fd); alert('Saved'); }
      else       { await window.api.createCriminal(fd); alert('Created'); }
      modal.remove(); renderCriminals();
    } catch(err){ alert('Error: ' + (err.message||err)); }
  }},[isEdit?'Save':'Create']);

  inner.appendChild(form);
  inner.appendChild(el('div',{},[submit, el('button',{class:'btn secondary', onclick: ()=> modal.remove()},['Cancel'])]));
  modal.appendChild(inner); document.body.appendChild(modal);
}

// open status modal and call API to change status
async function openStatusModal(c) {
  if(!isLogged()){ showAuthRequiredModal('fadlan isdiwangili si aad u bedesho status'); return; }

  const modal = el('div',{class:'modal'},[]);
  const inner = el('div',{class:'inner'},[]);
  const closeBtn = el('button',{class:'close-btn', onclick: ()=> modal.remove(), title:'Close'},['✕']);
  inner.appendChild(closeBtn);
  inner.appendChild(el('h3',{},['Bedel Xaaladda: ' + (c.fullName || '')]));

  const sel = el('select',{class:'input', id:'status-select'},[
    el('option',{value:'in_prison'},['In prison']),
    el('option',{value:'out'},['Out / Released']),
    el('option',{value:'dead'},['Dead'])
  ]);
  try { sel.value = c.status || 'in_prison'; } catch(e){}

  inner.appendChild(el('div',{style:'margin:8px 0'},[sel]));

  inner.appendChild(el('div',{},[
    el('button',{class:'btn', onclick: async ()=>{
      const action = sel.value;
      try{
        showSpinner(true);
        const res = await window.api.post(`/criminals/${c._id}/status`, { action });
        // server returns { ok: true, criminal: ... }
        if(res && res.ok){
          alert('Xaaladda waa la badalay');
          modal.remove();
          // re-render criminals (or only update the single card)
          renderCriminals();
        } else {
          alert('Update failed');
        }
      } catch(err){
        alert('Failed to update status: ' + (err.message || err));
      } finally { showSpinner(false); }
    }},['Save']),
    el('button',{class:'btn secondary', onclick: ()=> modal.remove()},['Cancel'])
  ]));

  modal.appendChild(inner);
  document.body.appendChild(modal);
}



  // Add room modal (already loads prisons)
  async function showAddRoomModal(){
    const modal = el('div',{class:'modal'},[]);
    const inner = el('div',{class:'inner'},[]);
    inner.appendChild(el('h3',{},['Ku dar qol']));
    const name = el('input',{class:'input', placeholder:'Maagaca Qolka'});
    const capacity = el('input',{class:'input', type:'number', placeholder:'Xadiga Qolka(4)'});
    const prisonsSel = el('select',{class:'input'},[]);
    try{
      const pr = await window.api.getPrisons();
      (pr.prisons || []).forEach(p => prisonsSel.appendChild(el('option',{value:p._id},[p.name + (p.prisonId ? ' ('+p.prisonId+')' : '')])));
      prisonsSel.insertBefore(el('option',{value:''},['-- none --']), prisonsSel.firstChild);
    } catch(e){ prisonsSel.appendChild(el('option',{value:''},['Failed to load prisons'])); }

    const submit = el('button',{class:'btn', onclick:async ()=> {
      try{
        await window.api.post('/rooms', { name: name.value, capacity: Number(capacity.value||0), prisonRef: prisonsSel.value || null });
        alert('Room created');
        modal.remove();
        renderRooms();
      } catch(e){ alert('Failed: ' + (e.message||e)); }
    }},['Create']);

    inner.appendChild(el('div',{},[el('div',{class:'label'},['Name']), name]));
    inner.appendChild(el('div',{},[el('div',{class:'label'},['Capacity']), capacity]));
    inner.appendChild(el('div',{},[el('div',{class:'label'},['Prison']), prisonsSel]));
    inner.appendChild(el('div',{},[submit, el('button',{class:'btn secondary', onclick:()=> modal.remove()},['Cancel'])]));
    modal.appendChild(inner); document.body.appendChild(modal);
  }

  // Edit/Add Room (reusable) — updated to include prison select
  async function showEditRoomModal(room){
    const isEdit = !!room;
    const modal = el('div',{class:'modal'},[]);
    const inner = el('div',{class:'inner'},[]);
    inner.appendChild(el('h3',{},[isEdit ? 'Tafatir Qol' : 'Kudar Qol']));
    const name = el('input',{class:'input', placeholder:'Qolka Magaaciisa', value: isEdit ? room.name : ''});
    const capacity = el('input',{class:'input', type:'number', placeholder:'Xadiga Qolka', value: isEdit ? (room.capacity || '') : ''});
    const prisonsSel = el('select',{class:'input'},[]);
    try{
      const pr = await window.api.getPrisons();
      (pr.prisons || []).forEach(p => prisonsSel.appendChild(el('option',{value:p._id},[p.name + (p.prisonId ? ' ('+p.prisonId+')' : '')])));
      prisonsSel.insertBefore(el('option',{value:''},['-- none --']), prisonsSel.firstChild);
      // set current value if editing
      if(isEdit){
        try { prisonsSel.value = room.prisonRef ? (room.prisonRef._id || '') : ''; } catch(e){}
      }
    } catch(e){ prisonsSel.appendChild(el('option',{value:''},['Failed to load prisons'])); }

    const submit = el('button',{class:'btn', onclick: async ()=> {
      try{
        if(isEdit){
          await window.api.put('/rooms/' + room._id, { name: name.value, capacity: Number(capacity.value||0), prisonRef: prisonsSel.value || null });
          alert('Qolka waa la keydiyay');
        } else {
          await window.api.post('/rooms', { name: name.value, capacity: Number(capacity.value||0), prisonRef: prisonsSel.value || null });
          alert('Qolka Waa La Abuuray');
        }
        modal.remove(); renderRooms();
      } catch(e){ alert('Failed: ' + (e.message||e)); }
    }}, [isEdit ? 'Save' : 'Create']);
    inner.appendChild(el('div',{},[el('div',{class:'label'},['Name']), name]));
    inner.appendChild(el('div',{},[el('div',{class:'label'},['Capacity']), capacity]));
    inner.appendChild(el('div',{},[el('div',{class:'label'},['Prison']), prisonsSel]));
    inner.appendChild(el('div',{},[submit, el('button',{class:'btn secondary', onclick:()=> modal.remove()},['Cancel'])]));
    modal.appendChild(inner); document.body.appendChild(modal);
  }

  // Pay modal
  async function showPayModal(c){
    const modal = el('div',{class:'modal'},[]);
    const inner = el('div',{class:'inner'},[]);
    inner.appendChild(el('h3',{},['Lacagta Ganaaxa : ' + c.fullName]));
    const paid = (c.payments||[]).reduce((s,p)=>s+p.amount,0);
    const remaining = (c.fineAmount||0) - paid;
    inner.appendChild(el('div',{},['Ku hartay: ' + remaining]));
    const amt = el('input',{type:'number',placeholder:'Xaddiga', min:'0.01', class:'input'});
    const note = el('input',{placeholder:'Note (optional)', class:'input'});
    const btn = el('button',{class:'btn', onclick: async ()=> {
      const a = Number(amt.value);
      if(!a || a<=0 || a>remaining) return alert('Lcagta lagu ganaaxay maka badnaani karto mana ka yaraan karto !!!');
      try{
        await window.api.post(`/criminals/${c._id}/payments`, { amount: a, paidBy: 'admin', note: note.value });
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
        committedType: criminalFilters.committedType || ''
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



 /* ---------- Prisons list (hide Add Prison for non-controller, require login for viewing rooms) ---------- */
 async function renderPrisons(){
  setActiveNav('prisons');
  showSpinner(true);
  clearView();
  view.appendChild(el('h2',{},['Xabsiyada ']));

  const list = el('div',{class:'prisons-grid'},[]);
  view.appendChild(list);

  try {
    const r = await window.api.get('/prisons?includeCounts=1');
    const prisons = r.prisons || [];
    if(prisons.length===0) list.appendChild(el('div',{class:'card'},['Xabsi wali lama abuurin..']));

    // Add Prison button only visible for controller
    if(isController()){
      const addBtn = el('button',{class:'btn', onclick: showAddPrisonModal },['Kudar Xabsi']);
      view.appendChild(addBtn);
    }

    prisons.forEach(p => {
      const card = el('div',{class:'card prison-row'},[]);

      // Left column: title + subtitle
      const regionPart = p.region ? p.region : '';
      const districtPart = p.district ? (p.district) : '';
      // format like "Hiiraan/Beledweyne" if both present
      const regionDistrict = regionPart && districtPart ? `${regionPart}/${districtPart}` : (regionPart || districtPart || '');

      const left = el('div',{style:'flex:1;min-width:0'},[
        el('div',{class:'item-title'},[ p.name || '—' ]),
        el('div',{class:'item-sub muted'},[
          (p.prisonId ? ('ID: ' + p.prisonId + ' • ') : ''),
          // show Region/District if available
          regionDistrict ? (regionDistrict + ' • ') : '',
          'Qololka: ' + (p.totalRooms || 0) + ' • Maxaabiista: ' + (p.totalCriminals || 0)
        ])
      ]);
      card.appendChild(left);

      // Actions area: View (for all logged-in users), plus Edit/Delete for controllers
      const actions = el('div',{class:'actions'},[]);

      // View button: require login
      actions.appendChild(el('button',{class:'icon-small', onclick: ()=> {
        if(!isLogged()){ showAuthRequiredModal('Please login to view rooms in this prison'); return; }
        showPrisonRooms(p);
      }},['Fiiri']));

      if(isController()){
        actions.appendChild(el('button',{class:'icon-small', onclick: ()=> showEditPrisonModal(p)},['Tafatir']));
        actions.appendChild(el('button',{class:'icon-small danger', onclick: async ()=> {
          if(!confirm('Tirtir Xabsigaan?')) return;
          try { await window.api.deletePrison(p._id); alert('tirtirtay'); renderPrisons(); }
          catch(err){ alert('Delete failed: ' + (err.message||err)); }
        }},['Tirtir']));
      }

      card.appendChild(actions);
      list.appendChild(card);
    });
  } catch(e){
    list.innerHTML = '<div class="card">Failed to load prisons: ' + (e.message||e) + '</div>';
  } finally{
    showSpinner(false);
  }
}



/* ---------- showPrisonRooms: only for logged users ---------- */
async function showPrisonRooms(prison){
  if(!isLogged()){
    showAuthRequiredModal('Please login to view rooms in this prison');
    return;
  }
  setActiveNav('prisons');
  showSpinner(true);
  clearView();
  view.appendChild(el('h2',{},['Rooms in ' + (prison.name || '—')]));
  const list = el('div',{},[]);
  view.appendChild(list);
  try {
    const r = await window.api.get(`/prisons/${prison._id}`);
    const rooms = r.rooms || [];
    if(rooms.length===0) list.appendChild(el('div',{class:'card'},[' xABSIGAAN Qolol malahan']));
    rooms.forEach(room => {
      const card = el('div',{class:'card'},[]);
      card.appendChild(el('div',{style:'flex:1'},[ el('strong',{},[room.roomId || '—']), ' ', room.name, ' ', el('div',{class:'muted'},['Maxaabiista: ' + (room.totalCriminals || 0)]) ]));
      const actions = el('div',{},[
        el('button',{class:'btn', onclick: ()=> {
          if(!isLogged()){ showAuthRequiredModal('Please login to view criminals'); return; }
          showRoomCriminals(room);
        }},['View criminals']),
        isController() ? el('button',{class:'btn', onclick: ()=> showEditRoomModal(room)},['Edit']) : null
      ]);
      card.appendChild(actions);
      list.appendChild(card);
    });
  } catch(e){ list.innerHTML = '<div class="card">Failed: ' + (e.message||e) + '</div>'; }
  finally{ showSpinner(false); }
}




function showAddPrisonModal(){
  const modal = el('div',{class:'modal'},[]);
  const inner = el('div',{class:'inner'},[]);
  const closeBtn = el('button',{class:'close-btn', onclick: ()=> modal.remove(), title:'Close'},['✕']);
  inner.appendChild(closeBtn);
  inner.appendChild(el('h3',{},['Kudar Xabsi']));

  const name = el('input',{class:'input', placeholder:'Magaca Xabsiag'});
  const region = el('select',{class:'input'},[]);
  const district = el('select',{class:'input'},[]);

  // fill region list
  Object.keys(REGION_DISTRICTS).forEach(r => region.appendChild(el('option',{value:r},[r])));
  region.insertBefore(el('option',{value:''},['-- select region --']), region.firstChild);
  district.appendChild(el('option',{value:''},['-- select district --']));

  region.addEventListener('change', ()=> {
    district.innerHTML = '';
    district.appendChild(el('option',{value:''},['-- Xulo Degmo --']));
    const ds = REGION_DISTRICTS[region.value] || [];
    ds.forEach(d => district.appendChild(el('option',{value:d},[d])));
  });

  const submit = el('button',{class:'btn', onclick: async ()=>{
    try{
      await window.api.post('/prisons', { name: name.value, region: region.value, district: district.value });
      alert('Xabsiga Waa la abuuray'); modal.remove(); renderPrisons();
    } catch(e){ alert('Failed: ' + (e.message||e)); }
  }},['Create']);

  inner.appendChild(el('div',{},[el('div',{class:'label'},['Magaaca']), name]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Gobol/Maamul']), region]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Degmo']), district]));
  inner.appendChild(el('div',{},[submit, el('button',{class:'btn secondary', onclick:()=> modal.remove()},['Cancel'])]));
  modal.appendChild(inner); document.body.appendChild(modal);
}

function showEditPrisonModal(p){
  const modal = el('div',{class:'modal'},[]);
  const inner = el('div',{class:'inner'},[]);
  const closeBtn = el('button',{class:'close-btn', onclick: ()=> modal.remove(), title:'Close'},['✕']);
  inner.appendChild(closeBtn);
  inner.appendChild(el('h3',{},['Tafatir Xabsiga']));

  const name = el('input',{class:'input', placeholder:'Magaca Xabsiga', value: p.name || ''});
  const region = el('select',{class:'input'},[]);
  const district = el('select',{class:'input'},[]);

  Object.keys(REGION_DISTRICTS).forEach(r => region.appendChild(el('option',{value:r},[r])));
  region.insertBefore(el('option',{value:''},['-- Dooro Gobol --']), region.firstChild);

  region.addEventListener('change', ()=> {
    district.innerHTML = '';
    district.appendChild(el('option',{value:''},['-- Dooro Degmo --']));
    (REGION_DISTRICTS[region.value] || []).forEach(d => district.appendChild(el('option',{value:d},[d])));
  });

  // set current values
  if(p.region) { region.value = p.region; region.dispatchEvent(new Event('change')); }
  if(p.district) { district.value = p.district; }

  const submit = el('button',{class:'btn', onclick: async ()=>{
    try { await window.api.put('/prisons/' + p._id, { name: name.value, region: region.value, district: district.value }); alert('Saved'); modal.remove(); renderPrisons(); }
    catch(e){ alert('Failed: ' + (e.message||e)); }
  }},['Save']);

  inner.appendChild(el('div',{},[el('div',{class:'label'},['Name']), name]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Region/State']), region]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['District']), district]));
  inner.appendChild(el('div',{},[submit, el('button',{class:'btn secondary', onclick:()=> modal.remove()},['Cancel'])]));
  modal.appendChild(inner); document.body.appendChild(modal);
}

  // USERS (kept from previous)

 /* ---------- Render users (only local provider) ---------- */
 async function renderUsers(){
  setActiveNav('users');
  showSpinner(true);
  clearView();
  view.appendChild(el('h2',{},['Isticmaalayaasha']));
  const wrap = el('div',{},[]);
  try{
    const r = await window.api.get('/users');
    let users = r.users || [];
    // safety filter again
    users = users.filter(u => (u.provider || 'local') === 'local');

    const list = el('div',{},[]);
    if(isController()){
      const addBtn = el('button',{class:'btn', onclick: showAddUserModal },['Ku dar Isticmaale']);
      wrap.appendChild(addBtn);
    }

    if(users.length === 0) list.appendChild(el('div',{class:'card'},['Isticmaale lama abuurin']));
    users.forEach(u=>{
      const card = el('div',{class:'card'},[]);
      const left = el('div',{style:'flex:1'},[ (u.userId||'') + ' — ' + u.fullName + ' • ' + u.email + ' • ' + u.role ]);
      card.appendChild(left);

      if(isController()){
        const actions = el('div',{},[]);
        actions.appendChild(el('button',{class:'btn', onclick: ()=> showEditUserModal(u)},['Edit']));
        actions.appendChild(el('button',{class:'btn secondary', onclick: async ()=>{
          const ok = confirm(u.disabled ? 'Enable user?' : 'Disable user?');
          if(!ok) return;
          try{
            await window.api.put('/users/' + u._id, { disabled: !u.disabled });
            alert('Updated'); renderUsers();
          } catch(err){ alert('Failed: ' + (err.message||err)); }
        }},[ u.disabled ? 'Enable' : 'Disable' ]));
        card.appendChild(actions);
      }
      list.appendChild(card);
    });
    wrap.appendChild(list);
    view.appendChild(wrap);
  } catch(e){
    view.appendChild(el('div',{class:'card'},['Failed to fetch users: ' + (e.message||e)]));
  } finally { showSpinner(false); }
}

/* ---------- Add user (controller) modal, with secret validation ---------- */
function showAddUserModal(){
  const modal = el('div',{class:'modal'},[]);
  const inner = el('div',{class:'inner'},[]);
  const closeBtn = el('button',{class:'close-btn', onclick: ()=> modal.remove(), title:'Close'},['✕']);
  inner.appendChild(closeBtn);
  inner.appendChild(el('h3',{},['Abuur Isticmaale']));

  const fullName = el('input',{class:'input', placeholder:'Magaca buuxa'});
  const email = el('input',{class:'input', placeholder:'Email', type:'email'});
  const password = el('input',{class:'input', type:'password', placeholder:'Password'});
  const role = el('select',{class:'input'},[ el('option',{value:'viewer'},['viewer']), el('option',{value:'controller'},['controller']) ]);

  const secretContainer = el('div',{class:'form-row', style:'display:none'},[
    el('div',{class:'label'},['Two factoR 2F (4 digits for controller)']),
    el('input',{class:'input', placeholder:'gali Xaqiijinta labaad 2F', type:'text', id:'new-user-secret', maxlength:4})
  ]);

  role.addEventListener('change', ()=> { secretContainer.style.display = (role.value === 'controller') ? '' : 'none'; });

  const submit = el('button',{class:'btn', onclick: async ()=>{
    if(!fullName.value.trim() || !email.value.trim() || !password.value) return alert('Please fill required fields');
    if(!validateEmail(email.value)) return alert('Invalid email format');
    const body = { fullName: fullName.value.trim(), email: email.value.trim(), password: password.value, role: role.value };
    if(role.value === 'controller'){
      const secretInput = inner.querySelector('#new-user-secret');
      if(!secretInput || !secretInput.value.trim()) return alert('Xisaabaadka maamuluhu(controller) waxay u baahan yihiin sir 4-god ah ');
      if(!validateSecret4(secretInput.value)) return alert('Secret must be 4 digits');
      body.secret = String(secretInput.value.trim());
    }
    try {
      await window.api.post('/users', body);
      alert('Created'); modal.remove(); renderUsers();
    } catch(err){ alert('Failed: ' + (err.message||err)); }
  }},['Create']);

  inner.appendChild(el('div',{},[el('div',{class:'label'},['Full name']), fullName]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Email']), email]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Password']), password]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Role']), role]));
  inner.appendChild(secretContainer);
  inner.appendChild(el('div',{},[submit, el('button',{class:'btn secondary', onclick:()=> modal.remove()},['Cancel'])]));
  modal.appendChild(inner);
  document.body.appendChild(modal);
}

/* ---------- Edit user modal (controller) with optional secret ---------- */
function showEditUserModal(u){
  const modal = el('div',{class:'modal'},[]);
  const inner = el('div',{class:'inner'},[]);
  const closeBtn = el('button',{class:'close-btn', onclick: ()=> modal.remove(), title:'Close'},['✕']);
  inner.appendChild(closeBtn);

  inner.appendChild(el('h3',{},['Edit User: ' + (u.fullName || '')]));
  const fullName = el('input',{class:'input', placeholder:'Full name', value:u.fullName || ''});
  const email = el('input',{class:'input', placeholder:'Email', value:u.email || ''});
  const password = el('input',{class:'input', type:'password', placeholder:'New password (leave blank to keep)'});
  const role = el('select',{class:'input'},[ el('option',{value:'viewer'},['viewer']), el('option',{value:'controller'},['controller']) ]);
  role.value = u.role || 'viewer';

  const secretContainer = el('div',{class:'form-row', style:(role.value === 'controller' ? '' : 'display:none')},[
    el('div',{class:'label'},['Secret number (4 digits) — leave blank to keep current']),
    el('input',{class:'input', placeholder:'Secret number', type:'text', id:'edit-user-secret', maxlength:4})
  ]);
  role.addEventListener('change', ()=> { secretContainer.style.display = (role.value === 'controller') ? '' : 'none'; });

  const submit = el('button',{class:'btn', onclick: async ()=>{
    if(email && !validateEmail(email.value)) return alert('Invalid email format');
    const payload = { fullName: fullName.value.trim(), email: email.value.trim(), role: role.value };
    if(password.value) payload.password = password.value;
    const secretInput = inner.querySelector('#edit-user-secret');
    if(role.value === 'controller' && secretInput && secretInput.value.trim()){
      if(!validateSecret4(secretInput.value)) return alert('Secret must be 4 digits');
      payload.secret = String(secretInput.value.trim());
    }
    try { await window.api.put('/users/' + u._id, payload); alert('Saved'); modal.remove(); renderUsers(); }
    catch(err){ alert('Failed: ' + (err.message||err)); }
  }},['Save']);

  inner.appendChild(el('div',{},[el('div',{class:'label'},['Full name']), fullName]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Email']), email]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['New password']), password]));
  inner.appendChild(el('div',{},[el('div',{class:'label'},['Role']), role]));
  inner.appendChild(secretContainer);
  inner.appendChild(el('div',{},[submit, el('button',{class:'btn secondary', onclick:()=> modal.remove()},['Cancel'])]));
  modal.appendChild(inner);
  document.body.appendChild(modal);
}

  // Boot: initial render
  renderNav();
  if(isController()) renderDashboard(); else renderCriminals();

  // ensure mobile dropdown closes on resize to large screens
  window.addEventListener('resize', ()=>{ if(window.innerWidth > 1000) hideMobileNav(); });

  // Expose render functions for debugging
  window.appRender = { renderCriminals, renderRooms, renderPrisons, renderDashboard, renderRecycleBin, renderUsers, renderNav };

})();
