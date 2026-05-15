// ============================================================================
// 🔧 CONFIGURAZIONE - INSERISCI IL TUO BACKEND URL
// ============================================================================

const CONFIG = {
  // 🔥 SOSTITUISCI CON IL TUO URL APPS SCRIPT WEB APP

  BACKEND_URL: 'https://script.google.com/macros/s/AKfycbzmfASzrJHbB5gynkzXFX_ZS2-tvN6SQfl0Q4pJz499dqYgV-LceRRx4GR2Ze8DBlwn/exec',
  
  API_TIMEOUT: 30000,
  CACHE_VERSION: 'v3.0',
  CACHE_MAX_AGE: 5 * 60 * 1000
};

// Verifica che l'URL sia configurato
if (!CONFIG.BACKEND_URL || CONFIG.BACKEND_URL.includes('DEPLOYMENT_ID')) {
  console.error('❌ CONFIGURA IL BACKEND_URL in app.js!');
  alert('Errore: Backend non configurato. Contatta l\'amministratore.');
}

// ============================================================================
// 🔐 SECURITY UTILITIES
// ============================================================================

const Sanitizer = {
  html: (str) => {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
  attr: (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[^a-zA-Z0-9\-_\s.]/g, '');
  },
  json: (str) => {
    try { return JSON.parse(str); } catch { return null; }
  }
};

// ============================================================================
// 💾 CACHE MANAGER (localStorage + IndexedDB ready)
// ============================================================================

const CacheManager = {
  prefix: 'torneo_cache_',
  
  createEmpty() {
    return {
      teams: [], matches: [], standings: {}, finalStage: [],
      fullTeams: {}, playersMap: {}, eventsByMatch: {}, mvpByMatch: {},
      meta: { version: 2, lastUpdate: null, initialized: false, isDemo: CONFIG.isDemo }
    };
  },
  
  load() {
    try {
      const key = this.prefix + CONFIG.CACHE_VERSION;
      const raw = localStorage.getItem(key);
      if (!raw) return this.createEmpty();
      const cached = JSON.parse(raw);
      if (cached?.meta?.version !== 2) {
        console.warn('Cache version mismatch, resetting');
        this.clear();
        return this.createEmpty();
      }
      return { ...this.createEmpty(), ...cached, meta: { ...this.createEmpty().meta, ...cached?.meta } };
    } catch (e) {
      console.error('Cache load error:', e);
      this.clear();
      return this.createEmpty();
    }
  },
  
  save(data, debounceMs = 300) {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        const key = this.prefix + CONFIG.CACHE_VERSION;
        data.meta.lastUpdate = Date.now();
        data.meta.isDemo = CONFIG.isDemo;
        localStorage.setItem(key, JSON.stringify(data));
      } catch (e) { console.warn('Cache save failed:', e); }
    }, debounceMs);
  },
  
  clear() {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(this.prefix)) localStorage.removeItem(k);
    });
  },
  
  // Helper per accedere ai dati cached
  get: {
    team: (id) => window.APP_CACHE?.fullTeams?.[id] || null,
    player: (id) => window.APP_CACHE?.playersMap?.[id] || null,
    events: (matchId) => window.APP_CACHE?.eventsByMatch?.[matchId] || [],
    mvp: (matchId) => window.APP_CACHE?.mvpByMatch?.[matchId] || null,
    matches: () => window.APP_CACHE?.matches || [],
    teams: () => window.APP_CACHE?.teams || []
  },
  
  set: {
    team: (id, data) => {
      if (!window.APP_CACHE.fullTeams) window.APP_CACHE.fullTeams = {};
      window.APP_CACHE.fullTeams[id] = data;
      CacheManager.save(window.APP_CACHE);
    },
    player: (player) => {
      if (!player?.PLAYER_ID) return;
      if (!window.APP_CACHE.playersMap) window.APP_CACHE.playersMap = {};
      window.APP_CACHE.playersMap[player.PLAYER_ID] = player;
      CacheManager.save(window.APP_CACHE);
    },
    events: (matchId, events) => {
      if (!window.APP_CACHE.eventsByMatch) window.APP_CACHE.eventsByMatch = {};
      window.APP_CACHE.eventsByMatch[matchId] = Array.isArray(events) ? events : [];
      CacheManager.save(window.APP_CACHE);
    },
    mvp: (matchId, data) => {
      if (!window.APP_CACHE.mvpByMatch) window.APP_CACHE.mvpByMatch = {};
      if (data === null) delete window.APP_CACHE.mvpByMatch[matchId];
      else window.APP_CACHE.mvpByMatch[matchId] = data;
      CacheManager.save(window.APP_CACHE);
    }
  }
};

// ============================================================================
// 🎨 UTILITY FUNCTIONS - DEVONO ESSERE PRIME!
// ============================================================================

function getCachedImage(fileId, size = 400) {
  if (!fileId) return null;
  const version = localStorage.getItem("img_v_" + fileId) || '1';
  return `https://lh3.googleusercontent.com/d/${fileId}=w${size}?v=${version}`;
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const clean = dateStr.substring(0, 10);
  const parts = clean.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  return new Date(y, m - 1, d);
}

function formatLocalDate(date) {
  if (!(date instanceof Date)) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateFull(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const giorni = ["DOMENICA", "LUNEDÌ", "MARTEDÌ", "MERCOLEDÌ", "GIOVEDÌ", "VENERDÌ", "SABATO"];
  const mesi = ["GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];
  return `${giorni[d.getDay()]} ${d.getDate()} ${mesi[d.getMonth()]} ${d.getFullYear()}`;
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function createPreviewUrl(file) {
  return URL.createObjectURL(file);
}

// ============================================================================
// 🌐 API CLIENT - Solo Backend Reale (NO DEMO)
// ============================================================================

const ApiClient = {
  async call(action, payload = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

  try {
    // 🔥 CHIAVE: text/plain evita il preflight OPTIONS che blocca CORS
    const response = await fetch(CONFIG.BACKEND_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'text/plain',  // ← CAMBIA QUESTO
        'Accept': 'application/json'
      },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal
      // ← Non serve mode: 'cors'
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result?.error || result?.success === false) {
      throw new Error(result.error || 'Backend error');
    }
    
    return result?.data ?? result;
    
  } catch (error) {
    clearTimeout(timeout);
    console.error(`API Error [${action}]:`, error);
    throw error;
  }
},

  // Convenience wrappers - tutte le funzioni del tuo backend
  getInitialData: () => ApiClient.call('getInitialAdminData'),
  getMatches: () => ApiClient.call('getMatchesAdmin'),
  getStandings: () => ApiClient.call('getStandingsGironiCached'),
  getTeamFull: (id) => ApiClient.call('getTeamFullCached', id),
  getMatchFull: (id) => ApiClient.call('getMatchFull', id),
  getPlayersByTeam: (teamId) => ApiClient.call('getPlayersByTeam', teamId),
  getPlayerDetail: (id) => ApiClient.call('getPlayerDetail', id),
  
  saveTeamAdmin: (id, name, photo, girone) => 
    ApiClient.call('saveTeamAdmin', [id, name, photo, girone]),
  updateTeamName: (id, name) => 
    ApiClient.call('updateTeamName', [id, name]),
  updateTeamGirone: (id, girone) => 
    ApiClient.call('updateTeamGirone', [id, girone]),
  deleteTeamAdmin: (id) => 
    ApiClient.call('deleteTeamAdmin', [id]),
  
  createMatchGirone: (girone, casa, trasferta, data, ora) => 
    ApiClient.call('createMatchGirone', [girone, casa, trasferta, data, ora]),
  deleteMatchAdmin: (id) => 
    ApiClient.call('deleteMatchAdmin', [id]),
  updateMatchStatus: (id, status) => 
    ApiClient.call('updateMatchStatus', [id, status]),
  
  addEventAdmin: (matchId, teamId, type, minute, playerId, assistId) => 
    ApiClient.call('addEventAdmin', [matchId, teamId, type, minute, playerId, assistId]),
  editEventAdmin: (eventId, data) => 
    ApiClient.call('editEventAdmin', [eventId, data]),
  deleteEventAdmin: (id) => 
    ApiClient.call('deleteEventAdmin', [id]),
  
  savePlayerAdmin: (id, teamId, name, photo) => 
    ApiClient.call('savePlayerAdmin', [id, teamId, name, photo]),
  deletePlayerAdmin: (id) => 
    ApiClient.call('deletePlayerAdmin', [id]),
  
  uploadTeamLogoReplace: (teamId, fileName, fileType, base64) => 
    ApiClient.call('uploadTeamLogoReplace', [teamId, fileName, fileType, base64]),
  uploadTeamPhotoReplace: (teamId, fileName, fileType, base64) => 
    ApiClient.call('uploadTeamPhotoReplace', [teamId, fileName, fileType, base64]),
  uploadPlayerPhotoReplace: (playerId, teamId, playerName, fileName, fileType, base64) => 
    ApiClient.call('uploadPlayerPhotoReplace', [playerId, teamId, playerName, fileName, fileType, base64]),
  
  prepareFinalStage: () => ApiClient.call('prepareFinalStage'),
  createFinalStageMatches: (matches) => ApiClient.call('createFinalStageMatches', [matches]),
  getFinalStageMatches: () => ApiClient.call('getFinalStageMatches'),
  saveMVPFinal: (matchId, playerId) => ApiClient.call('saveMVPFinal', [matchId, playerId]),
  isFinalStageStarted: () => ApiClient.call('isFinalStageStarted'),
  finalizeMVP: (matchId) => ApiClient.call('finalizeMVP', [matchId]),
  getTeamsByGironeSimple: (girone) => ApiClient.call('getTeamsByGironeSimple', [girone])
};

// ============================================================================
// 🧹 CLEANUP & MEMORY MANAGEMENT
// ============================================================================

const Cleanup = {
  tempUrls: new Set(),
  trackUrl: (url) => { if (url?.startsWith?.('blob:')) this.tempUrls.add(url); return url; },
  releaseUrl: (url) => { 
    if (url && this.tempUrls.has(url)) { 
      try { URL.revokeObjectURL(url); } catch {} 
      this.tempUrls.delete(url); 
    } 
  },
  releaseAll: () => { 
    this.tempUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch {} }); 
    this.tempUrls.clear(); 
  }
};

// ============================================================================
// 🧠 GLOBAL STATE
// ============================================================================

window.APP_CACHE = CacheManager.load();

window.APP_STATE = {
  matchesById: {}, teamsById: {}, playersById: {},
  selectedDate: null, availableDates: [], currentMatchId: null, currentTeamId: null,
  activeStandingsTab: "gironi", userSelectedDate: false,
  lastMatch: null, allEvents: [],
  isLoading: { matches: false, standings: false, team: null },
  _currentOpenTeam: null,
  _pendingFinalMatches: null,
  _standingsInterval: null,
  _activeStandingsTab: "gironi",
  _finalStageLoaded: false,
  _standingsActive: false,
  _currentPlayerPreviewUrl: null,
  _matchRequestNonce: 0
};

function hydrateMatches(matches = []) {
  window.APP_STATE.matchesById = {};
  (matches || []).forEach(m => { if (m?.MATCH_ID) window.APP_STATE.matchesById[m.MATCH_ID] = m; });
}

// ============================================================================
// 🎨 RENDER HELPERS
// ============================================================================

const Render = {
  text: (el, content) => { if (el) el.textContent = content ?? ''; },
  
  createEl: (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el[k] = v;
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => el.dataset[Sanitizer.attr(dk)] = Sanitizer.attr(dv));
      else el.setAttribute(Sanitizer.attr(k), Sanitizer.attr(v));
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else if (c instanceof Node) el.appendChild(c);
    });
    return el;
  },
  
  image: (fileId, size = 200, alt = '', className = '') => {
    if (!fileId) {
      return Render.createEl('div', { 
        class: `image-placeholder ${className}`,
        html: '🖼️'
      });
    }
    
    const src = getCachedImage(fileId, size);
    const img = Render.createEl('img', { 
      src, 
      alt: Sanitizer.attr(alt), 
      class: className, 
      loading: 'lazy',  // 🔥 Lazy loading nativo
      onError: function() { 
        this.style.display = 'none'; 
        const fallback = this.nextElementSibling;
        if (fallback) fallback.style.display = 'flex';
      }
    });
    
    const fallback = Render.createEl('div', { 
      class: 'image-fallback', 
      html: '⚠️'
    }); 
    fallback.style.display = 'none';
    
    const wrapper = Render.createEl('div', { class: 'image-wrapper' }, [img, fallback]);
    return wrapper;
  },
  
  teamName: (name) => Sanitizer.html(name?.toUpperCase?.() || ''),
  badges: (events = []) => { 
    const icons = { 'GOAL': '⚽', 'AMMONIZIONE': '🟨', 'ESPULSIONE': '🟥' }; 
    return events.map(e => icons[e.TIPO] || '').join(' '); 
  }
};

// ============================================================================
// 🏠 CORE UI FUNCTIONS
// ============================================================================

function renderToolbar(active) {
  const tb = document.getElementById("toolbar"); if (!tb) return;
  tb.innerHTML = `
    <div class="toolbar-btn ${active==='home'?'active':''}" onclick="showHome()">
      <svg viewBox="0 0 24 24" class="tb-icon"><path d="M3 11 L12 4 L21 11 V20 H14 V14 H10 V20 H3 Z"/></svg>
      <div class="tb-label">HOME</div>
    </div>
    <div class="toolbar-btn ${active==='matches'?'active':''}" onclick="showMatches()">
      <div class="tb-vs">VS</div><div class="tb-label">PARTITE</div>
    </div>
    <div class="toolbar-btn ${active==='teams'?'active':''}" onclick="showTeams()">
      <svg viewBox="0 0 24 24" class="tb-icon"><path d="M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6 Z"/></svg>
      <div class="tb-label">SQUADRE</div>
    </div>
    <div class="toolbar-btn ${active==='standings'?'active':''}" onclick="showStandings()">
      <svg viewBox="0 0 24 24" class="tb-icon"><rect x="4" y="10" width="3" height="8"/><rect x="10" y="6" width="3" height="12"/><rect x="16" y="3" width="3" height="15"/></svg>
      <div class="tb-label">CLASSIFICA</div>
    </div>`;
}

/**
 * Trova la partita LIVE o la prossima partita e genera la card
 */
function getNextMatchCard() {
  const matches = window.APP_CACHE.matches || [];
  const now = new Date();
  const nowStr = formatLocalDate(now);
  const nowTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  
  // 🔥 1. Cerca partita LIVE
  const liveMatch = matches.find(m => m.STATO_PARTITA === "LIVE");
  if (liveMatch) {
    return renderHomeMatchCard(liveMatch, true);
  }
  
  // 🔥 2. Cerca prossima partita (data >= oggi)
  const todayMatches = matches
    .filter(m => {
      const matchDate = String(m.DATA || "").slice(0, 10);
      return matchDate >= nowStr && m.STATO_PARTITA !== "FINITA";
    })
    .sort((a, b) => {
      // Ordina per data poi ora
      const dateA = String(a.DATA || "").slice(0, 10) + (a.ORA || "00:00");
      const dateB = String(b.DATA || "").slice(0, 10) + (b.ORA || "00:00");
      return dateA.localeCompare(dateB);
    });
  
  if (todayMatches.length > 0) {
    return renderHomeMatchCard(todayMatches[0], false);
  }
  
  // 🔥 3. Nessuna partita → placeholder
  return `
    <div class="home-next-match" style="opacity:0.5;pointer-events:none;cursor:default">
      <div class="home-match-label">NESSUNA PARTITA IN PROGRAMMA</div>
      <div class="home-match-content">
        <div class="home-match-teams">
          <span class="home-team">-</span>
          <span class="home-vs">VS</span>
          <span class="home-team">-</span>
        </div>
        <div class="home-match-info">Prossima partita non disponibile</div>
      </div>
    </div>
  `;
}

/**
 * Genera HTML per la card partita nella home (Versione Compatta)
 */
function renderHomeMatchCard(match, isLive) {
  // Loghi
  const logoCasa = match.LOGO_CASA 
    ? `<img src="${getCachedImage(match.LOGO_CASA, 38)}" alt="${match.SQUADRA_CASA}" onerror="this.style.display='none'">`
    : `<div class="home-team-logo">⚽</div>`;
  
  const logoTrasf = match.LOGO_TRASFERTA 
    ? `<img src="${getCachedImage(match.LOGO_TRASFERTA, 38)}" alt="${match.SQUADRA_TRASFERTA}" onerror="this.style.display='none'">`
    : `<div class="home-team-logo">⚽</div>`;
  
  // Centro: LIVE o Ora/Data
  let centerContent = "";
  if (isLive) {
    centerContent = `
      <div class="home-live-badge">
        <div class="home-score">${match.GOL_CASA || 0} - ${match.GOL_TRASFERTA || 0}</div>
        <div class="home-live-text">LIVE</div>
        <div class="home-live-dot"></div>
      </div>
    `;
  } else {
    const dateObj = parseLocalDate(match.DATA);
    const dateStr = dateObj ? `${dateObj.getDate()}/${dateObj.getMonth()+1}` : "";
    centerContent = `
      <div class="home-match-time">${match.ORA || "--:--"}</div>
      <div class="home-match-date">${dateStr}</div>
    `;
  }
  
  return `
    <div class="home-next-match" onclick="openMatch('${match.MATCH_ID}')">
      <!-- Squadra Casa (sinistra) -->
      <div class="home-team-block left">
        ${logoCasa}
        <span class="home-team">${(match.SQUADRA_CASA || "").toUpperCase()}</span>
      </div>
      
      <!-- Centro (Ora o LIVE) -->
      <div class="home-match-center">
        ${centerContent}
      </div>
      
      <!-- Squadra Trasferta (destra allineata) -->
      <div class="home-team-block right">
        ${logoTrasf}
        <span class="home-team">${(match.SQUADRA_TRASFERTA || "").toUpperCase()}</span>
      </div>
    </div>
  `;
}

function showHome() {
  stopStandingsLiveRefresh();
  renderToolbar("home");
  const app = document.getElementById("app"); if (!app) return;
  const currentYear = new Date().getFullYear();
  
  // 🔥 Trova partita LIVE o prossima
  const nextMatchCard = getNextMatchCard();
  
  app.innerHTML = `
    <div class="home-container">
      <div class="home-sponsors">
        <img src="https://i.imgur.com/NugXx1k.png" alt="Sponsor 1" loading="lazy">
        <img src="https://i.imgur.com/oiMHzlC.jpeg" alt="Sponsor 2" loading="lazy">
      </div>
      
      <div class="home-bg">
        <svg class="camp camp-left" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid meet">
          <g transform="translate(0,600) scale(0.1,-0.1)" fill="#8c404e">
            <path d="M1992 5205 c-2 -148 -3 -161 -22 -173 -25 -16 -26 -50 0 -77 17 -18 18 -27 10 -85 -6 -36 -16 -85 -23 -109 -10 -33 -11 -52 -3 -73 15 -40 -8 -202 -45 -312 -43 -127 -80 -188 -182 -291 -65 -67 -98 -109 -125 -164 -35 -72 -37 -79 -37 -175 0 -91 3 -107 30 -161 16 -33 51 -82 78 -109 l49 -49 -5 -56 c-12 -135 -85 -240 -212 -308 -49 -26 -55 -33 -34 -33 57 0 59 -12 59 -298 l0 -261 -27 -19 c-16 -10 -37 -22 -48 -26 -17 -7 -17 -9 -5 -15 9 -3 27 -14 40 -24 l25 -17 0 -361 c0 -399 5 -372 -70 -385 l-40 -7 32 -26 32 -27 1 -274 c0 -150 3 -276 5 -279 13 -12 15 24 15 278 l1 273 30 26 30 25 -48 16 c-41 14 -48 20 -52 46 -3 17 -5 180 -5 362 l0 279 -27 25 c-24 20 -26 26 -13 33 55 34 52 15 51 305 0 266 0 267 -23 286 -13 10 -21 20 -18 22 3 2 29 19 58 37 109 69 172 181 172 306 0 59 -1 62 -46 105 -87 85 -126 202 -104 315 19 101 62 172 156 266 93 91 140 165 178 277 33 96 57 243 55 338 -1 44 3 104 8 134 l9 55 14 -60 c7 -33 14 -112 15 -175 2 -140 29 -259 87 -379 32 -67 58 -103 137 -185 104 -108 143 -173 162 -268 21 -111 -17 -228 -103 -314 l-50 -52 4 -73 c6 -127 64 -223 173 -291 28 -18 52 -33 54 -35 9 -6 -21 -32 -32 -27 -9 3 -12 -64 -10 -273 0 -299 -1 -282 53 -313 13 -7 10 -13 -12 -37 l-28 -29 0 -276 c0 -151 3 -316 6 -366 l7 -90 44 -13 45 -12 -27 -21 -26 -21 1 -274 c0 -151 3 -277 5 -280 13 -12 15 24 15 278 l1 273 30 26 30 25 -48 16 c-41 14 -48 20 -52 46 -3 17 -5 180 -5 362 l-1 333 25 17 c13 10 31 21 39 24 10 4 1 13 -30 30 l-44 24 -3 263 c-2 251 -2 262 18 282 11 11 30 20 43 20 16 0 8 8 -32 30 -143 79 -221 194 -221 327 0 37 6 48 51 93 27 27 62 76 77 108 22 49 26 71 27 158 0 96 -2 103 -37 175 -27 55 -60 98 -130 170 -109 112 -156 191 -193 330 -28 105 -44 272 -27 283 7 4 5 21 -4 53 -8 27 -19 77 -23 113 -8 57 -6 68 10 86 25 27 24 59 -2 77 -16 12 -21 28 -24 77 -4 55 -2 63 15 67 25 7 27 25 3 21 -16 -3 -19 8 -24 82 -4 69 -6 55 -7 -75z m38 -209 c0 -20 -25 -37 -44 -30 -19 7 -21 35 -4 52 14 14 48 -2 48 -22z"/>
          </g>
        </svg>
        <svg class="camp camp-right" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid meet">
          <g transform="translate(0,600) scale(0.1,-0.1)" fill="#863443">
            <path d="M2152 5028 c3 -42 3 -43 -27 -40 -33 4 -25 -13 10 -20 17 -3 20 -12 23 -75 3 -64 1 -73 -18 -83 -24 -13 -28 -68 -5 -76 21 -9 19 -29 -20 -230 -75 -376 -179 -742 -247 -864 -17 -30 -51 -74 -76 -97 -40 -39 -43 -44 -28 -58 14 -14 16 -54 16 -310 l0 -293 -27 -10 c-69 -25 -659 -248 -751 -284 -57 -22 -101 -42 -99 -45 5 -5 340 112 605 211 190 71 233 88 481 190 62 26 115 45 117 43 2 -2 -5 -15 -17 -28 -12 -13 -108 -125 -214 -249 -432 -504 -665 -783 -660 -789 4 -3 21 11 38 31 18 20 167 193 332 385 165 191 304 353 310 359 5 6 64 74 130 152 l120 142 3 -73 c2 -39 7 -76 12 -81 7 -7 10 143 10 407 0 229 3 417 7 417 4 0 98 -35 209 -77 176 -68 201 -80 193 -95 -5 -9 -9 -228 -9 -499 l0 -482 62 -101 c64 -105 343 -522 378 -566 50 -63 11 8 -89 159 -60 91 -159 246 -220 344 l-111 178 0 474 c0 459 1 476 20 492 19 16 18 17 -14 40 -41 27 -114 134 -155 227 -73 161 -187 567 -242 855 -19 105 -20 116 -5 126 21 16 21 61 0 73 -13 7 -17 26 -18 80 l-1 71 28 -6 c16 -3 27 -1 27 5 0 6 -12 12 -27 14 -27 3 -28 5 -25 51 3 38 1 47 -12 47 -13 0 -16 -9 -14 -42z m32 -457 c10 -86 100 -442 153 -606 52 -161 120 -313 164 -368 17 -21 29 -40 28 -41 -2 -2 -65 21 -139 50 -74 30 -158 62 -186 71 l-51 16 -157 -70 c-86 -39 -156 -69 -156 -66 0 2 11 19 24 36 13 18 35 55 49 82 55 110 160 491 219 797 18 91 35 165 39 162 3 -2 9 -30 13 -63z m-36 -1227 l-3 -316 -168 -68 c-92 -37 -169 -64 -172 -60 -2 4 -4 131 -4 283 0 151 -3 286 -6 299 -6 23 4 28 162 100 92 42 174 76 181 77 10 1 12 -65 10 -315z"/>
          </g>
        </svg>
        <div class="field-lines"><div class="line center"></div><div class="circle"></div></div>
      </div>
      
      <div class="title-wrapper">
        <div class="main-title">TORNEO DEI PAESI</div>
        <div class="sub-title">SARNONICO <span id="annoCorrente">${currentYear}</span></div>
      </div>
      
      <!-- 🔥 CARD PROSSIMA PARTITA / LIVE -->
      ${nextMatchCard}
    </div>
  `;
}

// ============================================================================
// 👥 TEAMS FUNCTIONS (Semplificate - da espandere dopo)
// ============================================================================

function showTeams() {
  stopStandingsLiveRefresh();
  renderToolbar("teams");
  document.getElementById("app").innerHTML = `
    <div class="teams-page">
      <div class="teams-header">
        <div class="page-title">SQUADRE</div>
        <div class="phase-btn" onclick="openNewTeamPage()">+ NUOVA SQUADRA</div>
      </div>
      <div class="teams-scroll"><div id="teamsList"></div></div>
    </div>`;
  renderTeams();
}

function renderTeams() {
  const container = document.getElementById("teamsList");
  if (!container) return;
  
  const teams = window.APP_CACHE.teams || [];
  
  if (teams.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#888">
        <div style="font-size:3rem;margin-bottom:16px">⚽</div>
        <div>Nessuna squadra presente</div>
      </div>
    `;
    return;
  }
  
  // 🔥 RIMOSSA COLONNA GIRONE
  let html = "<table class='teams-table'><tr><th></th><th>SQUADRA</th><th></th></tr>";
  
  teams.forEach(t => {
    const logoHtml = t.LOGO_FILE_ID 
      ? `<img src="${getCachedImage(t.LOGO_FILE_ID, 65)}" class="team-mini-logo" alt="${t.NOME_SQUADRA}" onerror="this.style.display='none';this.parentElement.innerHTML='⚽'">`
      : `<div style="font-size:1.2rem">⚽</div>`;
    
    html += `
      <tr class='team-row-click' data-id='${t.TEAM_ID}'>
        <td><div class="team-logo-box">${logoHtml}</div></td>
        <td><span class='teams-team-name'>${(t.NOME_SQUADRA || "").toUpperCase()}</span></td>
        <td><div class='delete-btn' data-del='${t.TEAM_ID}' onclick="event.stopPropagation(); deleteTeam('${t.TEAM_ID}')"></div></td>
      </tr>
    `;
  });
  
  html += "</table>";
  container.innerHTML = html;
  
  document.querySelectorAll(".team-row-click").forEach(row => {
    row.onclick = () => openTeamEditor(row.dataset.id);
  });
}

function openNewTeamPage() {
  window.APP_STATE.currentTeamId = null;
  document.getElementById("app").innerHTML = `
    <div class="page-container">
      <div class="page-title">NUOVA SQUADRA</div>
      <div class="form-wrapper">
        <div class="form-row">
          <div class="form-group"><label>Nome squadra</label><input id="teamName" class="form-input" placeholder="Es: SARNONICO"></div>
          <div class="form-group small"><label>Girone</label>
            <select id="teamGirone" class="form-select">
              <option value="">Seleziona</option><option value="A">Girone A</option><option value="B">Girone B</option>
            </select>
          </div>
        </div>
        <div class="upload-row">
          <div id="logoUpload" class="uploadBox">LOGO</div><input type="file" id="logoInput" hidden>
          <div id="photoUpload" class="uploadBox">FOTO SQUADRA</div><input type="file" id="photoInput" hidden>
        </div>
        <div class="form-actions">
          <div class="phase-btn" onclick="saveTeam()">SALVA</div>
          <div class="phase-btn secondary" onclick="showTeams()">INDIETRO</div>
        </div>
      </div>
    </div>`;
  initUploadBox("logoUpload", "logoInput"); 
  initUploadBox("photoUpload", "photoInput");
}

function initUploadBox(boxId, inputId) {
  const box = document.getElementById(boxId), input = document.getElementById(inputId);
  if (!box || !input) return;
  box.onclick = () => input.click();
  box.ondragover = e => { e.preventDefault(); box.style.background = "#fff5f7"; box.style.borderColor = "#7a1e2c"; };
  box.ondragleave = () => { box.style.background = "#fafafa"; box.style.borderColor = "#ccc"; };
  box.ondrop = e => { 
    e.preventDefault(); 
    input.files = e.dataTransfer.files; 
    box.innerHTML = Sanitizer.html(e.dataTransfer.files[0]?.name || 'File selezionato'); 
    box.style.background = "#fafafa"; box.style.borderColor = "#ccc"; 
  };
  input.onchange = () => { if (input.files[0]) box.innerHTML = Sanitizer.html(input.files[0].name); };
}

async function saveTeam() {
  const name = document.getElementById("teamName")?.value?.trim()?.toUpperCase();
  const girone = document.getElementById("teamGirone")?.value;
  if (!name) { alert("Inserisci nome squadra"); return; }
  if (!girone) { alert("Seleziona girone"); return; }
  
  try {
    const res = await ApiClient.saveTeamAdmin(window.APP_STATE.currentTeamId, name, "", girone);
    // Aggiorna cache locale
    if (res?.id) {
      const newTeam = { TEAM_ID: res.id, NOME_SQUADRA: name, GIRONE: girone, LOGO_FILE_ID: null };
      window.APP_CACHE.teams = [...(window.APP_CACHE.teams || []), newTeam];
      CacheManager.save(window.APP_CACHE);
    }
    showTeams();
  } catch (e) { 
    alert("Errore salvataggio: " + (e?.message || e)); 
  }
}

function openTeamEditor(teamId) {
  window.APP_STATE._currentOpenTeam = teamId; 
  window.APP_STATE.currentTeamId = teamId;
  
  // 🔥 Renderizza SUBITO la struttura base
  document.getElementById("app").innerHTML = `
    <div class="team-editor">
      <div class="team-header-fixed">
        <div class="team-header">
          <div id="teamLogoBox"><div class="empty-logo">⚽</div></div>
          <div class="team-name-wrapper">
            <div id="teamNameDisplay" class="team-name-display">CARICAMENTO...</div>
            <input id="teamNameInput" style="display:none;">
            <div id="teamGironeDisplay" class="team-girone-display">GIRONE -</div>
            <select id="teamGironeSelect" class="team-girone-select" style="display:none;">
              <option value="A">GIRONE A</option><option value="B">GIRONE B</option>
            </select>
          </div>
        </div>
      </div>
      <div class="team-content-scroll">
        <div id="teamPhotoBox">
          <div class="team-photo-empty">
            <div class="team-photo-empty-plus">📷</div>
            <div class="team-photo-empty-text">FOTO SQUADRA</div>
          </div>
        </div>
        <div class="players-header">
          <div class="players-title">GIOCATORI</div>
          <div class="phase-btn" onclick="openPlayerPopup()">+ NUOVO GIOCATORE</div>
        </div>
        <div id="playersSection"><div style="text-align:center;padding:20px;color:#888">Nessun giocatore</div></div>
        <div class="back-btn-wrapper"><div class="phase-btn secondary" onclick="showTeams()">← INDIETRO</div></div>
      </div>
    </div>`;
  
  // 🔥 Carica dati in background (NON bloccante)
  loadTeamData(teamId);
}

function loadTeamData(teamId) {
  // Prima prova cache (istantaneo)
  const cached = window.APP_CACHE.fullTeams?.[teamId];
  if (cached?.team) {
    renderTeamEditor(cached.team, cached.players || []);
  }
  
  // Poi aggiorna dal backend (async)
  ApiClient.getTeamFull(teamId)
    .then(data => {
      if (window.APP_STATE._currentOpenTeam !== teamId) return;
      
      // Aggiorna cache
      if (!window.APP_CACHE.fullTeams) window.APP_CACHE.fullTeams = {};
      window.APP_CACHE.fullTeams[teamId] = data;
      CacheManager.save(window.APP_CACHE);
      
      // Renderizza se i dati sono cambiati
      if (data?.team) {
        renderTeamEditor(data.team, data.players || []);
      }
    })
    .catch(error => {
      console.warn('Failed to load team from backend:', error);
      // Usa comunque la cache se disponibile
    });
}

function renderTeamEditor(team, players = []) {
  if (!team) return;
  
  // Logo
  const logoBox = document.getElementById("teamLogoBox");
  if (logoBox) {
    if (team.LOGO_FILE_ID) {
      logoBox.innerHTML = `<img src="${getCachedImage(team.LOGO_FILE_ID, 512)}" class="team-header-logo" alt="Logo" onclick="teamLogoAction()">`;
    } else {
      logoBox.innerHTML = `<div class="empty-logo" onclick="uploadNewLogo()">⚽</div>`;
    }
  }
  
  // 🔥 FOTO SQUADRA
  const photoBox = document.getElementById("teamPhotoBox");
  if (photoBox) {
    if (team.FOTO_SQUADRA_FILE_ID) {
      photoBox.innerHTML = `
        <div class="team-photo-wrapper">
          <img src="${getCachedImage(team.FOTO_SQUADRA_FILE_ID, 800)}" 
               class="team-photo-view loaded" 
               alt="Foto squadra" 
               onclick="teamPhotoAction()">
        </div>
      `;
    } else {
      photoBox.innerHTML = `
        <div class="team-photo-empty" onclick="uploadNewTeamPhoto()">
          <div class="team-photo-empty-plus">📷</div>
          <div class="team-photo-empty-text">FOTO SQUADRA</div>
        </div>
      `;
    }
  }
  
  // Nome (editabile)
  const nameDisplay = document.getElementById("teamNameDisplay");
  const nameInput = document.getElementById("teamNameInput");
  if (nameDisplay && nameInput) {
    nameDisplay.textContent = team.NOME_SQUADRA || "";
    nameInput.value = team.NOME_SQUADRA || "";
    nameDisplay.onclick = () => { nameDisplay.style.display="none"; nameInput.style.display="block"; nameInput.focus(); };
    nameInput.onblur = async () => {
      const newName = nameInput.value.trim().toUpperCase();
      if (newName && newName !== team.NOME_SQUADRA) {
        nameDisplay.textContent = newName;
        await ApiClient.updateTeamName(team.TEAM_ID, newName);
        // Aggiorna cache
        if (window.APP_CACHE.teams) {
          const idx = window.APP_CACHE.teams.findIndex(t=>t.TEAM_ID===team.TEAM_ID);
          if (idx >= 0) { window.APP_CACHE.teams[idx].NOME_SQUADRA = newName; CacheManager.save(window.APP_CACHE); }
        }
      }
      nameInput.style.display="none"; nameDisplay.style.display="block";
    };
  }
  
  // Girone (editabile)
  const gironeDisplay = document.getElementById("teamGironeDisplay");
  const gironeSelect = document.getElementById("teamGironeSelect");
  if (gironeDisplay && gironeSelect) {
    gironeDisplay.textContent = "GIRONE " + (team.GIRONE || "-");
    gironeSelect.value = team.GIRONE || "A";
    gironeDisplay.onclick = () => { gironeDisplay.style.display="none"; gironeSelect.style.display="block"; gironeSelect.focus(); };
    gironeSelect.onchange = async () => {
      const newGirone = gironeSelect.value;
      gironeDisplay.textContent = "GIRONE " + newGirone;
      await ApiClient.updateTeamGirone(team.TEAM_ID, newGirone);
      // Aggiorna cache
      if (window.APP_CACHE.teams) {
        const idx = window.APP_CACHE.teams.findIndex(t=>t.TEAM_ID===team.TEAM_ID);
        if (idx >= 0) { window.APP_CACHE.teams[idx].GIRONE = newGirone; CacheManager.save(window.APP_CACHE); }
      }
      refreshStandingsDebounced();
    };
    gironeSelect.onblur = () => { gironeSelect.style.display="none"; gironeDisplay.style.display="block"; };
  }
  
  // Players
  renderPlayersList(players);
}

// ============================================
// LOGO SQUADRA
// ============================================

function teamLogoAction() {
  const teamId = window.APP_STATE.currentTeamId;
  const team = window.APP_CACHE.fullTeams?.[teamId]?.team;
  
  if (!team?.LOGO_FILE_ID) {
    uploadNewLogo();
    return;
  }
  
  const modal = document.createElement("div");
  modal.className = "modalOverlay";
  modal.innerHTML = `
    <div class="modalBox">
      <div class="modalTitle">LOGO SQUADRA</div>
      <img src="${getCachedImage(team.LOGO_FILE_ID, 400)}" style="max-width:100%;border-radius:12px;margin:20px 0;">
      <div class="modalActions">
        <div class="phase-btn secondary" onclick="window.open('https://drive.google.com/file/d/${team.LOGO_FILE_ID}/view', '_blank'); this.closest('.modalOverlay').remove()">APRI SU DRIVE</div>
        <div class="phase-btn" onclick="this.closest('.modalOverlay').remove(); uploadNewLogo()">CAMBIA LOGO</div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

async function uploadNewLogo() {
  const teamId = window.APP_STATE.currentTeamId;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  
  input.onchange = async function() {
    const file = input.files[0];
    if (!file) return;
    
    const logoBox = document.getElementById("teamLogoBox");
    const tempUrl = URL.createObjectURL(file);
    
    logoBox.innerHTML = `
      <div class="logo-loading-wrap">
        <img src="${tempUrl}" class="team-header-logo updating">
        <div class="logo-updating-badge">AGGIORNO...</div>
      </div>
    `;
    
    try {
      const base64 = await fileToBase64(file);
      const newId = await ApiClient.uploadTeamLogoReplace(teamId, file.name, file.type, base64);
      
      // Aggiorna cache
      if (window.APP_CACHE.fullTeams?.[teamId]?.team) {
        window.APP_CACHE.fullTeams[teamId].team.LOGO_FILE_ID = newId?.fileId || newId;
        CacheManager.save(window.APP_CACHE);
      }
      
      // Aggiorna UI dopo 2 secondi
      setTimeout(() => {
        renderTeamEditor(window.APP_CACHE.fullTeams[teamId].team, window.APP_CACHE.fullTeams[teamId].players || []);
      }, 2000);
      
    } catch (error) {
      console.error('Upload logo failed:', error);
      alert('Errore upload logo: ' + error.message);
      URL.revokeObjectURL(tempUrl);
      renderTeamEditor(window.APP_CACHE.fullTeams[teamId].team, window.APP_CACHE.fullTeams[teamId].players || []);
    }
  };
  
  input.click();
}

// ============================================
// FOTO SQUADRA
// ============================================

async function uploadNewTeamPhoto() {
  const teamId = window.APP_STATE.currentTeamId;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  
  input.onchange = async function() {
    const file = input.files[0];
    if (!file) return;
    
    const photoBox = document.getElementById("teamPhotoBox");
    const tempUrl = URL.createObjectURL(file);
    
    photoBox.innerHTML = `
      <div class="team-photo-wrapper">
        <img src="${tempUrl}" class="team-photo-view updating">
        <div class="photo-updating-badge">AGGIORNAMENTO...</div>
      </div>
    `;
    
    try {
      const base64 = await fileToBase64(file);
      const newId = await ApiClient.uploadTeamPhotoReplace(teamId, file.name, file.type, base64);
      
      // Aggiorna cache
      if (window.APP_CACHE.fullTeams?.[teamId]?.team) {
        window.APP_CACHE.fullTeams[teamId].team.FOTO_SQUADRA_FILE_ID = newId;
        CacheManager.save(window.APP_CACHE);
      }
      
      // Aggiorna UI dopo 2 secondi
      setTimeout(() => {
        renderTeamEditor(window.APP_CACHE.fullTeams[teamId].team, window.APP_CACHE.fullTeams[teamId].players || []);
      }, 2000);
      
    } catch (error) {
      console.error('Upload photo failed:', error);
      alert('Errore upload foto: ' + error.message);
      URL.revokeObjectURL(tempUrl);
      renderTeamEditor(window.APP_CACHE.fullTeams[teamId].team, window.APP_CACHE.fullTeams[teamId].players || []);
    }
  };
  
  input.click();
}

function teamPhotoAction() {
  const teamId = window.APP_STATE.currentTeamId;
  const team = window.APP_CACHE.fullTeams?.[teamId]?.team;
  
  if (!team?.FOTO_SQUADRA_FILE_ID) {
    uploadNewTeamPhoto();
    return;
  }
  
  const modal = document.createElement("div");
  modal.className = "modalOverlay";
  modal.innerHTML = `
    <div class="modalBox" style="max-width:800px;">
      <div class="modalTitle">FOTO SQUADRA</div>
      <img src="${getCachedImage(team.FOTO_SQUADRA_FILE_ID, 1200)}" style="max-width:100%;border-radius:12px;margin:20px 0;">
      <div class="modalActions">
        <div class="phase-btn secondary" onclick="window.open('https://drive.google.com/file/d/${team.FOTO_SQUADRA_FILE_ID}/view', '_blank'); this.closest('.modalOverlay').remove()">APRI SU DRIVE</div>
        <div class="phase-btn" onclick="this.closest('.modalOverlay').remove(); uploadNewTeamPhoto()">CAMBIA FOTO</div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

// ============================================
// GIOCATORI - POPUP
// ============================================

let currentPlayerId = null;
let playerPhotoTemp = null;

function openPlayerPopup(playerId = null) {
  currentPlayerId = playerId;
  playerPhotoTemp = null;
  
  const teamId = window.APP_STATE.currentTeamId;
  const title = playerId ? "MODIFICA GIOCATORE" : "NUOVO GIOCATORE";
  
  const modal = document.createElement("div");
  modal.className = "modalOverlay";
  modal.innerHTML = `
    <div class="modalBox player-modal" id="playerBox">
      <div class="modalTitle">${title}</div>
      <div class="player-form">
        <label>NOME</label>
        <input id="playerNameInput" class="player-input" placeholder="Inserisci nome giocatore">
        
        <div id="playerPhotoUpload" class="player-upload">
          FOTO GIOCATORE
        </div>
        
        <div class="modalActions">
          <div class="phase-btn" onclick="savePlayerPopup()">SALVA</div>
          ${playerId ? '<div class="phase-btn secondary" onclick="deletePlayer(\'' + playerId + '\'); this.closest(\'.modalOverlay\').remove()">ELIMINA</div>' : ''}
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.getElementById("playerBox").onclick = (e) => e.stopPropagation();
  
  // Inizializza upload foto
  initPlayerUploadBox();
  
  // Se modifica, carica dati giocatore
  if (playerId) {
    const player = window.APP_CACHE.playersMap?.[playerId];
    if (player) {
      loadPlayerData(player);
    } else {
      // Carica dal backend
      ApiClient.getPlayerDetail(playerId)
        .then(p => {
          if (p) {
            loadPlayerData(p);
            // Aggiorna cache
            if (!window.APP_CACHE.playersMap) window.APP_CACHE.playersMap = {};
            window.APP_CACHE.playersMap[playerId] = p;
            CacheManager.save(window.APP_CACHE);
          }
        })
        .catch(err => console.error('Error loading player:', err));
    }
  }
}

function initPlayerUploadBox() {
  const box = document.getElementById("playerPhotoUpload");
  box.onclick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      playerPhotoTemp = input.files[0];
      renderPlayerTempPhoto();
    };
    input.click();
  };
}

function loadPlayerData(player) {
  document.getElementById("playerNameInput").value = player?.NOME || "";
  
  const box = document.getElementById("playerPhotoUpload");
  if (player?.FOTO_ID || player?.FOTO_URL) {
    const fotoId = player.FOTO_ID || player.FOTO_URL;
    box.innerHTML = `<img src="${getCachedImage(fotoId, 200)}" class="playerPhotoBig" alt="${player.NOME}">`;
    box.classList.add("has-photo");
  } else {
    box.innerHTML = "FOTO GIOCATORE";
    box.classList.remove("has-photo");
  }
}

function renderPlayerTempPhoto() {
  const box = document.getElementById("playerPhotoUpload");
  if (playerPhotoTemp) {
    const url = URL.createObjectURL(playerPhotoTemp);
    box.innerHTML = `<img src="${url}" class="playerPhotoBig" alt="Preview">`;
    box.classList.add("has-photo");
  }
}

async function savePlayerPopup() {
  const name = document.getElementById("playerNameInput")?.value?.trim();
  if (!name) {
    alert("Inserisci nome giocatore");
    return;
  }
  
  const teamId = window.APP_STATE.currentTeamId;
  
  try {
    // Salva giocatore
    const playerId = await ApiClient.savePlayerAdmin(currentPlayerId, teamId, name.toUpperCase(), "");
    currentPlayerId = playerId;
    
    // Upload foto se presente
    if (playerPhotoTemp) {
      const base64 = await fileToBase64(playerPhotoTemp);
      const newPhotoId = await ApiClient.uploadPlayerPhotoReplace(
        playerId, 
        teamId, 
        name.toUpperCase(), 
        playerPhotoTemp.name, 
        playerPhotoTemp.type, 
        base64
      );
      
      // Aggiorna cache
      if (window.APP_CACHE.playersMap) {
        window.APP_CACHE.playersMap[playerId] = {
          ...window.APP_CACHE.playersMap[playerId],
          FOTO_ID: newPhotoId,
          NOME: name.toUpperCase()
        };
        CacheManager.save(window.APP_CACHE);
      }
    }
    
    // Chiudi popup
    document.querySelector(".modalOverlay")?.remove();
    
    // Ricarica lista giocatori
    await loadTeamData(teamId);
    
  } catch (error) {
    console.error('Save player error:', error);
    alert("Errore salvataggio: " + error.message);
  }
}

async function deletePlayer(playerId) {
  if (!confirm("Eliminare questo giocatore?")) return;
  
  try {
    await ApiClient.deletePlayerAdmin(playerId);
    
    // Rimuovi da cache
    if (window.APP_CACHE.playersMap) {
      delete window.APP_CACHE.playersMap[playerId];
    }
    
    // Ricarica lista
    await loadTeamData(window.APP_STATE.currentTeamId);
    
  } catch (error) {
    console.error('Delete player error:', error);
    alert("Errore eliminazione: " + error.message);
  }
}

function renderPlayersList(players) {
  const container = document.getElementById("playersSection");
  if (!container) return;
  
  if (!players?.length) {
    container.innerHTML = `<div style="text-align:center;padding:20px;color:#888">Nessun giocatore</div>`;
    return;
  }
  
  // 🔥 HEADER CON COLONNA MVP VINTI
  let html = `
    <table class='playersTable'>
      <tr>
        <th></th>
        <th>NOME</th>
        <th>GOL</th>
        <th>ASS</th>
        <th>AMM</th>
        <th>ESP</th>
        <th>MVP</th>
      </tr>
  `;
  
  players.forEach(p => {
    const photoHtml = p.FOTO_ID || p.FOTO_URL
      ? `<img src="${getCachedImage(p.FOTO_ID || p.FOTO_URL, 42)}" class="playerPhoto" alt="${p.NOME}" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\'playerPhotoEmpty\'></div>'">`
      : "<div class='playerPhotoEmpty'></div>";
    
    // 🔥 Valore MVP (gestisce sia MVP che MVP_VINTI)
    const mvpCount = p.MVP_VINTI ?? p.MVP ?? 0;
    
    html += `
      <tr onclick="openPlayerPopup('${p.PLAYER_ID}')">
        <td>${photoHtml}</td>
        <td>${(p.NOME || "").toUpperCase()}</td>
        <td>${p.GOL || 0}</td>
        <td>${p.ASSIST || 0}</td>
        <td>${p.AMMONIZIONI || 0}</td>
        <td>${p.ESPULSIONI || 0}</td>
        <td class="mvp-cell">${mvpCount}</td>
      </tr>
    `;
  });
  
  html += "</table>";
  container.innerHTML = html;
}

function deleteTeam(id) {
  if (!confirm("Eliminare squadra?")) return;
  document.querySelector(`[data-id="${Sanitizer.attr(id)}"]`)?.remove();
  if (window.APP_CACHE.fullTeams) delete window.APP_CACHE.fullTeams[id];
  if (window.APP_CACHE.teams) {
    window.APP_CACHE.teams = window.APP_CACHE.teams.filter(t => t.TEAM_ID != id); 
    CacheManager.save(window.APP_CACHE);
  }
  ApiClient.deleteTeamAdmin(id).catch(console.error);
}

// ============================================================================
// ⚽ MATCHES FUNCTIONS
// ============================================================================

function showMatches() {
  stopStandingsLiveRefresh();
  window.APP_STATE.selectedDate = null; window.APP_STATE.userSelectedDate = false;
  renderToolbar("matches"); 
  document.getElementById("app").innerHTML = `
    <div class="matches-page"><div class="page-title">PARTITE</div>
    <div class="matches-actions"><div class="phase-btn" onclick="openNewMatchPage()">+ INSERISCI PARTITE</div></div>
    <div class="dates-toolbar" id="datesToolbar"></div>
    <div class="matches-scroll"><div id="matchesList"></div></div></div>`;
  renderMatches();
}

function renderMatches() {
  const data = window.APP_CACHE.matches || [];
  
  // Filtra solo partite valide
  const matches = (data || [])
    .filter(m => m?.MATCH_ID && m?.DATA)
    .map(m => ({ 
      ...m, 
      DATA: String(m.DATA).slice(0, 10), 
      STATO_PARTITA: String(m.STATO_PARTITA || "").trim().toUpperCase() 
    }));
  
  // Estrai date uniche
  const dates = [...new Set(matches.filter(m => m.DATA).map(m => m.DATA))]
    .sort()
    .slice(0, 10); // Limita a 10 giornate per performance
  
  window.APP_STATE.availableDates = dates;
  
  // Seleziona prima data disponibile
  const today = new Date();
  const todayStr = formatLocalDate(today);
  const futureDates = dates.filter(d => d >= todayStr);
  
  if (!window.APP_STATE.selectedDate) {
    window.APP_STATE.selectedDate = futureDates[0] || dates[0] || todayStr;
  }
  
  renderDatesToolbar(); 
  renderMatchesByDate(window.APP_STATE.selectedDate);
}

function renderDatesToolbar() {
  const container = document.getElementById("datesToolbar");
  if (!container) return;
  
  const now = new Date();
  const todayStr = formatLocalDate(now);
  
  let html = "";
  
  window.APP_STATE.availableDates.forEach(d => {
    const isActive = d === window.APP_STATE.selectedDate;
    const isToday = d === todayStr;
    const dateObj = parseLocalDate(d);
    
    if (!dateObj) return;
    
    const dayName = dateObj.toLocaleString("it-IT", { weekday: "short" }).toUpperCase();
    const dayNum = dateObj.getDate();
    const monthName = dateObj.toLocaleString("it-IT", { month: "short" });
    
    html += `
      <div class="date-item ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}" 
           onclick="selectDate('${d}')">
        <div class="date-day">${dayNum}</div>
        <div class="date-month">${monthName}</div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  setTimeout(centerActiveDate, 100);
}

function selectDate(date) { 
  window.APP_STATE.selectedDate = date; 
  window.APP_STATE.userSelectedDate = true; 
  renderDatesToolbar(); 
  renderMatchesByDate(date); 
}

function centerActiveDate() {
  const container = document.getElementById("datesToolbar"), active = container?.querySelector(".date-item.active");
  if (!active) return;
  const offset = active.offsetLeft - (container.offsetWidth/2) + (active.offsetWidth/2);
  container.scrollTo({ left: offset, behavior: "smooth" });
}

function renderMatchesByDate(date) {
  const container = document.getElementById("matchesList");
  if (!container) return;
  
  const allMatches = window.APP_CACHE.matches || [];

   // 🔥 DEBUG: Controlla partite FINALI
  const finalMatches = allMatches.filter(m => m.FASE === "FINALI");
  console.log('🔍 Partite FINALI:', finalMatches.map(m => ({
    id: m.MATCH_ID,
    key: m.matchKey,
    data: m.DATA,
    ora: m.ORA,
    casa: m.SQUADRA_CASA,
    trasferta: m.SQUADRA_TRASFERTA
  })));
  
  // 🔥 FILTRA: Mostra TUTTE le partite (gironi + finali)
  let matches = allMatches
    .filter(m => {
      const matchDate = String(m.DATA || "").slice(0, 10);
      return matchDate === date;
    })
    .sort((a, b) => {
      const order = { "LIVE": 0, "PROGRAMMATA": 1, "FINITA": 2 };
      return (order[a.STATO_PARTITA] || 99) - (order[b.STATO_PARTITA] || 99);
    });
  
  if (matches.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#888">
        <div style="font-size:3rem;margin-bottom:16px">📅</div>
        <div>Nessuna partita per questa data</div>
      </div>
    `;
    return;
  }
  
  let html = "";
  
  matches.forEach(m => {
    // 🔥 LOGHI SQUADRE
    const logoCasa = m.LOGO_CASA 
      ? `<img src="${getCachedImage(m.LOGO_CASA, 50)}" alt="${m.SQUADRA_CASA}" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\'team-logo-placeholder\'></div>'">`
      : `<div class="team-logo-placeholder"></div>`;
    
    const logoTrasf = m.LOGO_TRASFERTA 
      ? `<img src="${getCachedImage(m.LOGO_TRASFERTA, 50)}" alt="${m.SQUADRA_TRASFERTA}" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\'team-logo-placeholder\'></div>'">`
      : `<div class="team-logo-placeholder"></div>`;
    
    // 🔥 FASE PARTITA (GIRONI/FINALI)
    const faseBadge = m.FASE && m.FASE !== "GIRONI" 
      ? `<div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-top:4px">${m.FASE}</div>`
      : '';
    
    let center = "";
    if (m.STATO_PARTITA === "LIVE") {
      center = `
        <div class="score live">${m.GOL_CASA || 0} - ${m.GOL_TRASFERTA || 0}</div>
        <div class="status live">LIVE</div>
        ${faseBadge}
      `;
    } else if (m.STATO_PARTITA === "FINITA") {
      center = `
        <div class="score">${m.GOL_CASA || 0} - ${m.GOL_TRASFERTA || 0}</div>
        <div class="status">TERMINATA</div>
        ${faseBadge}
      `;
    } else {
      center = `
        <div class="time">🕒 ${m.ORA || "--:--"}</div>
        ${faseBadge}
      `;
    }
    
    html += `
      <div class="match-card ${m.STATO_PARTITA === "LIVE" ? "live-match" : ""}" 
           onclick="openMatch('${m.MATCH_ID}')">
        <div class="team-block left">
          ${logoCasa}
          <div class="team-name">${(m.SQUADRA_CASA || "").toUpperCase()}</div>
        </div>
        <div class="match-center">${center}</div>
        <div class="team-block right">
          <div class="team-name">${(m.SQUADRA_TRASFERTA || "").toUpperCase()}</div>
          ${logoTrasf}
        </div>
        <div class="match-options" onclick='event.stopPropagation(); openMatchMenu(event, "${m.MATCH_ID}")'>⋮</div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function openMatchMenu(ev, matchId) {
  ev.stopPropagation(); ev.preventDefault();
  document.querySelectorAll(".event-popup-menu").forEach(e => e.remove());
  const menu = document.createElement("div"); menu.className = "event-popup-menu";
  menu.innerHTML = `<div onclick='this.parentElement.remove(); deleteMatch("${Sanitizer.attr(matchId)}")'>🗑 Elimina partita</div>`;
  menu.style.position = "fixed"; menu.style.left = ev.clientX + "px"; menu.style.top = ev.clientY + "px";
  menu.onclick = e => e.stopPropagation(); document.body.appendChild(menu);
  setTimeout(() => {
    const close = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", close); } };
    document.addEventListener("click", close, { once: true });
  }, 0);
}

function deleteMatch(matchId) {
  if (!confirm("Eliminare partita?")) return;
  delete window.APP_STATE.matchesById[matchId];
  if (window.APP_CACHE.matches) {
    window.APP_CACHE.matches = window.APP_CACHE.matches.filter(m => m.MATCH_ID != matchId);
    CacheManager.save(window.APP_CACHE);
  }
  renderMatches();
  ApiClient.deleteMatchAdmin(matchId).catch(console.error);
}

function openNewMatchPage() {
  const modal = document.createElement("div"); modal.className = "modalOverlay";
  modal.innerHTML = `<div class="modalBox match-modal" id="matchBox"><div class="modalTitle">NUOVA PARTITA</div><div class="match-form">
    <select id="matchGirone" class="match-select"><option value="">SELEZIONA GIRONE</option><option value="A">GIRONE A</option><option value="B">GIRONE B</option></select>
    <div class="match-row"><select id="teamCasa" class="match-select"><option value="">SQUADRA CASA</option></select><div class="vs-big">VS</div><select id="teamTrasferta" class="match-select"><option value="">SQUADRA TRASFERTA</option></select></div>
    <div class="match-row time-row"><input type="date" id="matchDate" class="match-input"><input type="time" id="matchTime" class="match-input"></div>
    <div class="modalActions"><div class="phase-btn" onclick="saveMatch()">SALVA</div></div></div></div>`;
  document.body.appendChild(modal); 
  modal.onclick = () => modal.remove(); 
  document.getElementById("matchBox").onclick = e => e.stopPropagation();
  
  document.getElementById("matchGirone").onchange = function() {
    const girone = this.value, casa = document.getElementById("teamCasa"), trasferta = document.getElementById("teamTrasferta");
    casa.innerHTML = `<option value="">SQUADRA CASA</option>`; trasferta.innerHTML = `<option value="">SQUADRA TRASFERTA</option>`;
    if (!girone) return;
    const teams = (window.APP_CACHE.teams || []).filter(t => t.GIRONE === girone);
    teams.forEach(t => { 
      casa.innerHTML += `<option value="${Sanitizer.attr(t.TEAM_ID)}">${Sanitizer.html(t.NOME_SQUADRA)}</option>`; 
      trasferta.innerHTML += `<option value="${Sanitizer.attr(t.TEAM_ID)}">${Sanitizer.html(t.NOME_SQUADRA)}</option>`; 
    });
  };
}

async function saveMatch() {
  const girone = document.getElementById("matchGirone")?.value, casa = document.getElementById("teamCasa")?.value, trasferta = document.getElementById("teamTrasferta")?.value;
  const data = document.getElementById("matchDate")?.value, ora = document.getElementById("matchTime")?.value;
  if (!girone) { alert("Seleziona girone"); return; }
  if (!casa || !trasferta) { alert("Seleziona le squadre"); return; }
  if (casa === trasferta) { alert("Le squadre devono essere diverse"); return; }
  try { 
    await ApiClient.createMatchGirone(girone, casa, trasferta, data, ora); 
    document.querySelector(".modalOverlay")?.remove(); 
    showMatches(); 
  } catch (e) { alert("Errore: " + (e?.message || e)); }
}

// ============================================================================
// 🎮 MATCH DETAIL
// ============================================================================

function setCurrentMatch(id) { window.APP_STATE.currentMatchId = id; }
function getCurrentMatch() { return window.APP_STATE.matchesById[window.APP_STATE.currentMatchId]; }

function openMatch(id) {
  const myNonce = ++window.APP_STATE._matchRequestNonce;
  setCurrentMatch(id); 
  const cached = window.APP_STATE.matchesById[id] || (window.APP_CACHE.matches?.find(m=>m.MATCH_ID===id));
  
  if (cached) {
    renderMatchPage(cached); 
    updateMatchUI(cached);
  }
  
  ApiClient.getMatchFull(id).then(res => {
    if (myNonce !== window.APP_STATE._matchRequestNonce) return;
    if (!res?.match || res.match.MATCH_ID != window.APP_STATE.currentMatchId) return;
    
    const match = { ...res.match };
    updateMatchUI(match);
    const score = document.querySelector(".score-big"); if (score) score.textContent = `${match.GOL_CASA||0} - ${match.GOL_TRASFERTA||0}`;
    window.APP_STATE.lastMatch = match;
  }).catch(console.error);
}

function renderMatchPage(match) {
  // 🔥 LOGHI SQUADRE
  const logoCasa = match.LOGO_CASA 
    ? `<img src="${getCachedImage(match.LOGO_CASA, 120)}" alt="${match.SQUADRA_CASA}" onerror="this.style.display='none'">`
    : `<div style="width:70px;height:70px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:1.5rem">⚽</div>`;
  
  const logoTrasf = match.LOGO_TRASFERTA 
    ? `<img src="${getCachedImage(match.LOGO_TRASFERTA, 120)}" alt="${match.SQUADRA_TRASFERTA}" onerror="this.style.display='none'">`
    : `<div style="width:70px;height:70px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:1.5rem">⚽</div>`;
  
  // 🔥 STATI PARTITA
  const isLive = match.STATO_PARTITA === "LIVE";
  const isFinished = match.STATO_PARTITA === "FINITA";
  const isGroupStage = !match.FASE || match.FASE === "GIRONI";
  const finalStageStarted = window.APP_CACHE.meta?.finalStageStarted;
  
  // 🔥 TAB MVP
  let mvpTabHtml = "";
  if (isLive) {
    mvpTabHtml = `<div class="mt-btn" data-tab="mvp">VOTA MVP</div>`;
  } else if (isFinished) {
    mvpTabHtml = `<div class="mt-btn disabled" data-tab="mvp">🏆 MVP</div>`;
  } else {
    mvpTabHtml = `<div class="mt-btn disabled" data-tab="mvp">MVP</div>`;
  }
  
  // 🔥 PULSANTI EVENTI
  const canAddEvents = isLive && (match.FASE === "FINALI" || !finalStageStarted);
  const eventBtnDisabled = !canAddEvents ? "style=\"opacity:0.5;pointer-events:none;cursor:not-allowed\"" : "";
  
  // 🔥 PULSANTE INIZIA/CONCLUDI
  const canToggleMatch = match.FASE === "FINALI" || !finalStageStarted || !isFinished;
  const toggleBtnDisabled = !canToggleMatch ? "style=\"opacity:0.5;pointer-events:none;cursor:not-allowed\"" : "";
  
  document.getElementById("app").innerHTML = `
    <div class="match-page">
      <div class="match-header-big">
        <div class="team-big left">
          ${logoCasa}
          <div class="team-big-name">${(match.SQUADRA_CASA || "").toUpperCase()}</div>
        </div>
        <div class="match-center">
          <div class="match-controls-top">
            <div class="phase-btn start-btn ${isLive ? "active" : ""}" 
                 onclick="${canToggleMatch ? "toggleMatch()" : ""}"
                 ${toggleBtnDisabled}>
              ${isLive ? "CONCLUDI" : "INIZIA"}
            </div>
          </div>
          <div class="score-big">${match.GOL_CASA || 0} - ${match.GOL_TRASFERTA || 0}</div>
          <div class="match-status" id="matchStatus"></div>
        </div>
        <div class="team-big right">
          <div class="team-big-name">${(match.SQUADRA_TRASFERTA || "").toUpperCase()}</div>
          ${logoTrasf}
        </div>
      </div>
      
      <div class="match-toolbar">
        <div class="mt-btn active" data-tab="diretta">DIRETTA</div>
        <div class="mt-btn" data-tab="giocatori">GIOCATORI</div>
        ${mvpTabHtml}
      </div>
      
      <div class="match-content">
        
        <!-- 🔹 TAB DIRETTA -->
        <div class="tab-content active" id="tab-diretta">
          <div class="teams-events">
            
            <!-- Pulsanti Evento -->
            <div class="events-actions">
              <div class="left">
                <div class="phase-btn small" onclick="${canAddEvents ? "addEvent('casa')" : ""}" ${eventBtnDisabled}>
                  + EVENTO CASA
                </div>
              </div>
              <div class="right">
                <div class="phase-btn small" onclick="${canAddEvents ? "addEvent('trasferta')" : ""}" ${eventBtnDisabled}>
                  + EVENTO TRASFERTA
                </div>
              </div>
            </div>
            
            <!-- Titolo Cronaca -->
            <div class="cronaca-title center"><span>CRONACA</span></div>

            <!-- 🔥 MVP BANNER (Sotto la cronaca, prima degli eventi) -->
            <div id="mvpBanner" class="mvp-banner">
              <div class="mvp-title">🏆 MVP DEL MATCH</div>
              <div class="mvp-name"></div>
            </div>

            <!-- Lista Eventi -->
            <div id="eventsTimeline" class="events-timeline">
              <div id="eventsContent"></div>
            </div>
            
          </div>
        </div>
        
        <!-- 🔹 TAB GIOCATORI -->
        <div class="tab-content" id="tab-giocatori">
          <div class="players-columns" id="playersColumns">
            <div style="text-align:center;padding:40px;color:#888;grid-column:1/-1">
              Caricamento giocatori...
            </div>
          </div>
        </div>
        
        <!-- 🔹 TAB MVP -->
        <div class="tab-content" id="tab-mvp">
          <div class="players-columns" id="mvpColumns">
            <div style="text-align:center;padding:40px;color:#888;grid-column:1/-1">
              ${isLive ? "Vota il MVP della partita" : isFinished ? "MVP della partita" : "Disponibile durante la partita"}
            </div>
          </div>
        </div>
        
        <div class="back-btn-wrapper">
          <div class="phase-btn secondary" onclick="showMatches()">INDIETRO</div>
        </div>
      </div>
    </div>
  `;
  
  // Aggiorna UI stato
  updateMatchUI(match);
  
  // Carica eventi
  const events = window.APP_CACHE.events?.filter(e => e.MATCH_ID === match.MATCH_ID) || [];
  renderEvents(events, match);
  
  // Carica giocatori (async)
  loadPlayersForMatch(match);
  
  // MVP banner se finita
  if (isFinished) {
    updateMVPBanner(match);
  }
  
  window.APP_STATE.lastMatch = match;
}

function renderEvents(events, match) {
  const container = document.getElementById("eventsContent");
  if (!container) return;
  
  if (!events?.length) {
    container.innerHTML = `
      <div class="empty-events-grid">
        <div class="empty-team-events">
          <div class="empty-events-text">Nessun evento</div>
          <div class="empty-events-icon">📋</div>
        </div>
        <div class="empty-team-events">
          <div class="empty-events-text">Nessun evento</div>
          <div class="empty-events-icon">📋</div>
        </div>
      </div>
    `;
    return;
  }
  
  // Ordina per minuto
  events = [...events].sort((a, b) => (a.MINUTO || 0) - (b.MINUTO || 0));
  
  let html = "";
  
  events.forEach(e => {
    const isCasa = String(e.TEAM_ID) === String(match.CASA_ID);
    const icon = e.TIPO === "GOAL" ? "⚽" : e.TIPO === "AMMONIZIONE" ? "🟨" : "🟥";
    
    html += `
      <div class="event-line ${isCasa ? "left" : "right"}">
        <div class="event-content">
          <span class="event-minute">${e.MINUTO}'</span>
          <span class="event-icon">${icon}</span>
          <span class="event-player">
            ${(e.PLAYER || "").toUpperCase()}
            ${e.ASSIST ? `<span class="assist">(${(e.ASSIST).toUpperCase()})</span>` : ""}
          </span>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function updateMatchUI(match) {
  const statusEl = document.getElementById("matchStatus"), btn = document.querySelector(".start-btn");
  if (!statusEl || !btn) return;
  if (match.STATO_PARTITA === "LIVE") { 
    statusEl.innerHTML = "LIVE"; statusEl.classList.add("live"); 
    btn.textContent = "CONCLUDI"; btn.classList.add("active"); 
  } else if (match.STATO_PARTITA === "FINITA") { 
    statusEl.textContent = "TERMINATA"; statusEl.classList.remove("live"); 
    btn.textContent = "INIZIO"; btn.classList.remove("active"); 
  } else { 
    statusEl.textContent = ""; 
    btn.textContent = "INIZIO"; 
  }
}

function updateMVPBanner(match) {
  const mvpBox = document.getElementById("mvpBanner");
  if (!mvpBox) return;
  
  const isFinished = match.STATO_PARTITA === "FINITA";
  const mvpName = match.MVP;
  
  if (isFinished && mvpName) {
    mvpBox.innerHTML = `
      <div class="mvp-title">🏆 MVP DEL MATCH</div>
      <div class="mvp-name">${mvpName.toUpperCase()}</div>
    `;
    mvpBox.classList.add("show");
    mvpBox.style.display = "flex";  // ← FORZA visualizzazione
  } else {
    mvpBox.innerHTML = "";
    mvpBox.classList.remove("show");
    mvpBox.style.display = "none";
  }
}

function addEvent(team) {
  const match = window.APP_STATE.lastMatch;
  
  // 🔥 Controllo stato partita
  if (!match) {
    alert("Partita non caricata");
    return;
  }
  
  if (match.STATO_PARTITA !== "LIVE") {
    alert("La partita non è in corso - gli eventi possono essere aggiunti solo durante il LIVE");
    return;
  }
  
  // 🔥 Controllo fase finale (blocca modifiche ai gironi)
  if (match.FASE === "GIRONI" && window.APP_CACHE.meta?.finalStageStarted) {
    alert("Impossibile modificare eventi: la fase finale è già iniziata");
    return;
  }
  
  // 🔥 Apri popup evento
  openEventPopup(team);
}

// 🔥 Funzione helper per il popup evento
function openEventPopup(team) {
  const match = window.APP_STATE.lastMatch;
  const teamId = team === "casa" ? match.CASA_ID : match.TRASFERTA_ID;
  
  const modal = document.createElement("div");
  modal.className = "modalOverlay";
  modal.innerHTML = `
    <div class="modalBox" id="eventBox">
      <div class="modalTitle">NUOVO EVENTO - ${(team === "casa" ? match.SQUADRA_CASA : match.SQUADRA_TRASFERTA)?.toUpperCase()}</div>
      <div class="match-form">
        <select id="eventType" class="match-select">
          <option value="GOAL">⚽ Gol</option>
          <option value="AMMONIZIONE">🟨 Ammonizione</option>
          <option value="ESPULSIONE">🟥 Espulsione</option>
        </select>
        <input id="eventMinute" class="match-input" type="number" placeholder="Minuto" min="1" max="120">
        <select id="eventPlayer" class="match-select"><option value="">Seleziona giocatore</option></select>
        <select id="eventAssist" class="match-select"><option value="">Assist (opzionale)</option></select>
        <div class="modalActions">
          <div class="phase-btn" onclick="saveEvent('${team}')">SALVA</div>
          <div class="phase-btn secondary" onclick="this.closest('.modalOverlay').remove()">ANNULLA</div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.getElementById("eventBox").onclick = (e) => e.stopPropagation();
  
  // Carica giocatori della squadra
  ApiClient.getPlayersByTeam(teamId)
    .then(players => populateEventSelects(players))
    .catch(err => console.error('Error loading players:', err));
}

function populateEventSelects(players) {
  const playerSelect = document.getElementById("eventPlayer");
  const assistSelect = document.getElementById("eventAssist");
  if (!playerSelect || !assistSelect) return;
  
  let playerOpts = `<option value="">Seleziona giocatore</option>`;
  let assistOpts = `<option value="">Nessun assist</option>`;
  
  (players || []).forEach(p => {
    const name = (p.NOME || "").toUpperCase();
    playerOpts += `<option value="${p.PLAYER_ID}">${name}</option>`;
    assistOpts += `<option value="${p.PLAYER_ID}">${name}</option>`;
  });
  
  playerSelect.innerHTML = playerOpts;
  assistSelect.innerHTML = assistOpts;
}

async function saveEvent(team) {
  const match = window.APP_STATE.lastMatch;
  if (!match) return;
  
  const type = document.getElementById("eventType")?.value;
  const minute = parseInt(document.getElementById("eventMinute")?.value);
  const playerId = document.getElementById("eventPlayer")?.value;
  const assistId = document.getElementById("eventAssist")?.value || "";
  
  // Validazioni
  if (!type || !minute || minute < 1 || !playerId) {
    alert("Compila tutti i campi obbligatori");
    return;
  }
  
  try {
    // Chiama backend
    await ApiClient.addEventAdmin(match.MATCH_ID, team === "casa" ? match.CASA_ID : match.TRASFERTA_ID, type, minute, playerId, assistId);
    
    // Chiudi popup
    document.querySelector(".modalOverlay")?.remove();
    
    // Ricarica eventi e UI
    const events = await ApiClient.getEventsAdmin(match.MATCH_ID);
    window.APP_CACHE.eventsByMatch = window.APP_CACHE.eventsByMatch || {};
    window.APP_CACHE.eventsByMatch[match.MATCH_ID] = events;
    CacheManager.save(window.APP_CACHE);
    
    renderEvents(events, match);
    renderPlayersTab(
      window.APP_CACHE.fullTeams?.[match.CASA_ID],
      window.APP_CACHE.fullTeams?.[match.TRASFERTA_ID],
      match
    );
    
    // Aggiorna standings in background
    refreshStandingsDebounced(1000);
    
  } catch (error) {
    console.error('Error saving event:', error);
    alert('Errore salvataggio evento: ' + error.message);
  }
}

async function toggleMatch() {
  const match = window.APP_STATE.lastMatch;
  if (!match) return;
  
  const newStatus = match.STATO_PARTITA === "LIVE" ? "FINITA" : "LIVE";
  const oldStatus = match.STATO_PARTITA;
  
  // 🔥 1. Aggiorna UI SUBITO (ottimistico)
  match.STATO_PARTITA = newStatus;
  window.APP_STATE.lastMatch = match;
  updateMatchUI(match);
  
  // Feedback visivo immediato
  const btn = document.querySelector(".start-btn");
  if (btn) {
    btn.textContent = newStatus === "LIVE" ? "CONCLUDI" : "INIZIO";
    btn.classList.toggle("active", newStatus === "LIVE");
  }
  
  try {
    // 🔥 2. Chiama backend (senza bloccare UI)
    await ApiClient.updateMatchStatus(match.MATCH_ID, newStatus);
    
    // 🔥 3. Se CONCLUDE, avvia calcolo MVP in background
    if (newStatus === "FINITA") {
      // Non aspettare il risultato, lancia e dimentica
      ApiClient.finalizeMVP(match.MATCH_ID)
        .then(() => console.log('✅ MVP finalizzato'))
        .catch(err => console.log('ℹ️ Nessun voto MVP o errore:', err.message));
      
      // Aggiorna cache locale
      if (window.APP_CACHE.matches) {
        const idx = window.APP_CACHE.matches.findIndex(m => m.MATCH_ID === match.MATCH_ID);
        if (idx >= 0) {
          window.APP_CACHE.matches[idx].STATO_PARTITA = "FINITA";
          CacheManager.save(window.APP_CACHE);
        }
      }
      
      // Ricarica dati partita per MVP (async, non blocca)
      ApiClient.getMatchFull(match.MATCH_ID)
        .then(updated => {
          if (updated?.match?.MVP) {
            match.MVP = updated.match.MVP;
            window.APP_STATE.lastMatch = match;
            updateMVPBanner(match);
            renderMVPTab(
              window.APP_CACHE.fullTeams?.[match.CASA_ID],
              window.APP_CACHE.fullTeams?.[match.TRASFERTA_ID],
              match
            );
          }
        })
        .catch(() => {}); // Silenzioso se fallisce
    }
    
    // Aggiorna standings in background
    refreshStandingsDebounced(500);
    
  } catch (error) {
    console.error('Error toggling match:', error);
    
    // 🔥 Rollback UI se fallisce
    match.STATO_PARTITA = oldStatus;
    window.APP_STATE.lastMatch = match;
    updateMatchUI(match);
    
    alert('Errore aggiornamento stato: ' + error.message);
  }
}

function loadPlayersForMatch(match) {
  const casaId = match?.CASA_ID;
  const trasfId = match?.TRASFERTA_ID;
  
  // Ottieni giocatori da cache o backend
  const casaData = window.APP_CACHE.fullTeams?.[casaId];
  const trasfData = window.APP_CACHE.fullTeams?.[trasfId];
  
  if (casaData && trasfData) {
    renderPlayersTab(casaData, trasfData, match);
    renderMVPTab(casaData, trasfData, match);
    return;
  }
  
  // Carica dal backend se non in cache
  Promise.all([
    ApiClient.getTeamFull(casaId).catch(() => null),
    ApiClient.getTeamFull(trasfId).catch(() => null)
  ])
  .then(([casaRes, trasfRes]) => {
    if (casaRes) {
      if (!window.APP_CACHE.fullTeams) window.APP_CACHE.fullTeams = {};
      window.APP_CACHE.fullTeams[casaId] = casaRes;
    }
    if (trasfRes) {
      if (!window.APP_CACHE.fullTeams) window.APP_CACHE.fullTeams = {};
      window.APP_CACHE.fullTeams[trasfId] = trasfRes;
    }
    
    renderPlayersTab(casaRes, trasfRes, match);
    renderMVPTab(casaRes, trasfRes, match);
  })
  .catch(err => console.error('Error loading players:', err));
}

function renderPlayersTab(casaData, trasfData, match) {
  const container = document.getElementById("playersColumns");
  if (!container) return;
  
  const casaPlayers = casaData?.players || [];
  const trasfPlayers = trasfData?.players || [];
  const isFinished = match.STATO_PARTITA === "FINITA";
  const mvpName = match.MVP;
  
  // Ottieni eventi per badge
  const events = window.APP_CACHE.events?.filter(e => e.MATCH_ID === match.MATCH_ID) || [];
  const eventMap = {};
  events.forEach(e => {
    if (e.PLAYER_ID) {
      if (!eventMap[e.PLAYER_ID]) eventMap[e.PLAYER_ID] = [];
      eventMap[e.PLAYER_ID].push(e.TIPO);
    }
  });
  
  const renderPlayerList = (players, teamName) => {
    if (!players.length) return `<div style="text-align:center;padding:20px;color:#888">Nessun giocatore</div>`;
    
    let html = "<div class='players-list'>";
    players.forEach(p => {
      const playerEvents = eventMap[p.PLAYER_ID] || [];
      const badges = playerEvents.map(t => 
        t === "GOAL" ? "⚽" : t === "AMMONIZIONE" ? "🟨" : "🟥"
      ).join(" ");
      
      // 🔥 MVP WINNER: coroncina + bordo oro
      const isMVP = isFinished && p.NOME === mvpName;
      const mvpClass = isMVP ? "mvp-player-row" : "";
      const crownHtml = isMVP ? '<div class="mvp-crown">👑</div>' : '';
      
      const photoHtml = p.FOTO_ID 
        ? `<img src="${getCachedImage(p.FOTO_ID, 40)}" alt="${p.NOME}" class="${isMVP ? 'mvp-player-photo' : ''}" onerror="this.style.display='none'">`
        : `<div class="player-avatar-fallback ${isMVP ? 'mvp-player-avatar' : ''}">👤</div>`;
      
      html += `
        <div class="player-row ${mvpClass}">
          <div class="player-avatar ${isMVP ? 'mvp-player-avatar-wrapper' : ''}">
            ${photoHtml}
            ${crownHtml}
          </div>
          <div class="player-name">
            ${(p.NOME || "").toUpperCase()}
            ${badges ? `<span class="player-badges">${badges}</span>` : ""}
          </div>
        </div>
      `;
    });
    html += "</div>";
    return html;
  };
  
  container.innerHTML = `
    <div class="players-col">
      <div class="players-team">${(casaData?.team?.NOME_SQUADRA || match.SQUADRA_CASA || "").toUpperCase()}</div>
      ${renderPlayerList(casaPlayers, match.SQUADRA_CASA)}
    </div>
    <div class="players-col">
      <div class="players-team">${(trasfData?.team?.NOME_SQUADRA || match.SQUADRA_TRASFERTA || "").toUpperCase()}</div>
      ${renderPlayerList(trasfPlayers, match.SQUADRA_TRASFERTA)}
    </div>
  `;
}

function renderMVPTab(casaData, trasfData, match) {
  const container = document.getElementById("mvpColumns");
  if (!container) return;
  
  const casaPlayers = casaData?.players || [];
  const trasfPlayers = trasfData?.players || [];
  const isLive = match.STATO_PARTITA === "LIVE";
  const isFinished = match.STATO_PARTITA === "FINITA";
  const currentMVP = match.MVP;
  
  // 🔥 SE NON È LIVE O FINITA, MOSTRA MESSAGGIO
  if (!isLive && !isFinished) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#888;grid-column:1/-1">
        <div style="font-size:3rem;margin-bottom:16px">🎫</div>
        <div>La votazione MVP sarà disponibile durante la partita</div>
      </div>
    `;
    return;
  }
  
  // 🔥 SE È FINITA, MOSTRA MVP VINCITORE
  if (isFinished && currentMVP) {
    const renderMVPWinner = (players, teamName) => {
      const mvpPlayer = players.find(p => p.NOME === currentMVP);
      if (!mvpPlayer) return "";
      
      const photoHtml = mvpPlayer.FOTO_ID 
        ? `<img src="${getCachedImage(mvpPlayer.FOTO_ID, 80)}" alt="${mvpPlayer.NOME}" class="mvp-winner-photo">`
        : `<div class="player-avatar-fallback mvp-winner-avatar">👑</div>`;
      
      return `
        <div class="mvp-winner-card">
          <div class="mvp-winner-badge">🏆 MVP DEL MATCH</div>
          ${photoHtml}
          <div class="mvp-winner-name">${(mvpPlayer.NOME || "").toUpperCase()}</div>
          <div class="mvp-winner-team">${(teamName || "").toUpperCase()}</div>
        </div>
      `;
    };
    
    container.innerHTML = `
      <div class="players-col">
        <div class="players-team">${(casaData?.team?.NOME_SQUADRA || match.SQUADRA_CASA || "").toUpperCase()}</div>
        ${renderMVPWinner(casaPlayers, match.SQUADRA_CASA)}
      </div>
      <div class="players-col">
        <div class="players-team">${(trasfData?.team?.NOME_SQUADRA || match.SQUADRA_TRASFERTA || "").toUpperCase()}</div>
        ${renderMVPWinner(trasfPlayers, match.SQUADRA_TRASFERTA)}
      </div>
    `;
    return;
  }
  
  // 🔥 SE È LIVE, MOSTRA SELEZIONE PER VOTARE
  const renderMVPVoteList = (players) => {
    if (!players.length) return `<div style="text-align:center;padding:20px;color:#888">Nessun giocatore</div>`;
    
    let html = "<div class='players-list'>";
    players.forEach(p => {
      const photoHtml = p.FOTO_ID 
        ? `<img src="${getCachedImage(p.FOTO_ID, 40)}" alt="${p.NOME}">`
        : `<div class="player-avatar-fallback">👤</div>`;
      
      html += `
        <div class="player-row mvp-vote-row" 
             onclick="voteMVP('${p.PLAYER_ID}', '${p.NOME.replace(/'/g, "\\'")}')">
          <div class="player-avatar">${photoHtml}</div>
          <div class="player-name">${(p.NOME || "").toUpperCase()}</div>
          <div class="vote-check">✓</div>
        </div>
      `;
    });
    html += "</div>";
    return html;
  };
  
  container.innerHTML = `
    <div style="text-align:center;padding:16px;background:#fff5e6;border-radius:8px;margin-bottom:16px;grid-column:1/-1">
      <div style="font-size:1.2rem;font-weight:700;color:#d97706">🎫 VOTA IL MVP</div>
      <div style="font-size:.9rem;color:#92400e;margin-top:4px">Clicca sul giocatore per votare</div>
    </div>
    <div class="players-col">
      <div class="players-team">${(casaData?.team?.NOME_SQUADRA || match.SQUADRA_CASA || "").toUpperCase()}</div>
      ${renderMVPVoteList(casaPlayers)}
    </div>
    <div class="players-col">
      <div class="players-team">${(trasfData?.team?.NOME_SQUADRA || match.SQUADRA_TRASFERTA || "").toUpperCase()}</div>
      ${renderMVPVoteList(trasfPlayers)}
    </div>
  `;
}

async function selectMVP(playerId, playerName) {
  const match = window.APP_STATE.lastMatch;
  if (!match) return;
  
  try {
    await ApiClient.saveMVPFinal(match.MATCH_ID, playerId);
    
    // Aggiorna MVP in cache
    match.MVP = playerName;
    window.APP_STATE.lastMatch = match;
    
    // Aggiorna UI
    updateMVPBanner(match);
    renderMVPTab(
      window.APP_CACHE.fullTeams?.[match.CASA_ID],
      window.APP_CACHE.fullTeams?.[match.TRASFERTA_ID],
      match
    );
    
    console.log('✅ MVP salvato:', playerName);
  } catch (error) {
    console.error('Error saving MVP:', error);
    alert('Errore salvataggio MVP: ' + error.message);
  }
}

// 🔥 VOTAZIONE MVP (durante la partita)
async function voteMVP(playerId, playerName) {
  const match = window.APP_STATE.lastMatch;
  if (!match || match.STATO_PARTITA !== "LIVE") {
    alert("La votazione è disponibile solo durante la partita");
    return;
  }
  
  try {
    // Salva voto (backend dovrà gestire i voti multipli utenti)
    await ApiClient.saveMVPVote(match.MATCH_ID, playerId);
    
    // Feedback visivo
    alert(`✅ Hai votato ${playerName} come MVP!`);
    
    // Evidenzia selezione (opzionale)
    document.querySelectorAll('.mvp-vote-row').forEach(row => {
      row.style.background = '';
      row.querySelector('.vote-check').style.opacity = '0';
    });
    event.currentTarget.style.background = '#fef3c7';
    event.currentTarget.querySelector('.vote-check').style.opacity = '1';
    
  } catch (error) {
    console.error('Error voting MVP:', error);
    alert('Errore votazione: ' + error.message);
  }
}

// ============================================================================
// 📊 STANDINGS
// ============================================================================

let standingsRefreshTimer = null;

function refreshStandingsDebounced(delay = 1200) {
  clearTimeout(standingsRefreshTimer);
  standingsRefreshTimer = setTimeout(() => {
    ApiClient.getStandings().then(data => {
      if (data) { window.APP_CACHE.standings = data; CacheManager.save(window.APP_CACHE); }
      if (document.querySelector(".standings-page")) renderStandings(data || window.APP_CACHE.standings);
    }).catch(console.error);
  }, delay);
}

function stopStandingsLiveRefresh() {
  window.APP_STATE._standingsActive = false;
  if (window.APP_STATE._standingsInterval) {
    clearInterval(window.APP_STATE._standingsInterval);
    window.APP_STATE._standingsInterval = null;
  }
}

function startStandingsLiveRefresh() {
  if (window.APP_STATE._standingsActive) return;
  window.APP_STATE._standingsActive = true;
  
  if (window.APP_STATE._standingsInterval) clearInterval(window.APP_STATE._standingsInterval);
  
  window.APP_STATE._standingsInterval = setInterval(() => {
    const page = document.querySelector(".standings-page"); 
    if (!page) { stopStandingsLiveRefresh(); return; }
    if (document.hidden) return;
    
    ApiClient.getStandings().then(data => { 
      if (data) { window.APP_CACHE.standings = data; CacheManager.save(window.APP_CACHE); }
      if (window.APP_STATE._activeStandingsTab === "gironi") renderStandings(data);
    }).catch(console.error);
  }, 5000);
}

function showStandings() {
  renderToolbar("standings"); 
  window.APP_STATE._activeStandingsTab = "gironi"; 
  window.APP_STATE._finalStageLoaded = false;
  
  document.getElementById("app").innerHTML = `
    <div class="page-container standings-page"><div class="page-title">CLASSIFICHE</div>
    <div class="standings-tabs">
      <div class="standings-tab active" data-tab="gironi">GIRONI</div>
      <div class="standings-tab" data-tab="fasefinale">FASE FINALE</div>
    </div><div id="standingsContent"></div></div>`;
  
  renderStandings(window.APP_CACHE.standings || {});
  ApiClient.getStandings().then(data => { 
    if (data) { window.APP_CACHE.standings = data; CacheManager.save(window.APP_CACHE); }
    if (window.APP_STATE._activeStandingsTab==="gironi") renderStandings(data); 
  }).catch(console.error);
  
  document.querySelectorAll(".standings-tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".standings-tab").forEach(t => t.classList.remove("active")); 
      tab.classList.add("active");
      const type = tab.dataset.tab; window.APP_STATE._activeStandingsTab = type;
      if (type === "gironi") renderStandings(window.APP_CACHE.standings || {});
      if (type === "fasefinale") {
        if (!window.APP_STATE._finalStageLoaded) { loadFinalStage(); window.APP_STATE._finalStageLoaded = true; }
        else renderFinalStage(window.APP_CACHE.finalStage || []);
      }
    };
  });
  
  startStandingsLiveRefresh();
}

function renderStandings(data) {
  const container = document.getElementById("standingsContent"); if (!container) return;
  const A = data?.A || [], B = data?.B || [];
  let html = renderGironeTable("GIRONE A", A) + renderGironeTable("GIRONE B", B);
  container.innerHTML = html;
}

function renderGironeTable(title, teams) {
  let html = `<div class="girone-block"><div class="girone-title">${Sanitizer.html(title)}</div><table class="standings-table"><thead><tr>
    <th></th><th class="team-col">SQUADRA</th><th>PT</th><th>PG</th><th>V</th><th>P</th><th>S</th><th>GF</th><th>GS</th><th>DR</th></tr></thead><tbody>`;
  
  (teams||[]).forEach((t, idx) => {
    // 🔥 LOGO SQUADRA
    const logoHtml = t.logo 
      ? `<img src="${getCachedImage(t.logo, 48)}" class="standings-logo" alt="${t.nome}" onerror="this.style.display='none'">`
      : `<div style="font-size:1.2rem">⚽</div>`;
    
    html += `<tr class="${idx<2?"qualified":""} ${t.live?"live-team-row":""}">
      <td class="pos-col">${idx+1}</td><td class="team-col">
        <div class="standings-team" onclick="openTeamEditor('${Sanitizer.attr(t.id)}')">
          <div class="standings-logo-wrap">${logoHtml}</div>
          <div class="standings-team-name ${t.live?"live-team-name":""}">${Sanitizer.html(t.nome)}</div>
          ${t.live?`<div class="live-dot"></div>`:""}
        </div></td>
      <td class="pts ${t.live?"live-pts":""}">${t.pt}</td><td>${t.pg}</td><td>${t.v}</td><td>${t.p}</td><td>${t.s}</td><td>${t.gf}</td><td>${t.gs}</td><td>${t.dr}</td></tr>`;
  });
  
  html += `</tbody></table></div>`; 
  return html;
}

function loadFinalStage() {
  const cached = window.APP_CACHE.finalStage || []; 
  renderFinalStage(cached);
  ApiClient.getFinalStageMatches().then(data => {
    window.APP_CACHE.finalStage = data || []; CacheManager.save(window.APP_CACHE);
    if (window.APP_STATE._activeStandingsTab === "fasefinale") renderFinalStage(data);
  }).catch(() => {});
}

function renderFinalStage(data) {
  const container = document.getElementById("standingsContent"); if (!container) return;
  if (!data?.length) {
    container.innerHTML = `<div class="final-empty"><div class="final-empty-icon">🏆</div><div class="final-empty-title">FASE FINALE</div><div class="final-empty-line"></div>
      <div class="final-empty-text">Crea la fase finale per visualizzare il tabellone del torneo.</div>
      <div class="phase-btn" onclick="createFinalStage()">CREA FASE FINALE</div></div>`; return;
  }
  container.innerHTML = `<div class="final-stage-page"><div id="finalBracketContainer"></div></div>`;
  renderFinalBracket(data);
}

function renderFinalBracket(matches) {
  const container = document.getElementById("finalBracketContainer");
  if (!container) return;
  
  // 🔥 Crea mappa matchKey → match per accesso rapido
  const matchMap = {};
  (matches || []).forEach(m => {
    if (m.matchKey) {
      matchMap[m.matchKey] = m;
    }
  });
  
  container.innerHTML = `<div class="tournament-wrapper">
    <!-- Quarti -->
    ${renderBracketMatch(matchMap["Q1"], "qf1")}
    ${renderBracketMatch(matchMap["Q2"], "qf2")}
    ${renderBracketMatch(matchMap["Q3"], "qf3")}
    ${renderBracketMatch(matchMap["Q4"], "qf4")}
    
    <!-- Semi e Finali (placeholder finché non giocate) -->
    ${renderPlaceholderCard("SF1", "sf1")}
    ${renderPlaceholderCard("SF2", "sf2")}
    ${renderPlaceholderCard("FINALE 1°-2°", "final-match")}
    ${renderPlaceholderCard("FINALE 3°-4°", "third-place")}
  </div>`;
}

function renderPlaceholderCard(label, cls="") { return `<div class="bracket-placeholder ${cls}"><div class="bracket-placeholder-title">${Sanitizer.html(label)}</div></div>`; }
function renderBracketMatch(match, cls="") {
  // Se non c'è la partita, mostra placeholder
  if (!match || !match.casa?.nome) {
    return `<div class="bracket-match placeholder-match ${cls}"><div class="placeholder-center">TBD</div></div>`;
  }
  
  // Loghi squadre
  const logoCasa = match.casa?.logo 
    ? `<img src="${getCachedImage(match.casa.logo, 32)}" alt="${match.casa.nome}" onerror="this.style.display='none'">`
    : `<div style="width:32px;height:32px;border-radius:50%;background:#f0f0f0"></div>`;
  
  const logoTrasf = match.trasferta?.logo 
    ? `<img src="${getCachedImage(match.trasferta.logo, 32)}" alt="${match.trasferta.nome}" onerror="this.style.display='none'">`
    : `<div style="width:32px;height:32px;border-radius:50%;background:#f0f0f0"></div>`;
  
  // Punteggio o stato
  const isLive = match.stato === "LIVE";
  const isFinished = match.stato === "FINITA";
  
  let scoreHtml = "";
  if (isLive || isFinished) {
    scoreHtml = `<span class="bracket-score">${match.golCasa||0} - ${match.golTrasferta||0}</span>`;
  } else if (match.ora) {
    scoreHtml = `<span style="font-size:11px;color:#888">${match.ora}</span>`;
  }
  
  // Indicatore LIVE
  const liveDot = isLive ? '<span style="color:#dc2626;font-size:10px;margin-left:4px">●</span>' : '';
  
  return `
    <div class="bracket-match ${cls}" onclick="openMatch('${match.matchId}')">
      <div class="bracket-team">
        ${logoCasa}
        <span>${(match.casa?.nome || "TBD").toUpperCase()}</span>
        ${liveDot}
      </div>
      <div class="bracket-team">
        ${logoTrasf}
        <span>${(match.trasferta?.nome || "TBD").toUpperCase()}</span>
        ${scoreHtml}
      </div>
    </div>
  `;
}

function createFinalStage() {
  if (!confirm("Confermi il passaggio alla FASE FINALE?")) return;
  alert("Demo: fase finale creata! (backend non configurato)");
}

// ============================================================================
// ⚙️ UTILS & BOOT
// ============================================================================

function bootAdminApp() {
  console.log("🚀 Booting Torneo Admin - PRODUCTION MODE");
  
  window.APP_CACHE = CacheManager.load();
  const loader = document.getElementById("startupLoader");
  
  // Mostra subito UI
  showHome();
  renderToolbar("home");
  
  // 🔥 TIMEOUT MASSIMO 3 secondi (anche se i dati non sono pronti)
  let dataLoaded = false;
  const maxTimeout = setTimeout(() => {
    if (!dataLoaded) {
      console.warn('⏱️ Timeout caricamento dati - mostro UI comunque');
      hideLoader();
    }
  }, 3000);
  
  function hideLoader() {
    clearTimeout(maxTimeout);
    loader?.classList?.add("hide");
    setTimeout(() => loader?.remove(), 300);
  }
  
  // Carica dati
  ApiClient.getInitialData()
    .then(data => {
      dataLoaded = true;
      clearTimeout(maxTimeout);
      
      console.log('✅ Dati caricati:', data);
      
      if (data) {
        window.APP_CACHE = {
          ...window.APP_CACHE,
          teams: data.teams || window.APP_CACHE.teams,
          matches: data.matches || window.APP_CACHE.matches,
          standings: data.standings || window.APP_CACHE.standings,
          events: data.events || window.APP_CACHE.events,
          fullTeams: data.fullTeams || window.APP_CACHE.fullTeams,
          playersMap: data.playersMap || window.APP_CACHE.playersMap,
          meta: { ...window.APP_CACHE.meta, initialized: true }
        };
        
        hydrateMatches(window.APP_CACHE.matches || []); 
        CacheManager.save(window.APP_CACHE);
        
        const currentPath = window.location.hash || "#home";
        if (currentPath.includes("matches")) renderMatches();
        else if (currentPath.includes("teams")) renderTeams();
        else if (currentPath.includes("standings")) renderStandings(window.APP_CACHE.standings || {});
      }
      
      // Nascondi loader
      hideLoader();
      
      // Carica flag fase finale (background, non blocca)
      ApiClient.isFinalStageStarted()
        .then(started => {
          if (!window.APP_CACHE.meta) window.APP_CACHE.meta = {};
          window.APP_CACHE.meta.finalStageStarted = started;
        })
        .catch(() => {});
    })
    .catch(error => {
      console.error('❌ Errore caricamento:', error);
      dataLoaded = true;
      hideLoader(); // Nascondi loader anche in errore
    });
  
  window.addEventListener("error", e => console.error("Global error:", e.error||e.message));
  window.addEventListener("beforeunload", () => { 
    Cleanup.releaseAll(); 
    CacheManager.save(window.APP_CACHE, 0); 
  });
  
  console.log("✅ App booted");
}

function preloadAssets() {
  ApiClient.getInitialData().then(data => {
    if (data) {
      Object.assign(window.APP_CACHE, { ...CacheManager.createEmpty(), ...(data||{}) });
      hydrateMatches(window.APP_CACHE.matches || []); 
      CacheManager.save(window.APP_CACHE);
      window.APP_CACHE.meta.initialized = true;
    }
  }).catch(console.error);
}

function renderAppFromCache() {
  renderToolbar("home");
  const path = window.location.hash || "#home";
  if (path.includes("matches")) showMatches();
  else if (path.includes("teams")) showTeams();
  else if (path.includes("standings")) showStandings();
}

// ============================================================================
// 🎯 GLOBAL EVENT LISTENERS
// ============================================================================

document.addEventListener("click", function(e) {
  if (e.target.classList.contains("mt-btn")) {
    if (e.target.classList.contains("disabled")) return;
    const tab = e.target.dataset.tab;
    document.querySelectorAll(".mt-btn").forEach(b => b.classList.remove("active")); 
    e.target.classList.add("active");
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    document.getElementById("tab-" + tab)?.classList.add("active");
  }
});

// ============================================================================
// 🏁 START
// ============================================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAdminApp);
} else {
  bootAdminApp();
}

console.log("✅ ADMIN JS LOADED - GitHub + Apps Script Ready v2.2");
