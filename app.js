// ============================================================================
// 🔧 CONFIGURAZIONE - INSERISCI IL TUO BACKEND URL
// ============================================================================

const CONFIG = {
  // 🔥 SOSTITUISCI CON IL TUO URL APPS SCRIPT WEB APP

  BACKEND_URL: 'https://script.google.com/macros/s/AKfycby6JerASUdte7n2pidLVRFYogybiIGsIYi23RE8IDsd0b40xL5tqFRqTP_giKR3z4hJ/exec',
  
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
  getEventsAdmin: (matchId) => ApiClient.call('getEventsAdmin', matchId),
  saveMVPVote: (matchId, userId, playerId) => 
    ApiClient.call('saveMVPVote', [matchId, userId, playerId]),
  
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
  saveRigoriResults: (data) => ApiClient.call('saveRigoriResults', [data]),
  
  prepareFinalStage: () => ApiClient.call('prepareFinalStage'),
  createFinalStageMatches: (matches) => ApiClient.call('createFinalStageMatches', [matches]),
  getFinalStageMatches: () => ApiClient.call('getFinalStageMatches'),
  createSemiFinals: (dataSF1, oraSF1, dataSF2, oraSF2) => 
    ApiClient.call('createSemiFinals', [dataSF1, oraSF1, dataSF2, oraSF2]),
  createFinals: (dataFinale1, oraFinale1, dataFinale2, oraFinale2) => 
    ApiClient.call('createFinals', [dataFinale1, oraFinale1, dataFinale2, oraFinale2]),
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

function getNextMatchCard() {
  const matches = window.APP_CACHE.matches || [];
  const eventsByMatch = window.APP_CACHE.eventsByMatch || {};
  const now = new Date();
  const nowStr = formatLocalDate(now);
  
  // 🔥 1. Cerca partita LIVE/SUPP/RIGORI
  const liveMatch = matches.find(m => 
    m.STATO_PARTITA === "LIVE" || 
    m.STATO_PARTITA === "SUPP" || 
    m.STATO_PARTITA === "RIGORI"
  );
  
  if (liveMatch) {
    let matchWithScore = { ...liveMatch };
    
    const hasValidScore = (
      liveMatch.GOL_CASA !== undefined && 
      liveMatch.GOL_TRASFERTA !== undefined &&
      !isNaN(Number(liveMatch.GOL_CASA)) &&
      !isNaN(Number(liveMatch.GOL_TRASFERTA))
    );
    
    if (!hasValidScore) {
      const liveEvents = eventsByMatch[liveMatch.MATCH_ID] || [];
      matchWithScore = calculateMatchScore(liveMatch, liveEvents);
    }
    
    return renderHomeMatchCard(matchWithScore, liveMatch.STATO_PARTITA);
  }
  
  // 🔥 2. Cerca prossima partita programmata
  const todayMatches = matches
    .filter(m => {
      const matchDate = String(m.DATA || "").slice(0, 10);
      return matchDate >= nowStr && m.STATO_PARTITA !== "FINITA";
    })
    .sort((a, b) => {
      const dateA = String(a.DATA || "").slice(0, 10) + (a.ORA || "00:00");
      const dateB = String(b.DATA || "").slice(0, 10) + (b.ORA || "00:00");
      return dateA.localeCompare(dateB);
    });
    
  if (todayMatches.length > 0) {
    let nextMatch = { ...todayMatches[0] };
    
    const hasValidScore = (
      nextMatch.GOL_CASA !== undefined && 
      nextMatch.GOL_TRASFERTA !== undefined &&
      !isNaN(Number(nextMatch.GOL_CASA)) &&
      !isNaN(Number(nextMatch.GOL_TRASFERTA))
    );
    
    if (!hasValidScore) {
      const nextEvents = eventsByMatch[nextMatch.MATCH_ID] || [];
      nextMatch = calculateMatchScore(nextMatch, nextEvents);
    }
    
    return renderHomeMatchCard(nextMatch, false);
  }
  
  // 🔥 3. Placeholder
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

// 🔥 Helper: calcola punteggio dagli eventi
function calculateMatchScore(match, events) {
  const goals = events.filter(e => e.TIPO === 'GOAL');
  let golCasa = 0;
  let golTrasferta = 0;
  
  goals.forEach(g => {
    if (String(g.TEAM_ID) === String(match.CASA_ID)) {
      golCasa++;
    } else if (String(g.TEAM_ID) === String(match.TRASFERTA_ID)) {
      golTrasferta++;
    }
  });
  
  return {
    ...match,
    GOL_CASA: golCasa,
    GOL_TRASFERTA: golTrasferta
  };
}

// 🔥 Helper: calcola punteggio dagli eventi cached
function updateMatchScoreFromEvents(match, events) {
  const goals = events.filter(e => e.TIPO === 'GOAL');
  let golCasa = 0;
  let golTrasferta = 0;
  
  goals.forEach(g => {
    if (String(g.TEAM_ID) === String(match.CASA_ID)) {
      golCasa++;
    } else if (String(g.TEAM_ID) === String(match.TRASFERTA_ID)) {
      golTrasferta++;
    }
  });
  
  return {
    ...match,
    GOL_CASA: golCasa,
    GOL_TRASFERTA: golTrasferta
  };
}

function renderHomeMatchCard(match, isLive) {
  // 🔥 GESTISCI STATO: può essere booleano o stringa ("LIVE"/"SUPP"/"RIGORI")
  const statoDisplay = typeof isLive === 'string' ? isLive : (isLive ? "LIVE" : "");
  
  // 🔥 FIX: Includi anche RIGORI come stato attivo
  const isAttiva = (statoDisplay === "LIVE" || statoDisplay === "SUPP" || statoDisplay === "RIGORI");
  
  // Loghi
  const logoCasa = match.LOGO_CASA
    ? `<img src="${getCachedImage(match.LOGO_CASA, 34)}" alt="${match.SQUADRA_CASA}" onerror="this.style.display='none'">`
    : `<div class="home-team-logo">⚽</div>`;
  const logoTrasf = match.LOGO_TRASFERTA
    ? `<img src="${getCachedImage(match.LOGO_TRASFERTA, 34)}" alt="${match.SQUADRA_TRASFERTA}" onerror="this.style.display='none'">`
    : `<div class="home-team-logo">⚽</div>`;

  // Centro: LIVE/SUPP/RIGORI o Ora/Data
  let centerContent = "";
  if (isAttiva) {
    centerContent = `
    <div class="home-live-badge">
      <div class="home-score">${match.GOL_CASA || 0} - ${match.GOL_TRASFERTA || 0}</div>
      <div class="home-live-row">
        <div class="home-live-text">${statoDisplay}</div> <!-- Mostra LIVE, SUPP o RIGORI -->
        <div class="home-live-dot"></div>
      </div>
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
  <div class="home-next-match ${isAttiva ? 'live-card' : ''}" onclick="openMatch('${match.MATCH_ID}')">
    <!-- Squadra Casa (logo sinistra, nome dopo) -->
    <div class="home-team-block left">
      ${logoCasa}
      <span class="home-team">${(match.SQUADRA_CASA || "").toUpperCase()}</span>
    </div>
    
    <!-- Centro (Ora o LIVE/SUPP/RIGORI) -->
    <div class="home-match-center">
      ${centerContent}
    </div>
    
    <!-- Squadra Trasferta (nome prima, logo destra all'estremo) -->
    <div class="home-team-block right">
      <span class="home-team">${(match.SQUADRA_TRASFERTA || "").toUpperCase()}</span>
      ${logoTrasf}
    </div>
  </div>
  `;
}

function showHome() {
  // 🔥 Aggiorna hash per deep linking e storico browser
  window.location.hash = 'home';
  
  // Ferma refresh live classifiche (risparmio risorse)
  stopStandingsLiveRefresh();
  
  // Aggiorna toolbar con stato attivo
  renderToolbar("home");
  
  const app = document.getElementById("app"); 
  if (!app) return;
  
  const currentYear = new Date().getFullYear();
  
  // 🔥 Trova e renderizza card partita LIVE o prossima
  const nextMatchCard = getNextMatchCard();
  
  app.innerHTML = `
    <div class="home-container">
      <div class="home-sponsors">
        <img src="https://i.imgur.com/NugXx1k.png" alt="Sponsor 1" loading="lazy">
        <img src="https://i.imgur.com/oiMHzlC.jpeg" alt="Sponsor 2" loading="lazy">
      </div>
      
      <div class="home-bg">
        <!-- SVG campo da calcio (sinistra/destra) -->
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
      
      <!-- 🔥 CARD DINAMICA: LIVE o Prossima Partita -->
      ${nextMatchCard}
    </div>
  `;
}

// ============================================================================
// 👥 TEAMS FUNCTIONS (Semplificate - da espandere dopo)
// ============================================================================

function showTeams() {
   window.location.hash = 'teams';
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
    const logoHtml = t.LOGO_ID 
      ? `<img src="${getCachedImage(t.LOGO_ID, 65)}" class="team-mini-logo" alt="${t.NOME_SQUADRA}" onerror="this.style.display='none';this.parentElement.innerHTML='⚽'">`
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
      const newTeam = { TEAM_ID: res.id, NOME_SQUADRA: name, GIRONE: girone, LOGO_ID: null };
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
    if (team.LOGO_ID) {
      logoBox.innerHTML = `<img src="${getCachedImage(team.LOGO_ID, 512)}" class="team-header-logo" alt="Logo" onclick="teamLogoAction()">`;
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
  
  if (!team?.LOGO_ID) {
    uploadNewLogo();
    return;
  }
  
  const modal = document.createElement("div");
  modal.className = "modalOverlay";
  modal.innerHTML = `
    <div class="modalBox">
      <div class="modalTitle">LOGO SQUADRA</div>
      <img src="${getCachedImage(team.LOGO_ID, 400)}" style="max-width:100%;border-radius:12px;margin:20px 0;">
      <div class="modalActions">
        <div class="phase-btn secondary" onclick="window.open('https://drive.google.com/file/d/${team.LOGO_ID}/view', '_blank'); this.closest('.modalOverlay').remove()">APRI SU DRIVE</div>
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
        window.APP_CACHE.fullTeams[teamId].team.LOGO_ID = newId?.fileId || newId;
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
  if (player?.FOTO_ID) {
    box.innerHTML = `<img src="${getCachedImage(player.FOTO_ID, 200)}" class="playerPhotoBig" alt="${player.NOME}">`;
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
    const playerId = await ApiClient.savePlayerAdmin(currentPlayerId, teamId, name.toUpperCase(), "");
    currentPlayerId = playerId;
    
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
      
      if (window.APP_CACHE.playersMap) {
        window.APP_CACHE.playersMap[playerId] = {
          ...window.APP_CACHE.playersMap[playerId],
          FOTO_ID: newPhotoId,
          NOME: name.toUpperCase()
        };
        CacheManager.save(window.APP_CACHE);
      }
    }
    
    document.querySelector(".modalOverlay")?.remove();
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
  const photoHtml = p.FOTO_ID 
    ? `<img src="${getCachedImage(p.FOTO_ID, 42)}" class="playerPhoto" alt="${p.NOME}" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\'playerPhotoEmpty\'></div>'">`
    : "<div class='playerPhotoEmpty'></div>";
  
  // 🔥 FORZA VALORI NUMERICI (anche se null/undefined)
  const gol = Number(p.GOL) || 0;
  const assist = Number(p.ASSIST) || 0;
  const amm = Number(p.AMMONIZIONI) || 0;
  const esp = Number(p.ESPULSIONI) || 0;
  const mvp = Number(p.MVP_VINTI) || 0;  // ✅ Sempre un numero, mai vuoto
  
  html += `
    <tr onclick="openPlayerPopup('${p.PLAYER_ID}')">
      <td>${photoHtml}</td>
      <td>${(p.NOME || "").toUpperCase()}</td>
      <td>${gol}</td>
      <td>${assist}</td>
      <td>${amm}</td>
      <td>${esp}</td>
      <td class="mvp-cell">${mvp}</td>  <!-- ✅ Mostra sempre il numero -->
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
// 🗑 EVENT MENU & DELETE
// ============================================================================

function openEventMenu(ev, eventId, matchId) {
  ev.stopPropagation();
  ev.preventDefault();
  
  // Rimuovi menu esistenti
  document.querySelectorAll(".event-popup-menu").forEach(e => e.remove());
  
  const menu = document.createElement("div");
  menu.className = "event-popup-menu";
  menu.innerHTML = `<div onclick="deleteEvent('${eventId}', '${matchId}'); this.parentElement.remove()">🗑 Elimina evento</div>`;
  menu.style.cssText = `
    position: fixed;
    left: ${ev.clientX}px;
    top: ${ev.clientY}px;
    background: white;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 8px 0;
    z-index: 10000;
    min-width: 140px;
  `;
  
  const menuItem = menu.querySelector("div");
  menuItem.style.cssText = `
    padding: 8px 16px;
    cursor: pointer;
    font-size: 13px;
    color: #333;
  `;
  menuItem.onmouseover = () => menuItem.style.background = "#f5f5f5";
  menuItem.onmouseout = () => menuItem.style.background = "white";
  
  menu.onclick = e => e.stopPropagation();
  document.body.appendChild(menu);
  
  // Chiudi cliccando fuori
  setTimeout(() => {
    const close = e => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", close);
      }
    };
    document.addEventListener("click", close, { once: true });
  }, 0);
}

// ============================================================================
// ⚽ MATCHES FUNCTIONS
// ============================================================================

function showMatches() {
  window.location.hash = 'matches';
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
  
  const matches = (data || [])
    .filter(m => m?.MATCH_ID && m?.DATA)
    .map(m => ({ 
      ...m, 
      DATA: String(m.DATA).slice(0, 10), 
      STATO_PARTITA: String(m.STATO_PARTITA || "").trim().toUpperCase() 
    }));
  
  // 🔥 AUMENTA LIMITE A 30 DATE (era 10)
  const dates = [...new Set(matches.filter(m => m.DATA).map(m => m.DATA))]
    .sort()
    .slice(0, 30);  // ← CAMBIATO DA 10 A 30
  
  window.APP_STATE.availableDates = dates;
  
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
  
  // 🔥 FILTRA: Mostra TUTTE le partite (gironi + finali)
  // 🔥 FILTRA e ORDINA: LIVE/SUPP/RIGORI sempre sopra
  let matches = allMatches
    .filter(m => {
      const matchDate = String(m.DATA || "").slice(0, 10);
      return matchDate === date;
    })
    .sort((a, b) => {
      // 🔥 Priorità: LIVE/SUPP/RIGORI > PROGRAMMATA > FINITA
      const getPriority = (m) => {
        const status = m.STATO_PARTITA;
        if (status === "LIVE" || status === "SUPP" || status === "RIGORI") return 0; // 🔥 PRIORITÀ MASSIMA
        if (status === "PROGRAMMATA") return 1;
        if (status === "FINITA") return 2;
        return 3;
      };
      
      const priorityA = getPriority(a);
      const priorityB = getPriority(b);
      
      // Se stessa priorità, ordina per ora
      if (priorityA === priorityB) {
        const timeA = a.ORA || "00:00";
        const timeB = b.ORA || "00:00";
        return timeA.localeCompare(timeB);
      }
      
      return priorityA - priorityB;
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

    // 🔥 Loghi con fallback robusto
    const logoCasa = m.LOGO_CASA 
      ? `<div class="team-logo-placeholder-wrap">
          <img src="${getCachedImage(m.LOGO_CASA, 50)}" 
               alt="${m.SQUADRA_CASA}" 
               class="team-logo-placeholder-img"
               onerror="this.style.display='none'; this.parentElement.querySelector('.team-logo-placeholder-fallback').style.display='flex'">
          <div class="team-logo-placeholder-fallback" style="display:none">⚽</div>
        </div>`
      : `<div class="team-logo-placeholder-wrap">
          <div class="team-logo-placeholder-fallback">⚽</div>
        </div>`;
    
    const logoTrasf = m.LOGO_TRASFERTA 
      ? `<div class="team-logo-placeholder-wrap">
          <img src="${getCachedImage(m.LOGO_TRASFERTA, 50)}" 
               alt="${m.SQUADRA_TRASFERTA}" 
               class="team-logo-placeholder-img"
               onerror="this.style.display='none'; this.parentElement.querySelector('.team-logo-placeholder-fallback').style.display='flex'">
          <div class="team-logo-placeholder-fallback" style="display:none">⚽</div>
        </div>`
      : `<div class="team-logo-placeholder-wrap">
          <div class="team-logo-placeholder-fallback">⚽</div>
        </div>`;
    
    // 🔥 FASE PARTITA - Nascondi se LIVE/SUPP/RIGORI
    let faseBadge = "";
    const turnoVal = m.TURNO || m.turno || m.matchKey || "";
    
    // Mostra badge SOLO se non è in uno stato attivo
    if (turnoVal && !["LIVE", "SUPP", "RIGORI"].includes(m.STATO_PARTITA)) {
      const turnoMap = {
        "Q1": "QUARTI", "Q2": "QUARTI", "Q3": "QUARTI", "Q4": "QUARTI",
        "SF1": "SEMIFINALE", "SF2": "SEMIFINALE",
        "F": "FINALE", "TP": "FINALE 3°-4°"
      };
      const turno = turnoMap[turnoVal] || turnoVal;
      faseBadge = `<div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-top:4px">${turno}</div>`;
    }
    
    let center = "";

    // 🔥 GESTIONE STATI: LIVE → SUPP → RIGORI → FINITA
    if (m.STATO_PARTITA === "LIVE") {
      center = `
        <div class="score live">${m.GOL_CASA || 0} - ${m.GOL_TRASFERTA || 0}</div>
        <div class="status live">LIVE</div>
        ${faseBadge}
      `;
    } 
    // 🔥 SUPPLEMENTARI: stessa UI di LIVE ma con scritta SUPP
    else if (m.STATO_PARTITA === "SUPP") {
      center = `
        <div class="score live">${m.GOL_CASA || 0} - ${m.GOL_TRASFERTA || 0}</div>
        <div class="status live">SUPP</div>
        ${faseBadge}
      `;
    } 
    // 🔥 RIGORI IN CORSO: mostra punteggio rigori tra parentesi
    else if (m.STATO_PARTITA === "RIGORI") {
      const rigoriCasa = m.RIGORI_CASA || 0;
      const rigoriTrasf = m.RIGORI_TRASFERTA || 0;
      center = `
        <div class="score live">${m.GOL_CASA || 0} - ${m.GOL_TRASFERTA || 0} <span style="font-size:14px;color:#888">(${rigoriCasa}-${rigoriTrasf} dcr)</span></div>
        <div class="status live">RIGORI</div>
        ${faseBadge}
      `;
    } 
    // 🔥 FINITA: se pareggio + rigori, mostra risultato dcr
    //  FINITA: mostra risultato DCR se presente
    else if (m.STATO_PARTITA === "FINITA") {
        // Controlla sia RIGORI_CASA che RIGORE_CASA per compatibilità
        const rc = m.RIGORE_CASA || m.RIGORI_CASA; 
        const rt = m.RIGORE_TRASFERTA || m.RIGORI_TRASFERTA;
    
        if (rc !== undefined && rc !== "") {
            center = `
            <div class="score">${m.GOL_CASA || 0} - ${m.GOL_TRASFERTA || 0} <span style="font-size:12px;color:#666">(${rc}-${rt} dcr)</span></div>
            <div class="status">TERMINATA</div>
            ${faseBadge}
            `;
        } else {
            center = `
            <div class="score">${m.GOL_CASA || 0} - ${m.GOL_TRASFERTA || 0}</div>
            <div class="status">TERMINATA</div>
            ${faseBadge}
            `;
        }
    }
    // 🔥 PROGRAMMATA
    else {
      center = `
        <div class="time">${m.ORA || "--:--"}</div>
        ${faseBadge}
      `;
    }
    
    // 🔥 Applica live-match a LIVE, SUPP e RIGORI (bordo granata + animazione)
    const isActive = ["LIVE", "SUPP", "RIGORI"].includes(m.STATO_PARTITA);
    
    html += `
      <div class="match-card ${isActive ? "live-match" : ""}"
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

// Aggiungi questa funzione nel tuo codice JS globale
function renderPenaltiesUI(match, events) {
    // 1. Trova il contenitore dove inserire i rigori (sotto il punteggio grande)
    // Adatta il selettore '.match-score-big' alla tua classe HTML reale del punteggio
    const scoreContainer = document.querySelector('.match-score-big') || document.querySelector('.score-big'); 
    if (!scoreContainer) return;

    // 2. Rimuovi vecchi rendering se presenti (per evitare duplicati)
    const existing = document.querySelector('.penalty-ui-container');
    if (existing) existing.remove();

    // 3. Prendi solo gli eventi dei rigori
    // Il filtro controlla se il tipo evento contiene "RIGORE"
    const penaltyEvents = events.filter(e => e.TIPO && e.TIPO.toString().includes("RIGORE"));

    // Se non ci sono eventi rigore E non ci sono valori salvati, esci
    if (penaltyEvents.length === 0 && !match.RIGORI_CASA) return;

    // 4. Organizza i tiri in sequenza (alternando Casa e Trasferta)
    // Ordina per minuto crescente
    penaltyEvents.sort((a, b) => a.MINUTO - b.MINUTO);

    let kicksCasa = [];
    let kicksTrasferta = [];
    let turnoCasa = true; // Di solito inizia la casa

    // Ricostruiamo la sequenza visiva dai dati salvati
    penaltyEvents.forEach(ev => {
        const isGoal = ev.TIPO === "RIGORE_SEGNO";
        if (turnoCasa) {
            kicksCasa.push(isGoal ? 'goal' : 'miss');
        } else {
            kicksTrasferta.push(isGoal ? 'goal' : 'miss');
        }
        turnoCasa = !turnoCasa;
    });

    // 5. Funzione per generare i pallini colorati
    const createDots = (kicksArray) => {
        return kicksArray.map(res => {
            // Usa i colori del tuo tema (es. Verde per goal, Rosso/Arancio per errore)
            const color = res === 'goal' ? '#4caf50' : '#f44336'; 
            return `<div style="width: 20px; height: 20px; border-radius: 50%; background-color: ${color}; margin: 0 3px; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`;
        }).join('');
    };

    // 6. Recupera i punteggi finali (o calcolali se non sono nel match object)
    const scoreC = match.RIGORI_CASA !== undefined ? match.RIGORI_CASA : kicksCasa.filter(k => k === 'goal').length;
    const scoreT = match.RIGORI_TRASFERTA !== undefined ? match.RIGORI_TRASFERTA : kicksTrasferta.filter(k => k === 'goal').length;

    // 7. Crea l'HTML finale
    const html = `
        <div class="penalty-ui-container" style="margin-top: 30px; text-align: center; animation: fadeIn 0.5s;">
            <!-- Riga dei pallini -->
            <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 20px;">
                <div style="display: flex; flex-direction: row-reverse;">${createDots(kicksCasa)}</div>
                <div style="width: 40px;"></div> <!-- Spazio -->
                <div style="display: flex;">${createDots(kicksTrasferta)}</div>
            </div>
            
            <!-- Scritta DCR e Risultato -->
            <div style="font-size: 14px; font-weight: bold; color: #666; letter-spacing: 2px;">DCR</div>
            <div style="font-size: 48px; font-weight: 900; color: #333; line-height: 1;">
                ${scoreC} - ${scoreT}
            </div>
        </div>
    `;

    // 8. Inserisci sotto il punteggio
    scoreContainer.insertAdjacentHTML('afterend', html);
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

async function forceReloadEvents(matchId, match) {
  console.log('🔄 [FORCE RELOAD] Eventi per match:', matchId);
  
  try {
    const freshEvents = await ApiClient.getEventsAdmin(matchId);
    console.log('✅ [FORCE RELOAD] Eventi ricevuti:', freshEvents.length);
    
    window.APP_CACHE.eventsByMatch[matchId] = freshEvents;
    CacheManager.save(window.APP_CACHE);
    
    renderEvents(freshEvents, match);
  } catch (error) {
    console.error('❌ [FORCE RELOAD] Errore:', error);
  }
}

function openMatch(id) {
  const myNonce = ++window.APP_STATE._matchRequestNonce;
  setCurrentMatch(id);
  console.log('🔍 [OPEN MATCH] ID:', id, 'Nonce:', myNonce);
  
  // 🔥 BLOCCA eventuali refresh automatici per 10 secondi
  window.APP_STATE._matchLoading = true;
  setTimeout(() => { window.APP_STATE._matchLoading = false; }, 10000);
  
  // 🔥 PRIORITÀ: Cerca SEMPRE prima nella cache completa
  const cachedMatch = window.APP_CACHE.matches?.find(m => String(m.MATCH_ID) === String(id));

  if (cachedMatch && cachedMatch.CASA_ID && cachedMatch.TRASFERTA_ID) {
    console.log('✅ Match COMPLETO dalla cache:', {
      casaId: cachedMatch.CASA_ID,
      trasfertaId: cachedMatch.TRASFERTA_ID,
      squadraCasa: cachedMatch.SQUADRA_CASA,
      squadraTrasferta: cachedMatch.SQUADRA_TRASFERTA
    });

  
      // 🔥 AGGIUNGI QUESTO DOPO renderMatchPage():
    if (cachedMatch && cachedMatch.STATO_PARTITA === "RIGORI") {
        setTimeout(() => {
            console.log('🎯 Partita in RIGORI - Apro popup direttamente in modalità tiri');
            openRigoriPopup(true);
        }, 100);  // ✅ Ridotto da 500ms a 100ms
    }
    
    // 🔥 CALCOLA PUNTEGGIO DAGLI EVENTI LOCALI (sempre aggiornato)
    const localEvents = window.APP_CACHE.eventsByMatch?.[id] || [];
    const calculatedScore = calculateMatchScore(cachedMatch, localEvents);
    
    // Renderizza SUBITO con dati cache + punteggio calcolato
    renderMatchPage({...cachedMatch, ...calculatedScore});
    updateMatchUI(cachedMatch);
    
    // 🔥 SALVA lastMatch SOLO se ha gli ID
    window.APP_STATE.lastMatch = { ...cachedMatch, ...calculatedScore };
    
    // Renderizza eventi
    renderEvents(localEvents, cachedMatch);
    
    // Carica giocatori
    loadPlayersForMatch(cachedMatch);
    
    setTimeout(() => {
      const cachedEvents = window.APP_CACHE.eventsByMatch?.[id] || [];
      if (cachedEvents.length === 0) {
        console.log('⚠️ Cache eventi vuota, forzo ricarica...');
        forceReloadEvents(id, cachedMatch);
      }
    }, 500);
  }
  
  // Aggiorna dal backend (background) - MA NON SOVRASCRIVERE SE ID VUOTI
  ApiClient.getMatchFull(id)
  .then(res => {
    if (myNonce !== window.APP_STATE._matchRequestNonce) return;
    if (!res?.match) return;
    
    const freshMatch = res.match;
    
    // 🔥 VALIDAZIONE STRICT: se il backend ritorna ID vuoti, IGNORALO COMPLETAMENTE
    if (!freshMatch.CASA_ID || !freshMatch.TRASFERTA_ID ||
        freshMatch.CASA_ID === "" || freshMatch.TRASFERTA_ID === "") {
      console.warn('⚠️ Backend ha ritornato ID VUOTI, MANTENGO CACHE:', freshMatch);
      return;
    }
    
    // 🔥 CARICA GLI EVENTI AGGIORNATI DAL BACKEND
    return ApiClient.getEventsAdmin(id).then(freshEvents => {
      // Aggiorna cache eventi
      window.APP_CACHE.eventsByMatch[id] = freshEvents;
      CacheManager.save(window.APP_CACHE);
      
      // 🔥 CALCOLA PUNTEGGIO DAGLI EVENTI FRESCI (non dal backend)
      const calculatedScore = calculateMatchScore(freshMatch, freshEvents);
      
      // Solo se gli ID sono validi, aggiorna (MA USA PUNTEGGIO CALCOLATO)
      console.log('✅ Backend dati validi, aggiorno cache con punteggio calcolato');
      window.APP_STATE.matchesById[freshMatch.MATCH_ID] = {...freshMatch, ...calculatedScore};
      window.APP_STATE.lastMatch = {...freshMatch, ...calculatedScore};
      
      // Aggiorna cache globale matches
      if (window.APP_CACHE.matches) {
        const idx = window.APP_CACHE.matches.findIndex(m => String(m.MATCH_ID) === String(freshMatch.MATCH_ID));
        if (idx >= 0) {
          window.APP_CACHE.matches[idx] = { 
            ...window.APP_CACHE.matches[idx], 
            ...freshMatch,
            ...calculatedScore  // 🔥 USA PUNTEGGIO CALCOLATO
          };
          CacheManager.save(window.APP_CACHE);
        }
      }
      
      // Aggiorna UI solo se cambia qualcosa
      if (cachedMatch && (calculatedScore.GOL_CASA !== cachedMatch.GOL_CASA ||
          calculatedScore.GOL_TRASFERTA !== cachedMatch.GOL_TRASFERTA ||
          freshMatch.STATO_PARTITA !== cachedMatch.STATO_PARTITA)) {
        console.log('🔄 Aggiorno UI con nuovi dati backend + punteggio calcolato');
        renderMatchPage({...freshMatch, ...calculatedScore});
        loadPlayersForMatch(freshMatch);
      }
    });
  })
  .catch(err => {
    console.error('❌ Errore backend getMatchFull:', err);
    // Mantieni cache
  });
}

function renderMatchPage(match) {
    if (!match || !match.MATCH_ID) {
        console.error('Match non valido', match);
        return;
    }

    // 🔥 RECUPERA NOMI E LOGHI SE MANCANO
    if (!match.SQUADRA_CASA || !match.LOGO_CASA) {
        const casaData = window.APP_CACHE.fullTeams?.[String(match.CASA_ID)];
        if (casaData?.team) {
            match.SQUADRA_CASA = casaData.team.NOME_SQUADRA || "CASA";
            match.LOGO_CASA = casaData.team.LOGO_ID || "";
        }
    }
    if (!match.SQUADRA_TRASFERTA || !match.LOGO_TRASFERTA) {
        const trasfData = window.APP_CACHE.fullTeams?.[String(match.TRASFERTA_ID)];
        if (trasfData?.team) {
            match.SQUADRA_TRASFERTA = trasfData.team.NOME_SQUADRA || "TRASFERTA";
            match.LOGO_TRASFERTA = trasfData.team.LOGO_ID || "";
        }
    }

    // 🔥 LOGHI
    const logoCasa = match.LOGO_CASA
        ? `<img src="${getCachedImage(match.LOGO_CASA, 120)}" alt="${match.SQUADRA_CASA}" onerror="this.style.display='none'">`
        : `<div style="width:70px;height:70px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:1.5rem">⚽</div>`;

    const logoTrasf = match.LOGO_TRASFERTA
        ? `<img src="${getCachedImage(match.LOGO_TRASFERTA, 120)}" alt="${match.SQUADRA_TRASFERTA}" onerror="this.style.display='none'">`
        : `<div style="width:70px;height:70px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:1.5rem">⚽</div>`;

    const nomeCasa = (match.SQUADRA_CASA || "CASA").toUpperCase();
    const nomeTrasf = (match.SQUADRA_TRASFERTA || "TRASFERTA").toUpperCase();

    // 🔥 GESTIONE STATI
    const isLive = ["LIVE", "SUPP", "RIGORI"].includes(match.STATO_PARTITA);
    const isFinished = match.STATO_PARTITA === "FINITA";
    const finalStageStarted = window.APP_CACHE.meta?.finalStageStarted;

    // Tab MVP
    let mvpTabHtml = isLive
        ? `<div class="mt-btn" data-tab="mvp">MVP</div>`
        : `<div class="mt-btn disabled" data-tab="mvp">🏆 MVP</div>`;

    // Pulsanti evento
    const canAddEvents = (match.STATO_PARTITA === "LIVE" || match.STATO_PARTITA === "SUPP") &&
        (match.FASE === "FINALI" || !finalStageStarted);

    const eventBtnDisabled = !canAddEvents
        ? "style=\"opacity:0.5;pointer-events:none;cursor:not-allowed\""
        : "";

    // Pulsante inizia/concludi
    const canToggleMatch = match.FASE === "FINALI" || !finalStageStarted || !isFinished;
    const toggleBtnDisabled = !canToggleMatch
        ? "style=\"opacity:0.5;pointer-events:none;cursor:not-allowed\""
        : "";

    document.getElementById("app").innerHTML = `
    <div class="match-page">
        <div class="match-header-big">
            <div class="team-big left">
                ${logoCasa}
                <div class="team-big-name">${nomeCasa}</div>
            </div>
            <div class="match-center">
                <div class="match-controls-top">
                    <div class="phase-btn start-btn ${isLive ? "active" : ""}"
                        onclick="${canToggleMatch ? "toggleMatch()" : ""}"
                        ${toggleBtnDisabled}>
                        ${isLive ? "CONCLUDI" : "INIZIA"}
                    </div>
                    ${match.FASE === "FINALI" && isLive ? `
                        <div class="phase-btn secondary-btn" onclick="toggleSupplementari()">SUPPLEMENTARI</div>
                        <div class="phase-btn secondary-btn" onclick="openRigoriPopup()">RIGORI</div>
                    ` : ''}
                </div>

                <!-- PUNTEGGIO PRINCIPALE -->
                <div class="score-big">${match.GOL_CASA || 0} - ${match.GOL_TRASFERTA || 0}</div>

                <!-- 🔥 CARD RISULTATO RIGORI (DCR) -->
                ${ (match.RIGORE_CASA !== undefined && match.RIGORE_CASA !== "" && match.STATO_PARTITA === "FINITA") ? `
                <div class="dcr-result-card" style="margin-top: 15px; background: #fff3cd; color: #856404; padding: 8px 15px; border-radius: 8px; font-size: 14px; font-weight: bold; display: inline-block;">
                    ⚽ DCR: ${match.RIGORE_CASA} - ${match.RIGORE_TRASFERTA}
                </div>
                ` : '' }

                <div class="match-status" id="matchStatus"></div>
            </div>
            <div class="team-big right">
                <div class="team-big-name">${nomeTrasf}</div>
                ${logoTrasf}
            </div>
        </div>

        <div class="match-toolbar">
            <div class="mt-btn active" data-tab="diretta">DIRETTA</div>
            <div class="mt-btn" data-tab="giocatori">GIOCATORI</div>
            ${mvpTabHtml}
        </div>

        <div class="match-content">
            <div class="tab-content active" id="tab-diretta">
                <div class="teams-events">
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
                    <div class="cronaca-title center"><span>CRONACA</span></div>
                    
                    <!-- 🔥 CONTAINER RIGORI (inizialmente vuoto, si popola dopo) -->
                    <div id="rigoriBannerContainer"></div>
                    
                    <div id="mvpBanner" class="mvp-banner">
                        <div class="mvp-title">🏆 MVP DEL MATCH</div>
                        <div class="mvp-name"></div>
                    </div>
                    <div id="eventsTimeline" class="events-timeline">
                        <div id="eventsContent"></div>
                    </div>
                </div>
            </div>

            <div class="tab-content" id="tab-giocatori">
                <div class="players-columns" id="playersColumns">
                    <div style="text-align:center;padding:40px;color:#888;grid-column:1/-1">
                        Caricamento giocatori...
                    </div>
                </div>
            </div>

            <div class="tab-content" id="tab-mvp">
                <div class="players-columns" id="mvpColumns">
                    <div style="text-align:center;padding:40px;color:#888;grid-column:1/-1">
                        ${isLive ? "Vota il MVP" : isFinished ? "MVP della partita" : "Disponibile durante la partita"}
                    </div>
                </div>
            </div>

            <div class="back-btn-wrapper">
                <div class="phase-btn secondary" onclick="showMatches()">INDIETRO</div>
            </div>
        </div>
    </div>
    `;

    // Aggiorna UI
    updateMatchUI(match);

    // 🔥 BANNER DCR (Appare solo se finita e ci sono dati rigori)
    if (match.STATO_PARTITA === "FINITA" && match.RIGORI_CASA !== undefined) {
        const header = document.querySelector('.match-header-big');
        const existing = document.getElementById('dcr-banner');
        if (existing) existing.remove();

        const dcrBanner = document.createElement('div');
        dcrBanner.id = 'dcr-banner';
        dcrBanner.style.cssText = `
            width: 100%;
            text-align: center;
            margin-top: 15px;
            padding: 10px;
            background: linear-gradient(90deg, #fff 0%, #f9f9f9 100%);
            border: 2px solid #7a1e2c;
            border-radius: 12px;
            color: #7a1e2c;
            font-weight: 800;
            font-size: 1.2rem;
            letter-spacing: 1px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        dcrBanner.innerHTML = `⚽ CALCI DI RIGORE: ${match.RIGORI_CASA} - ${match.RIGORI_TRASFERTA}`;
        header.appendChild(dcrBanner);
    }

    if (match.STATO_PARTITA === "FINITA" && match.MVP) {
        updateMVPBanner(match);
    }

    // 🔥 CARICA EVENTI DAL BACKEND
    const events = window.APP_CACHE.eventsByMatch?.[match.MATCH_ID] || [];
    console.log('📥 Eventi caricati per match:', match.MATCH_ID, 'totale:', events.length);

    if (events.length === 0) {
        ApiClient.getEventsAdmin(match.MATCH_ID).then(freshEvents => {
            window.APP_CACHE.eventsByMatch[match.MATCH_ID] = freshEvents;
            CacheManager.save(window.APP_CACHE);
            renderEvents(freshEvents, match);
            
            // 🔥 DOPO CARICAMENTO BACKEND: controlla se ci sono rigori e aggiorna UI
            setTimeout(() => {
                syncRigoriFromBackend(freshEvents, match);
            }, 500);
        }).catch(err => {
            console.error('❌ Errore caricamento eventi:', err);
            renderEvents([], match);
        });
    } else {
        renderEvents(events, match);
        
        // 🔥 IMMEDIATO: mostra rigori da localStorage se esistono
        showRigoriFromLocalStorage(match);
        
        // 🔥 DOPO 2-3 SECONDI: sincronizza con backend
        setTimeout(() => {
            syncRigoriFromBackend(events, match);
        }, 2500);
    }

    // Carica giocatori
    loadPlayersForMatch(match);

    window.APP_STATE.lastMatch = match;
}

// 🔥 FUNZIONE: Mostra rigori da localStorage immediatamente
function showRigoriFromLocalStorage(match) {
    const storageKey = `rigori_${match.MATCH_ID}`;
    const savedState = localStorage.getItem(storageKey);
    
    if (!savedState) return;
    
    try {
        const rigoriState = JSON.parse(savedState);
        
        // Se ci sono tiri registrati, mostra il banner
        if (rigoriState.history && rigoriState.history.length > 0) {
            renderRigoriBanner(rigoriState.casaScore || 0, rigoriState.trasfScore || 0, match);
        }
    } catch (e) {
        console.error('❌ Errore lettura rigori da localStorage:', e);
    }
}

// 🔥 FUNZIONE: Sincronizza rigori dal backend dopo caricamento eventi
function syncRigoriFromBackend(events, match) {
    // Cerca eventi di rigore negli eventi caricati dal backend
    const rigoreEvents = events.filter(e => 
        e.TIPO && (e.TIPO.includes('RIGORE_SEGNO') || e.TIPO.includes('RIGORE_SBAGLIO'))
    );
    
    if (rigoreEvents.length === 0) return;
    
    // Calcola punteggi dai eventi backend
    let casaScore = 0;
    let trasfScore = 0;
    
    rigoreEvents.forEach(e => {
        const isGoal = e.TIPO === 'RIGORE_SEGNO';
        const isCasa = String(e.TEAM_ID) === String(match.CASA_ID);
        
        if (isGoal) {
            if (isCasa) casaScore++;
            else trasfScore++;
        }
    });
    
    // Aggiorna UI con i dati del backend
    renderRigoriBanner(casaScore, trasfScore, match);
    
    console.log(`✅ Rigori sincronizzati da backend: ${casaScore}-${trasfScore}`);
}

// 🔥 FUNZIONE: Renderizza banner rigori
function renderRigoriBanner(casaScore, trasfScore, match) {
    const container = document.getElementById('rigoriBannerContainer');
    if (!container) return;
    
    // Rimuovi banner precedente se esiste
    const existing = container.querySelector('.rigori-sync-banner');
    if (existing) existing.remove();
    
    const banner = document.createElement('div');
    banner.className = 'rigori-sync-banner';
    banner.style.cssText = `
        background: linear-gradient(135deg, #7a1e2c 0%, #8c1d2c 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 10px;
        text-align: center;
        margin: 10px 0;
        box-shadow: 0 4px 12px rgba(122, 30, 44, 0.3);
        animation: slideIn 0.4s ease;
    `;
    
    banner.innerHTML = `
        <div style="font-size: 13px; font-weight: 600; letter-spacing: 1px; margin-bottom: 4px; opacity: 0.9;">
            ⚽ CALCI DI RIGORE
        </div>
        <div style="font-size: 26px; font-weight: 900;">
            ${match.SQUADRA_CASA} ${casaScore} - ${trasfScore} ${match.SQUADRA_TRASFERTA}
        </div>
    `;
    
    container.appendChild(banner);
}
function getSafeMatchData(matchId) {
  if (!matchId) return null;
  
  const strMatchId = String(matchId);
  
  // 1. Cerca in matchesById
  let match = window.APP_STATE.matchesById?.[strMatchId];
  
  // 2. Cerca nella cache globale
  if (!match && window.APP_CACHE.matches) {
    match = window.APP_CACHE.matches.find(m => String(m.MATCH_ID) === strMatchId);
  }
  
  if (!match) {
    console.error('❌ Match non trovato:', matchId);
    return null;
  }
  
  // 🔥 3. VERIFICA E RIPRISTINA ID SQUADRE (fondamentale!)
  if (!match.CASA_ID || !match.TRASFERTA_ID) {
    console.warn('⚠️ ID squadre mancanti, provo a recuperare...');
    
    // Cerca nei team cached per trovare gli ID
    if (match.SQUADRA_CASA && window.APP_CACHE.teams) {
      const casaTeam = window.APP_CACHE.teams.find(t => 
        String(t.NOME_SQUADRA).toUpperCase() === String(match.SQUADRA_CASA).toUpperCase()
      );
      if (casaTeam) {
        match.CASA_ID = casaTeam.TEAM_ID;
        console.log('✅ Recuperato CASA_ID:', match.CASA_ID);
      }
    }
    
    if (match.SQUADRA_TRASFERTA && window.APP_CACHE.teams) {
      const trasfTeam = window.APP_CACHE.teams.find(t => 
        String(t.NOME_SQUADRA).toUpperCase() === String(match.SQUADRA_TRASFERTA).toUpperCase()
      );
      if (trasfTeam) {
        match.TRASFERTA_ID = trasfTeam.TEAM_ID;
        console.log('✅ Recuperato TRASFERTA_ID:', match.TRASFERTA_ID);
      }
    }
  }
  
  // 4. Recupera nomi e loghi se mancano
  if (match.CASA_ID) {
    const casaData = window.APP_CACHE.fullTeams?.[String(match.CASA_ID)];
    if (casaData?.team) {
      match.SQUADRA_CASA = casaData.team.NOME_SQUADRA || match.SQUADRA_CASA;
      match.LOGO_CASA = casaData.team.LOGO_ID || match.LOGO_CASA;
    }
  }
  
  if (match.TRASFERTA_ID) {
    const trasfData = window.APP_CACHE.fullTeams?.[String(match.TRASFERTA_ID)];
    if (trasfData?.team) {
      match.SQUADRA_TRASFERTA = trasfData.team.NOME_SQUADRA || match.SQUADRA_TRASFERTA;
      match.LOGO_TRASFERTA = trasfData.team.LOGO_ID || match.LOGO_TRASFERTA;
    }
  }
  
  // 5. Valori di default
  match.SQUADRA_CASA = match.SQUADRA_CASA || "CASA";
  match.SQUADRA_TRASFERTA = match.SQUADRA_TRASFERTA || "TRASFERTA";
  match.GOL_CASA = Number(match.GOL_CASA) || 0;
  match.GOL_TRASFERTA = Number(match.GOL_TRASFERTA) || 0;
  
  return match;
}

function ensureMatchHasTeamIds(match) {
  if (!match) return null;
  
  if (match.CASA_ID && match.TRASFERTA_ID) {
    return match; // Già completo
  }
  
  console.warn('🔧 Recovery ID squadre per match:', match.MATCH_ID);
  
  // Cerca nei team cached
  const teams = window.APP_CACHE.teams || [];
  
  if (!match.CASA_ID && match.SQUADRA_CASA) {
    const casaTeam = teams.find(t => 
      String(t.NOME_SQUADRA).toUpperCase() === String(match.SQUADRA_CASA).toUpperCase()
    );
    if (casaTeam) {
      match.CASA_ID = casaTeam.TEAM_ID;
      console.log('✅ Recuperato CASA_ID:', match.CASA_ID);
    }
  }
  
  if (!match.TRASFERTA_ID && match.SQUADRA_TRASFERTA) {
    const trasfTeam = teams.find(t => 
      String(t.NOME_SQUADRA).toUpperCase() === String(match.SQUADRA_TRASFERTA).toUpperCase()
    );
    if (trasfTeam) {
      match.TRASFERTA_ID = trasfTeam.TEAM_ID;
      console.log('✅ Recuperato TRASFERTA_ID:', match.TRASFERTA_ID);
    }
  }
  
  return match;
}

async function toggleMatch() {
  const match = window.APP_STATE.lastMatch;
  if (!match) return;
  
  const newStatus = match.STATO_PARTITA === "LIVE" ? "FINITA" : "LIVE";
  
  // 🔥 1. AGGIORNA STATO LOCALE E UI SUBITO (Istantaneo)
  match.STATO_PARTITA = newStatus;
  window.APP_STATE.lastMatch = match;
  
  // Aggiorna il pulsante INIZIO/CONCLUDI e lo stato
  updateMatchUI(match);
  
  // 🔥 2. GESTISCI PULSANTI EVENTI IN BASE ALLO STATO
  const canAddEvents = (newStatus === "LIVE" || newStatus === "SUPP") && 
    (match.FASE === "FINALI" || !window.APP_CACHE.meta?.finalStageStarted);
  
  document.querySelectorAll('.phase-btn.small').forEach(btn => {
    if (btn.textContent.trim().includes('+ EVENTO')) {
      if (canAddEvents) {
        // 🔥 ABILITA PULSANTI
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
        // Ripristina gli onclick
        if (btn.textContent.includes('CASA')) {
          btn.onclick = () => addEvent('casa');
        } else if (btn.textContent.includes('TRASFERTA')) {
          btn.onclick = () => addEvent('trasferta');
        }
      } else {
        // 🔥 DISABILITA PULSANTI
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
        btn.style.cursor = 'not-allowed';
        btn.onclick = null;
      }
    }
  });
  
  const mainBtn = document.querySelector(".start-btn");
  if (mainBtn) {
    mainBtn.textContent = newStatus === "LIVE" ? "CONCLUDI" : "INIZIA";
    mainBtn.classList.toggle("active", newStatus === "LIVE");
  }
  
  let freshMatch = null;
  
  try {
    // 2. Invia stato al backend
    await ApiClient.updateMatchStatus(match.MATCH_ID, newStatus);
    
    // 3. Aggiorna dati match dal backend
    const fullData = await ApiClient.getMatchFull(match.MATCH_ID);
    if (fullData?.match) {
      freshMatch = fullData.match;
      window.APP_STATE.lastMatch = freshMatch;
      window.APP_STATE.matchesById[freshMatch.MATCH_ID] = freshMatch;
      
      // Aggiorna cache locale
      if (window.APP_CACHE.matches) {
        const idx = window.APP_CACHE.matches.findIndex(m => m.MATCH_ID === freshMatch.MATCH_ID);
        if (idx >= 0) {
          window.APP_CACHE.matches[idx] = { ...window.APP_CACHE.matches[idx], ...freshMatch };
          CacheManager.save(window.APP_CACHE);
        }
      }
      
      // Aggiorna banner MVP se già disponibile
      if (freshMatch.MVP) {
        updateMVPBanner(freshMatch);
      }
      
      // Aggiorna giocatori
      loadPlayersForMatch(freshMatch);
    }
    
    // 4. Se FINITA, gestisci MVP in background
    if (newStatus === "FINITA") {
      console.log("🏆 Partita conclusa. Gestione MVP in background...");
      (async () => {
        try {
          if (!freshMatch) return;
          await submitAllMVPVotes(freshMatch.MATCH_ID);
          await ApiClient.finalizeMVP(freshMatch.MATCH_ID);
          pollForMVPUpdate(freshMatch.MATCH_ID);
        } catch (err) {
          console.error("Errore background MVP:", err);
        }
      })();
    } else {
      refreshStandingsDebounced(500);
    }
    
  } catch (error) {
    console.error('Errore toggle match:', error);
    alert("Errore durante l'aggiornamento: " + error.message);
    // Rollback UI se fallisce
    match.STATO_PARTITA = newStatus === "FINITA" ? "LIVE" : "FINITA";
    updateMatchUI(match);
  }
}

function renderEvents(events, match) {
const container = document.getElementById("eventsContent");
if (!container) return;

if (!events?.length) {
container.innerHTML = `
<div class="empty-events-grid">
<div class="empty-team-events"><div class="empty-events-text">Nessun evento</div><div class="empty-events-icon">📋</div></div>
<div class="empty-team-events"><div class="empty-events-text">Nessun evento</div><div class="empty-events-icon">📋</div></div>
</div>`;
return;
}

// Filtra e ordina eventi - INCLUDI ANCHE I RIGORI
events = [...events]
.filter(e => {
const minuto = Number(e.MINUTO) || 0;
// Accetta GOAL, AMMONIZIONE, ESPULSIONE e RIGORI
const isStandard = ["GOAL", "AMMONIZIONE", "ESPULSIONE"].includes(e.TIPO);
const isRigore = e.TIPO && e.TIPO.toString().includes("RIGORE");
return minuto > 0 && e.TEAM_ID && (isStandard || isRigore);
})
.sort((a, b) => (Number(a.MINUTO) || 0) - (Number(b.MINUTO) || 0));

let html = "";

events.forEach(e => {
const teamId = String(e.TEAM_ID || "").trim();
const casaId = String(match.CASA_ID || "").trim();
const trasfertaId = String(match.TRASFERTA_ID || "").trim();
const isCasa = teamId === casaId;
const isTrasferta = teamId === trasfertaId;

// 🔥 ICONE AGGIORNATE PER INCLUDERE I RIGORI
let icon = "⚽";
let tipoDisplay = "";

if (e.TIPO === "GOAL") {
icon = "⚽";
} else if (e.TIPO === "AMMONIZIONE") {
icon = "🟨";
} else if (e.TIPO === "ESPULSIONE") {
icon = "🟥";
} else if (e.TIPO === "RIGORE_SEGNO") {
icon = "🥅"; // Icona porta per rigore segnato
tipoDisplay = " (Rigore)";
} else if (e.TIPO === "RIGORE_SBAGLIO") {
icon = "❌"; // X rossa per rigore sbagliato
tipoDisplay = " (Rigore)";
}

const deleteBtn = e.EVENT_ID
? `<span class="event-options" onclick="openEventMenu(event, '${e.EVENT_ID}', '${match.MATCH_ID}')">⋮</span>`
: '';

// Formatta il testo dell'evento
let playerText = (e.PLAYER || "").toUpperCase();
if (tipoDisplay) {
playerText += `<span style="font-size:0.85em; color:#888">${tipoDisplay}</span>`;
}
if (e.ASSIST) {
playerText += ` <span class="assist">(${(e.ASSIST).toUpperCase()})</span>`;
}

html += `
<div class="event-line ${isCasa ? "left" : "right"}" data-event-id="${e.EVENT_ID || ''}">
<div class="event-content">
<span class="event-minute">${e.MINUTO}'</span>
<span class="event-icon">${icon}</span>
<span class="event-player">
${playerText}
</span>
${deleteBtn}
</div>
</div>`;
});

container.innerHTML = html;
}

function openEventMenu(ev, eventId, matchId) {
  ev.stopPropagation();
  ev.preventDefault();
  
  // Rimuovi menu esistenti
  document.querySelectorAll(".event-popup-menu").forEach(e => e.remove());
  
  const menu = document.createElement("div");
  menu.className = "event-popup-menu";
  menu.innerHTML = `<div onclick="deleteEvent('${eventId}', '${matchId}'); this.parentElement.remove()">🗑 Elimina evento</div>`;
  menu.style.cssText = `
    position: fixed;
    left: ${ev.clientX}px;
    top: ${ev.clientY}px;
    background: white;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 8px 0;
    z-index: 10000;
    min-width: 140px;
  `;
  
  const menuItem = menu.querySelector("div");
  menuItem.style.cssText = `
    padding: 8px 16px;
    cursor: pointer;
    font-size: 13px;
    color: #333;
  `;
  menuItem.onmouseover = () => menuItem.style.background = "#f5f5f5";
  menuItem.onmouseout = () => menuItem.style.background = "white";
  
  menu.onclick = e => e.stopPropagation();
  document.body.appendChild(menu);
  
  // Chiudi cliccando fuori
  setTimeout(() => {
    const close = e => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", close);
      }
    };
    document.addEventListener("click", close, { once: true });
  }, 0);
}

async function deleteEvent(eventId, matchId) {
  if (!confirm("Eliminare evento?")) return;
  
  // 🔥 1. Forziamo tutto a STRINGA per il confronto
  const strEventId = String(eventId);
  const strMatchId = String(matchId);
  
  const events = window.APP_CACHE.eventsByMatch?.[strMatchId] || [];
  
  // 🔥 2. Filtriamo via l'evento
  const newEvents = events.filter(e => String(e.EVENT_ID) !== strEventId);
  
  // Se non ha trovato nulla da rimuovere, usciamo
  if (newEvents.length === events.length) {
    console.warn("Evento non trovato in cache locale:", strEventId);
  }

  // 🔥 3. Aggiorniamo la cache subito
  window.APP_CACHE.eventsByMatch[strMatchId] = newEvents;
  CacheManager.save(window.APP_CACHE);
  
  // 🔥 4. Ricalcolo Punteggio Locale
  const match = window.APP_STATE.lastMatch;
  if (match && String(match.MATCH_ID) === strMatchId) {
    
    // Troviamo l'evento eliminato per sapere se era un gol
    const deletedEvent = events.find(e => String(e.EVENT_ID) === strEventId);
    
    if (deletedEvent && deletedEvent.TIPO === 'GOAL') {
      const isCasa = String(deletedEvent.TEAM_ID) === String(match.CASA_ID);
      
      if (isCasa) {
        match.GOL_CASA = Math.max(0, (Number(match.GOL_CASA) || 0) - 1);
      } else {
        match.GOL_TRASFERTA = Math.max(0, (Number(match.GOL_TRASFERTA) || 0) - 1);
      }
      
     // 🔥 AGGIORNA CACHE GLOBALE (preservando nomi/loghi)
if (window.APP_CACHE.matches) {
  const idx = window.APP_CACHE.matches.findIndex(m => String(m.MATCH_ID) === String(matchId));
  if (idx >= 0) {
    const existingMatch = window.APP_CACHE.matches[idx];
    window.APP_CACHE.matches[idx] = {
      ...existingMatch,  // ← PRESERVA TUTTO
      GOL_CASA: match.GOL_CASA,
      GOL_TRASFERTA: match.GOL_TRASFERTA
    };
    CacheManager.save(window.APP_CACHE);
  }
}
      
      // Aggiorna UI Punteggio
      const scoreEl = document.querySelector(".score-big");
      if (scoreEl) {
        scoreEl.textContent = `${match.GOL_CASA} - ${match.GOL_TRASFERTA}`;
      }
    }
    
    // 🔥 5. Ridisegna subito la lista eventi (senza quello cancellato)
    renderEvents(newEvents, match);
    
    // Aggiorna tab giocatori
    renderPlayersTab(
      window.APP_CACHE.fullTeams?.[String(match.CASA_ID)],
      window.APP_CACHE.fullTeams?.[String(match.TRASFERTA_ID)],
      match
    );
  }
  
  // 🔥 6. Chiamata al Backend (Fire and forget)
  try {
    await ApiClient.deleteEventAdmin(strEventId);
    refreshStandingsDebounced(500);
  } catch (error) {
    console.error('Errore eliminazione backend:', error);
    alert('Errore eliminazione: ' + error.message);
  }
}

// 🔥 FUNZIONE HELPER PER AGGIORNARE PUNTEGGIO LOCALE
function updateScoreLocally(matchId, eventId) {
  const match = window.APP_STATE.lastMatch;
  if (!match) return;
  
  const events = window.APP_CACHE.eventsByMatch?.[matchId] || [];
  const event = events.find(e => e.EVENT_ID === eventId);
  
  if (event?.TIPO === 'GOAL') {
    // Decrementa gol squadra
    const isCasa = String(event.TEAM_ID) === String(match.CASA_ID);
    if (isCasa) {
      match.GOL_CASA = Math.max(0, (match.GOL_CASA || 0) - 1);
    } else {
      match.GOL_TRASFERTA = Math.max(0, (match.GOL_TRASFERTA || 0) - 1);
    }
    
    // Aggiorna UI punteggio
    const scoreEl = document.querySelector(".score-big");
    if (scoreEl) {
      scoreEl.textContent = `${match.GOL_CASA || 0} - ${match.GOL_TRASFERTA || 0}`;
    }
  }
}

function updateMatchUI(match) {
  const statusEl = document.getElementById("matchStatus"), 
        btn = document.querySelector(".start-btn");
  if (!statusEl || !btn) return;
  
  if (match.STATO_PARTITA === "LIVE") {
    statusEl.innerHTML = "LIVE"; 
    statusEl.classList.add("live");
    btn.textContent = "CONCLUDI"; 
    btn.classList.add("active");
  }
  else if (match.STATO_PARTITA === "SUPP") {
    statusEl.innerHTML = "SUPP"; 
    statusEl.classList.add("live");
    btn.textContent = "CONCLUDI"; 
    btn.classList.add("active");
  }
  else if (match.STATO_PARTITA === "RIGORI") {  // 🔥 AGGIUNTO
    statusEl.innerHTML = "RIGORI"; 
    statusEl.classList.add("live");
    btn.textContent = "CONCLUDI"; 
    btn.classList.add("active");
  }
  else if (match.STATO_PARTITA === "FINITA") {
    statusEl.textContent = "TERMINATA"; 
    statusEl.classList.remove("live");
    btn.textContent = "INIZIO"; 
    btn.classList.remove("active");
  }
  else {
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
    mvpBox.style.display = "flex";
  } else {
    mvpBox.innerHTML = "";
    mvpBox.classList.remove("show");
    mvpBox.style.display = "none";
  }
}

function addEvent(team) {
  // 🔥 RECUPERA MATCH DA PIÙ FONTI
  let match = window.APP_STATE.lastMatch;
  
  // Se lastMatch è incompleto, cerca altrove
  if (!match || !match.CASA_ID || !match.TRASFERTA_ID) {
    const matchId = window.APP_STATE.currentMatchId;
    
    // 1. Cerca in matchesById
    match = window.APP_STATE.matchesById?.[matchId];
    
    // 2. Cerca in APP_CACHE.matches
    if (!match?.CASA_ID) {
      match = window.APP_CACHE.matches?.find(m => String(m.MATCH_ID) === String(matchId));
    }
    
    // 3. Cerca in APP_STATE.matchesById (fallback)
    if (!match?.CASA_ID) {
      match = window.APP_STATE.matchesById?.[matchId];
    }
  }
  
  console.log('🔍 DEBUG addEvent:', {
    matchExists: !!match,
    matchId: match?.MATCH_ID,
    casaId: match?.CASA_ID,
    trasfertaId: match?.TRASFERTA_ID,
    squadraCasa: match?.SQUADRA_CASA,
    squadraTrasferta: match?.SQUADRA_TRASFERTA
  });
  
  // Validazione finale
  if (!match) {
    alert("Partita non caricata. Ricarica la pagina.");
    return;
  }
  
  if (!match.CASA_ID || !match.TRASFERTA_ID) {
    console.error('❌ ID squadra mancanti!', match);
    alert("Errore: dati squadra incompleti. Ricarica la pagina o seleziona di nuovo la partita.");
    return;
  }
  
  if (match.STATO_PARTITA !== "LIVE") {
    alert("La partita non è in corso");
    return;
  }
  
  if (match.FASE === "GIRONI" && window.APP_CACHE.meta?.finalStageStarted) {
    alert("Impossibile modificare eventi: fase finale iniziata");
    return;
  }
  
  openEventPopup(team);
}

// 🔥 Funzione helper per il popup evento
function openEventPopup(team) {
  const match = window.APP_STATE.lastMatch;
  
  if (!match) {
    alert("Partita non caricata correttamente");
    return;
  }
  
  // 🔥 Recupera teamId in modo sicuro
  const teamId = team === "casa" 
    ? String(match.CASA_ID || "").trim() 
    : String(match.TRASFERTA_ID || "").trim();
    
  const teamName = team === "casa" ? match.SQUADRA_CASA : match.SQUADRA_TRASFERTA;
  
  // 🔥 Validazione più precisa
  if (!teamId || teamId === "undefined" || teamId === "null" || teamId === "") {
    console.error('❌ teamId invalido:', { team, match });
    alert("Errore: ID squadra non valido. Ricarica la pagina.");
    return;
  }
  
  const modal = document.createElement("div");
  modal.className = "modalOverlay";
  modal.innerHTML = `
    <div class="modalBox" id="eventBox">
      <div class="modalTitle">NUOVO EVENTO - ${teamName || "???"}</div>
      <div class="match-form">
        <select id="eventType" class="match-select">
          <option value="GOAL">⚽ Gol</option>
          <option value="AMMONIZIONE">🟨 Ammonizione</option>
          <option value="ESPULSIONE">🟥 Espulsione</option>
        </select>
        <input id="eventMinute" class="match-input" type="number" placeholder="Minuto" min="1" max="120">
        <select id="eventPlayer" class="match-select"><option value="">Caricamento...</option></select>
        <select id="eventAssist" class="match-select"><option value="">Nessun assist</option></select>
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
  
  // 🔥 Flag per tracciare se l'utente ha già selezionato
  let userHasSelected = false;
  
  // 🔥 Ascolta cambiamenti selezione
  const playerSelect = document.getElementById("eventPlayer");
  if (playerSelect) {
    playerSelect.addEventListener('change', () => {
      userHasSelected = true;
      console.log('👤 Utente ha selezionato giocatore:', playerSelect.value);
    }, { once: false });
  }
  
  // 🔥 Carica dalla cache SUBITO
  const cachedTeam = window.APP_CACHE.fullTeams?.[teamId];
  const cachedPlayers = cachedTeam?.players || [];
  
  if (cachedPlayers.length > 0) {
    populateEventSelects(cachedPlayers, false); // Prima volta: no preserve
  }
  
  // 🔥 Refresh da backend: PRESERVA selezione se l'utente ha già scelto
  ApiClient.getPlayersByTeam(teamId)
    .then(freshPlayers => {
      if (!window.APP_CACHE.fullTeams) window.APP_CACHE.fullTeams = {};
      window.APP_CACHE.fullTeams[teamId] = { 
        team: cachedTeam?.team || {}, 
        players: freshPlayers || [] 
      };
      CacheManager.save(window.APP_CACHE);
      
      // 🔥 Chiave: preserveSelections = userHasSelected
      if (document.getElementById("eventPlayer")) {
        populateEventSelects(freshPlayers, userHasSelected);
      }
    })
    .catch(err => console.error('Errore refresh giocatori:', err));
}

function populateEventSelects(players, preserveSelections = true) {
  const playerSelect = document.getElementById("eventPlayer");
  const assistSelect = document.getElementById("eventAssist");
  
  if (!playerSelect || !assistSelect) return;
  
  // 🔥 SALVA SELEZIONI CORRENTI prima di ricostruire
  const selectedPlayer = preserveSelections ? playerSelect.value : "";
  const selectedAssist = preserveSelections ? assistSelect.value : "";
  
  console.log('🔄 populateEventSelects:', { 
    playersCount: players?.length, 
    preserve: preserveSelections,
    wasPlayerSelected: selectedPlayer,
    wasAssistSelected: selectedAssist
  });
  
  let playerOpts = `<option value="">Seleziona giocatore</option>`;
  let assistOpts = `<option value="">Nessun assist</option>`;
  
  (players || []).forEach(p => {
    const name = (p.NOME || "").toUpperCase();
    const pid = String(p.PLAYER_ID); // 🔥 Forza stringa
    playerOpts += `<option value="${pid}">${name}</option>`;
    assistOpts += `<option value="${pid}">${name}</option>`;
  });
  
  playerSelect.innerHTML = playerOpts;
  assistSelect.innerHTML = assistOpts;
  
  // 🔥 RIPRISTINA SELEZIONI se esistevano e sono ancora valide
  if (preserveSelections && selectedPlayer) {
    const playerStillExists = players?.some(p => String(p.PLAYER_ID) === String(selectedPlayer));
    if (playerStillExists) {
      playerSelect.value = selectedPlayer;
      console.log('✅ Ripristinata selezione giocatore:', selectedPlayer);
    }
  }
  
  if (preserveSelections && selectedAssist) {
    const assistStillExists = players?.some(p => String(p.PLAYER_ID) === String(selectedAssist));
    if (assistStillExists) {
      assistSelect.value = selectedAssist;
      console.log('✅ Ripristinata selezione assist:', selectedAssist);
    }
  }
}

async function saveEvent(team) {
  const match = window.APP_STATE.lastMatch;
  if (!match) { alert("Partita non caricata"); return; }
  
  const type = document.getElementById("eventType")?.value;
  const minute = parseInt(document.getElementById("eventMinute")?.value);
  const playerId = document.getElementById("eventPlayer")?.value;
  const assistId = document.getElementById("eventAssist")?.value || "";
  
  if (!type || !minute || minute < 1 || !playerId) {
    alert("Compila tutti i campi");
    return;
  }
  
  const teamId = String(team === "casa" ? match.CASA_ID : match.TRASFERTA_ID);
  
  // 🔥 Trova nome giocatore
  const players = window.APP_CACHE.fullTeams?.[teamId]?.players || [];
  const player = players.find(p => String(p.PLAYER_ID) === String(playerId));
  const playerName = player?.NOME || "";
  
  const assistPlayer = assistId ? players.find(p => String(p.PLAYER_ID) === String(assistId)) : null;
  const assistName = assistPlayer?.NOME || "";
  
  // 🔥 1. AGGIUNGI EVENTO ALLA CACHE LOCALE (Immediato)
  const tempEvent = {
    EVENT_ID: 'temp_' + Date.now(),
    MATCH_ID: match.MATCH_ID,
    TEAM_ID: teamId,
    TIPO: type,
    MINUTO: minute,
    PLAYER_ID: playerId,
    PLAYER: playerName,
    ASSIST: assistName
  };
  
  if (!window.APP_CACHE.eventsByMatch) window.APP_CACHE.eventsByMatch = {};
  if (!window.APP_CACHE.eventsByMatch[match.MATCH_ID]) {
    window.APP_CACHE.eventsByMatch[match.MATCH_ID] = [];
  }
  window.APP_CACHE.eventsByMatch[match.MATCH_ID].push(tempEvent);
  
  // 🔥 2. AGGIORNA UI IMMEDIATAMENTE (L'utente vede subito l'evento)
  renderEvents(window.APP_CACHE.eventsByMatch[match.MATCH_ID], match);
  renderPlayersTab(
    window.APP_CACHE.fullTeams?.[String(match.CASA_ID)],
    window.APP_CACHE.fullTeams?.[String(match.TRASFERTA_ID)],
    match
  );
  
  // 🔥 3. CALCOLA PUNTEGGIO DAGLI EVENTI LOCALI
  updateScoreFromEvents(match.MATCH_ID);
  
  // 🔥 4. CHIUDI POPUP SUBITO
  document.querySelector(".modalOverlay")?.remove();
  
  // 🔥 5. SALVA SUL BACKEND (Background)
  // 🔥 FIX: Rimossa la chiamata a getEventsAdmin subito dopo il salvataggio.
  // Chiederla subito rischiava di sovrascrivere i dati locali con dati vecchi del server (latenza).
  ApiClient.addEventAdmin(match.MATCH_ID, teamId, type, minute, playerId, assistId)
    .then(() => {
      // Aggiorna solo la classifica globale, la lista eventi resta quella locale finché non ricarichi la pagina
      refreshStandingsDebounced(500);
    })
    .catch(error => {
      console.error('Errore salvataggio:', error);
      if (error.message?.includes('teamId') || error.message?.includes('non valido')) {
        alert('Errore: ' + error.message);
        location.reload();
      }
    });
}

// 🔥 Aggiungi questa funzione (fuori da saveEvent)
function updateScoreFromEvents(matchId) {
  const match = window.APP_STATE.lastMatch;
  if (!match) return;
  
  const events = window.APP_CACHE.eventsByMatch?.[matchId] || [];
  const goals = events.filter(e => e.TIPO === 'GOAL');
  
  let golCasa = 0;
  let golTrasferta = 0;
  
  goals.forEach(g => {
    if (String(g.TEAM_ID) === String(match.CASA_ID)) {
      golCasa++;
    } else if (String(g.TEAM_ID) === String(match.TRASFERTA_ID)) {
      golTrasferta++;
    }
  });
  
  // Aggiorna UI
  const scoreEl = document.querySelector(".score-big");
  if (scoreEl) {
    scoreEl.textContent = `${golCasa} - ${golTrasferta}`;
  }
}

async function toggleMatch() {
  const match = window.APP_STATE.lastMatch;
  if (!match) return;
  
  const newStatus = match.STATO_PARTITA === "LIVE" ? "FINITA" : "LIVE";
  
  // 🔥 1. AGGIORNA STATO LOCALE E UI SUBITO (Istantaneo)
  match.STATO_PARTITA = newStatus;
  window.APP_STATE.lastMatch = match;
  
  // Aggiorna il pulsante INIZIO/CONCLUDI e lo stato
  updateMatchUI(match);
  
  // 🔥 2. GESTISCI PULSANTI EVENTI IN BASE ALLO STATO
  const canAddEvents = (newStatus === "LIVE" || newStatus === "SUPP") && 
    (match.FASE === "FINALI" || !window.APP_CACHE.meta?.finalStageStarted);
  
  document.querySelectorAll('.phase-btn.small').forEach(btn => {
    if (btn.textContent.trim().includes('+ EVENTO')) {
      if (canAddEvents) {
        // 🔥 ABILITA PULSANTI
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
        // Ripristina gli onclick
        if (btn.textContent.includes('CASA')) {
          btn.onclick = () => addEvent('casa');
        } else if (btn.textContent.includes('TRASFERTA')) {
          btn.onclick = () => addEvent('trasferta');
        }
      } else {
        // 🔥 DISABILITA PULSANTI
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
        btn.style.cursor = 'not-allowed';
        btn.onclick = null;
      }
    }
  });
  
  const mainBtn = document.querySelector(".start-btn");
  if (mainBtn) {
    mainBtn.textContent = newStatus === "LIVE" ? "CONCLUDI" : "INIZIA";
    mainBtn.classList.toggle("active", newStatus === "LIVE");
  }
  
  let freshMatch = null;
  
  try {
    // 2. Invia stato al backend
    await ApiClient.updateMatchStatus(match.MATCH_ID, newStatus);
    
    // 3. Aggiorna dati match dal backend
    const fullData = await ApiClient.getMatchFull(match.MATCH_ID);
    if (fullData?.match) {
      freshMatch = fullData.match;
      window.APP_STATE.lastMatch = freshMatch;
      window.APP_STATE.matchesById[freshMatch.MATCH_ID] = freshMatch;
      
      // Aggiorna cache locale
      if (window.APP_CACHE.matches) {
        const idx = window.APP_CACHE.matches.findIndex(m => m.MATCH_ID === freshMatch.MATCH_ID);
        if (idx >= 0) {
          window.APP_CACHE.matches[idx] = { ...window.APP_CACHE.matches[idx], ...freshMatch };
          CacheManager.save(window.APP_CACHE);
        }
      }
      
      // Aggiorna banner MVP se già disponibile
      if (freshMatch.MVP) {
        updateMVPBanner(freshMatch);
      }
      
      // Aggiorna giocatori
      loadPlayersForMatch(freshMatch);
    }
    
    // 4. Se FINITA, gestisci MVP in background
    if (newStatus === "FINITA") {
      console.log("🏆 Partita conclusa. Gestione MVP in background...");
      (async () => {
        try {
          if (!freshMatch) return;
          await submitAllMVPVotes(freshMatch.MATCH_ID);
          await ApiClient.finalizeMVP(freshMatch.MATCH_ID);
          pollForMVPUpdate(freshMatch.MATCH_ID);
        } catch (err) {
          console.error("Errore background MVP:", err);
        }
      })();
    } else {
      refreshStandingsDebounced(500);
    }
    
  } catch (error) {
    console.error('Errore toggle match:', error);
    alert("Errore durante l'aggiornamento: " + error.message);
    // Rollback UI se fallisce
    match.STATO_PARTITA = newStatus === "FINITA" ? "LIVE" : "FINITA";
    updateMatchUI(match);
  }
}

// ============================================================================
// 🎯 SUPPLEMENTARI E RIGORI - FASE FINALE
// ============================================================================

function toggleSupplementari() {
  const match = window.APP_STATE.lastMatch;
  if (!match || match.STATO_PARTITA !== "LIVE") return;

  // 🔥 1. Aggiorna stato locale a SUPP
  match.STATO_PARTITA = "SUPP";
  window.APP_STATE.lastMatch = match;

  // 🔥 2. Aggiorna UI immediatamente
  updateMatchUI(match);

  // 🔥 3. Mantieni attivi i pulsanti + EVENTO
  document.querySelectorAll('.phase-btn.small').forEach(btn => {
    if (btn.textContent.trim().includes('+ EVENTO')) {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.cursor = 'pointer';
      // Ripristina onclick se erano stati rimossi
      if (btn.textContent.includes('CASA')) btn.onclick = () => addEvent('casa');
      if (btn.textContent.includes('TRASFERTA')) btn.onclick = () => addEvent('trasferta');
    }
  });

  // 🔥 4. Invia al backend (fire & forget)
  ApiClient.updateMatchStatus(match.MATCH_ID, "SUPP")
    .then(() => console.log('✅ Stato SUPP inviato al backend'))
    .catch(err => console.error('❌ Errore update supplementari:', err));
}

function openRigoriPopup(directMode = false) {
    const match = window.APP_STATE.lastMatch;
    if (!match) return;

    // Recupera dati squadre
    const casaData = window.APP_CACHE.fullTeams?.[String(match.CASA_ID)]?.team;
    const trasfData = window.APP_CACHE.fullTeams?.[String(match.TRASFERTA_ID)]?.team;
    const casaNome = casaData?.NOME_SQUADRA || match.SQUADRA_CASA;
    const trasfNome = trasfData?.NOME_SQUADRA || match.SQUADRA_TRASFERTA;
    const casaLogo = casaData?.LOGO_FILE_ID || casaData?.LOGO_ID;
    const trasfLogo = trasfData?.LOGO_FILE_ID || trasfData?.LOGO_ID;

    // 🔥 RECUPERA STATO DA CACHE O CREA NUOVO
    const storageKey = `rigori_${match.MATCH_ID}`;
    const savedState = localStorage.getItem(storageKey);
    let rigoriState = savedState ? JSON.parse(savedState) : {
        fase: directMode ? 'tiri' : 'selezione',
        casaScore: 0,
        trasfScore: 0,
        currentKicker: 'casa',
        history: [],
        finished: false
    };

    // 🔥 FIX: Forza i punteggi a numeri interi (evita bug del risultato bloccato)
    rigoriState.casaScore = parseInt(rigoriState.casaScore) || 0;
    rigoriState.trasfScore = parseInt(rigoriState.trasfScore) || 0;

    // 🔥 SALVA STATO IN LOCALSTORAGE
    function saveRigoriState() {
        localStorage.setItem(storageKey, JSON.stringify(rigoriState));
    }

    // Crea popup HTML
    const popup = document.createElement('div');
    popup.className = 'rigori-popup-overlay';
    popup.id = 'rigoriPopupOverlay';
    popup.innerHTML = `
        <div class="rigori-popup" style="max-width: 700px;">
            <!-- Header -->
            <div class="rigori-header" style="text-align: center; margin-bottom: 30px; position: relative;">
                <div style="position: absolute; right: 20px; top: 15px; cursor: pointer; font-size: 42px; color: #7a1e2c; line-height: 1; z-index: 10; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 8px; transition: all 0.2s ease; font-weight: 300;" onclick="closeRigoriPopup()" onmouseover="this.style.background='#7a1e2c';this.style.color='#fff';this.style.transform='rotate(90deg)'" onmouseout="this.style.background='';this.style.color='#7a1e2c';this.style.transform='rotate(0deg)'">×</div>
                <div class="rigori-title" style="font-size: 32px; font-weight: 800; color: #7a1e2c; letter-spacing: 2px;">CALCI DI RIGORE</div>
            </div>

            <!-- FASE 1: SELEZIONE CHI INIZIA -->
            <div id="rigori-selezione" style="text-align: center; padding: 20px; ${directMode ? 'display:none;' : ''}">
                <div style="font-size: 18px; margin-bottom: 30px; color: #666;">Chi calcia per primo?</div>
                <div style="display: flex; justify-content: center; gap: 60px; margin: 30px 0; flex-wrap: wrap;">
                    <div class="rigori-team-select" onclick="startRigori('casa')" style="text-align: center; padding: 20px; cursor: pointer; transition: transform 0.2s;">
                        ${casaLogo ? `<img src="${getCachedImage(casaLogo, 80)}" style="width: 80px; height: 80px; margin-bottom: 15px;">` : '<div style="width: 80px; height: 80px; background: #f0f0f0; margin: 0 auto 15px;"></div>'}
                        <div style="font-weight: 700; font-size: 16px;">${casaNome}</div>
                        <div style="font-size: 12px; color: #888; margin-top: 8px;">Clicca per iniziare</div>
                    </div>
                    <div style="display: flex; align-items: center; font-size: 28px; font-weight: 700; color: #8c1d2c;">VS</div>
                    <div class="rigori-team-select" onclick="startRigori('trasferta')" style="text-align: center; padding: 20px; cursor: pointer; transition: transform 0.2s;">
                        ${trasfLogo ? `<img src="${getCachedImage(trasfLogo, 80)}" style="width: 80px; height: 80px; margin-bottom: 15px;">` : '<div style="width: 80px; height: 80px; background: #f0f0f0; margin: 0 auto 15px;"></div>'}
                        <div style="font-weight: 700; font-size: 16px;">${trasfNome}</div>
                        <div style="font-size: 12px; color: #888; margin-top: 8px;">Clicca per iniziare</div>
                    </div>
                </div>
            </div>

            <!-- FASE 2: TIRI DI RIGORE -->
            <div id="rigori-tiri" style="display: ${directMode ? 'block' : 'none'};">
                <!-- Squadre con loghi ESTERNI -->
                <div class="rigori-teams" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding: 0 20px;">
                    
                    <!-- Squadra Casa -->
                    <div class="rigori-team" id="rigori-casa" style="text-align: center; flex: 1; display: flex; flex-direction: column; align-items: center;">
                        ${casaLogo ? `<img src="${getCachedImage(casaLogo, 70)}" alt="${casaNome}" style="width: 70px; height: 70px; margin-bottom: 10px;">` : '<div style="width: 70px; height: 70px; background: #f0f0f0; margin: 0 auto 10px;"></div>'}
                        <div class="team-name" style="font-weight: 700; font-size: 15px; margin-bottom: 8px;">${casaNome}</div>
                        <!-- Container Bollini SOTTO -->
                        <div class="rigori-kicks" id="kicks-casa" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; width: 100%; max-width: 180px;"></div>
                    </div>

                    <!-- Punteggio CENTRALE -->
                    <div class="rigori-score-center" style="text-align: center; flex: 0 0 150px;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 10px;">
                            <div class="rigori-score" id="score-casa" style="font-size: 56px; font-weight: 900; color: #7a1e2c; line-height: 1;">${rigoriState.casaScore}</div>
                            <div style="font-size: 32px; font-weight: 700; color: #999;">-</div>
                            <div class="rigori-score" id="score-trasferta" style="font-size: 56px; font-weight: 900; color: #7a1e2c; line-height: 1;">${rigoriState.trasfScore}</div>
                        </div>
                    </div>

                    <!-- Squadra Trasferta -->
                    <div class="rigori-team" id="rigori-trasferta" style="text-align: center; flex: 1; display: flex; flex-direction: column; align-items: center;">
                        ${trasfLogo ? `<img src="${getCachedImage(trasfLogo, 70)}" alt="${trasfNome}" style="width: 70px; height: 70px; margin-bottom: 10px;">` : '<div style="width: 70px; height: 70px; background: #f0f0f0; margin: 0 auto 10px;"></div>'}
                        <div class="team-name" style="font-weight: 700; font-size: 15px; margin-bottom: 8px;">${trasfNome}</div>
                        <!-- Container Bollini SOTTO -->
                        <div class="rigori-kicks" id="kicks-trasferta" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; width: 100%; max-width: 180px;"></div>
                    </div>
                </div>

                <!-- Semaforo centrale -->
                <div class="rigori-center" style="text-align: center; margin: 40px 0;">
                    <div class="rigori-indicator" id="rigori-indicator" style="width: 120px; height: 120px; border-radius: 50%; background: #555; margin: 0 auto 20px; box-shadow: inset 0 -15px 25px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.2); transition: all 0.3s ease;"></div>
                    <div class="rigori-current" id="rigori-current" style="font-size: 20px; color: #333; font-weight: 700; letter-spacing: 1px;">${rigoriState.currentKicker === 'casa' ? casaNome : trasfNome}</div>
                </div>

                <!-- Pulsanti -->
                <div class="rigori-controls" style="display: flex; justify-content: center; gap: 50px; margin: 40px 0;">
                    <button class="rigori-btn miss" id="btn-miss" style="width: 100px; height: 100px; border-radius: 50%; border: none; background: #ef4444; cursor: pointer; box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4); transition: transform 0.2s; font-size: 16px; font-weight: 700; color: white;"></button>
                    <button class="rigori-btn goal" id="btn-goal" style="width: 100px; height: 100px; border-radius: 50%; border: none; background: #22c55e; cursor: pointer; box-shadow: 0 6px 20px rgba(34, 197, 94, 0.4); transition: transform 0.2s; font-size: 16px; font-weight: 700; color: white;"></button>
                </div>

                <!-- Pulsante FINE -->
                <button class="rigori-finish" id="rigori-finish" style="width: 100%; max-width: 300px; margin: 20px auto 0; padding: 12px 20px; background: #7a1e2c; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; letter-spacing: 1px; box-shadow: 0 2px 8px rgba(122, 30, 44, 0.3); display: block;" onclick="finishRigori()">
                    FINE
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // 🔥 STILI PER I BOLLINI
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .rigori-kicks {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: center;
            margin-top: 5px;
            min-height: 30px; /* Spazio riservato anche se vuoti */
        }
        .kick-indicator {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: inline-block;
            transition: all 0.3s ease;
        }
        .kick-indicator.goal {
            background: #22c55e;
            box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
        }
        .kick-indicator.miss {
            background: #ef4444;
            box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
        }
    `;
    document.head.appendChild(styleEl);

    // 🔥 RENDERIZZA BOLLINI ESISTENTI ALL'APERTURA
    renderKickIndicators();

    // 🔥 GESTIONE CLICK PULSANTI
    const btnMiss = document.getElementById('btn-miss');
    const btnGoal = document.getElementById('btn-goal');
    if (btnMiss) btnMiss.onclick = () => handleRigoreClick('miss');
    if (btnGoal) btnGoal.onclick = () => handleRigoreClick('goal');

    // 🔥 LOGICA INTERNA

    function renderKickIndicators() {
        const casaKicks = document.getElementById('kicks-casa');
        const trasfKicks = document.getElementById('kicks-trasferta');
        if (casaKicks) casaKicks.innerHTML = '';
        if (trasfKicks) trasfKicks.innerHTML = '';

        rigoriState.history.forEach(kick => {
            const kickEl = document.createElement('div');
            kickEl.className = `kick-indicator ${kick.result}`;
            if (kick.team === 'casa' && casaKicks) {
                casaKicks.appendChild(kickEl);
            } else if (kick.team === 'trasferta' && trasfKicks) {
                trasfKicks.appendChild(kickEl);
            }
        });
    }

    function handleRigoreClick(result) {
        if (rigoriState.finished) return;

        const currentTeam = rigoriState.currentKicker;
        const isGoal = result === 'goal';

        // 🔥 FIX: Incremento esplicito (evita bug con nomi dinamici)
        if (isGoal) {
            if (currentTeam === 'casa') {
                rigoriState.casaScore++;
            } else {
                rigoriState.trasfScore++;
            }
        }

        // Aggiungi alla storia
        rigoriState.history.push({
            team: currentTeam,
            result: result
        });

        // Salva e aggiorna UI
        saveRigoriState();
        updateUI();

        // 🔥 SEMAFORO: colora il cerchio
        const indicator = document.getElementById('rigori-indicator');
        indicator.style.background = isGoal ? '#22c55e' : '#ef4444';

        // Dopo 3 secondi: reset semaforo, aggiorna bollini, cambia turno
        setTimeout(() => {
            indicator.style.background = '#555';
            renderKickIndicators(); // Ridisegna bollini sotto

            // Cambio turno
            rigoriState.currentKicker = currentTeam === 'casa' ? 'trasferta' : 'casa';
            const nextTeam = rigoriState.currentKicker === 'casa' ? casaNome : trasfNome;
            document.getElementById('rigori-current').textContent = nextTeam;
            saveRigoriState();
        }, 3000);
    }

    function updateUI() {
        // 🔥 FIX: Aggiornamento esplicito dei numeri
        document.getElementById('score-casa').textContent = rigoriState.casaScore;
        document.getElementById('score-trasferta').textContent = rigoriState.trasfScore;
    }

    window.finishRigori = async () => {
        if (!confirm("Confermi la fine dei rigori?")) return;
        const rigoriData = {
            matchId: match.MATCH_ID,
            casaRigori: rigoriState.casaScore,
            trasfRigori: rigoriState.trasfScore,
            events: rigoriState.history.map((h, idx) => ({
                teamId: h.team === 'casa' ? match.CASA_ID : match.TRASFERTA_ID,
                type: h.result === 'goal' ? 'RIGORE_SEGNO' : 'RIGORE_SBAGLIO',
                minute: 120 + idx + 1
            }))
        };
        try {
            await ApiClient.saveRigoriResults(rigoriData);
            match.STATO_PARTITA = "FINITA";
            match.RIGORI_CASA = rigoriState.casaScore;
            match.RIGORI_TRASFERTA = rigoriState.trasfScore;
            window.APP_STATE.lastMatch = match;
            updateMatchUI(match);
            localStorage.removeItem(storageKey);
            setTimeout(() => {
                ApiClient.getMatchFull(match.MATCH_ID).then(data => {
                    if (data?.match) {
                        window.APP_STATE.lastMatch = data.match;
                        renderMatchPage(data.match);
                    }
                });
            }, 500);
            alert("✅ Rigori conclusi! Risultato salvato.");
            document.getElementById('rigoriPopupOverlay')?.remove();
        } catch (error) {
            console.error('Errore:', error);
            alert('Errore: ' + error.message);
        }
    };
}

// 🔥 FUNZIONE CHIUDI POPUP
function closeRigoriPopup() {
    const popup = document.getElementById('rigoriPopupOverlay');
    if (popup) {
        popup.remove();
    }
}

function closeRigoriPopup() {
    const popup = document.getElementById('rigoriPopupOverlay');
    if (popup) {
        popup.remove();
    }
}

function handleRigoreClick(result, state, match) {
    if (state.finished) return;
    
    const currentTeam = state.currentKicker;
    const isGoal = result === 'goal';

    // ✅ LOGICA CORRETTA PER ENTRAMBE LE SQUADRE
    if (isGoal) {
        if (currentTeam === 'casa') {
            state.casaScore++;
        } else {
            state.trasfScore++; // ✅ Incrementa anche il punteggio di destra!
        }
    }

    // Salva nello storico
    state.history.push({ team: currentTeam, result: result });
    
    // 🔥 SALVA STATO IN LOCALSTORAGE
    saveRigoriState(match.MATCH_ID, state);
    
    // Aggiorna UI punteggi (se il popup è aperto)
    updateRigoriUIIfExists(state);
    
    // Passa il turno all'altra squadra
    state.currentKicker = currentTeam === 'casa' ? 'trasferta' : 'casa';

    // Verifica se c'è un vincitore matematico
    if (checkRigoriWinner(state)) {
        state.finished = true;
    }
}

function updateRigoriUI(state, match) {
  // Aggiorna punteggi
  // 🔥 AGGIORNA ENTRAMBI I PUNTEGGI CORRETTAMENTE
const scoreCasaEl = document.getElementById('score-casa');
const scoreTrasfEl = document.getElementById('score-trasferta');

if (scoreCasaEl) scoreCasaEl.textContent = state.casaScore;
if (scoreTrasfEl) scoreTrasfEl.textContent = state.trasfScore;
  
  // Aggiorna indicatori
  const indicator = document.getElementById('rigori-indicator');
  const current = document.getElementById('rigori-current');
  const casaKicks = document.getElementById('kicks-casa');
  const trasfKicks = document.getElementById('kicks-trasferta');
  
  // Aggiorna bollino centrale
  const lastKick = state.history[state.history.length - 1];
  if (lastKick) {
    indicator.className = 'rigori-indicator ' + (lastKick.result === 'goal' ? 'goal' : 'miss');
    indicator.style.animation = 'pulseRigore 3s ease';
    
    setTimeout(() => {
      indicator.className = 'rigori-indicator';
      indicator.style.animation = '';
    }, 5000);
  }
  
  // Aggiorna nome squadra corrente
  const currentTeamName = state.currentKicker === 'casa' ? 
    (window.APP_CACHE.fullTeams?.[String(match.CASA_ID)]?.team?.NOME_SQUADRA || match.SQUADRA_CASA) :
    (window.APP_CACHE.fullTeams?.[String(match.TRASFERTA_ID)]?.team?.NOME_SQUADRA || match.SQUADRA_TRASFERTA);
  
  current.textContent = `Tocca a ${currentTeamName}`;

  // Aggiungi bollini sotto le squadre
  const addKickIndicator = (elementId, result) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      
      const kick = document.createElement('div');
      kick.className = `kick-indicator ${result === 'goal' ? 'goal' : 'miss'}`;
      el.appendChild(kick);
  };
  
  const last = state.history[state.history.length - 1];
  if (last) {
    addKickIndicator(last.team === 'casa' ? 'kicks-casa' : 'kicks-trasferta', last.result);
  }
}

// 🔥 SALVA STATO RIGORI IN LOCALSTORAGE
function saveRigoriState(matchId, state) {
    localStorage.setItem(`rigori_${matchId}`, JSON.stringify(state));
}

// 🔥 RENDERIZZA BOLLINI DATO UNO STATO
function renderKickIndicators(state, casaContainerId, trasfContainerId) {
    const casaKicks = document.getElementById(casaContainerId);
    const trasfKicks = document.getElementById(trasfContainerId);
    
    if (casaKicks) casaKicks.innerHTML = '';
    if (trasfKicks) trasfKicks.innerHTML = '';
    
    state.history.forEach(kick => {
        const kickEl = document.createElement('div');
        kickEl.className = `kick-indicator ${kick.result}`;
        kickEl.style.cssText = 'width: 22px; height: 22px; border-radius: 50%; margin: 2px; display: inline-block;';
        kickEl.style.background = kick.result === 'goal' ? '#22c55e' : '#ef4444';
        
        if (kick.team === 'casa' && casaKicks) {
            casaKicks.appendChild(kickEl);
        } else if (kick.team === 'trasferta' && trasfKicks) {
            trasfKicks.appendChild(kickEl);
        }
    });
}

// 🔥 AGGIORNA UI PUNTEGGI (solo se gli elementi esistono)
function updateRigoriUIIfExists(state) {
    const scoreCasaEl = document.getElementById('score-casa');
    const scoreTrasfEl = document.getElementById('score-trasferta');
    if (scoreCasaEl) scoreCasaEl.textContent = state.casaScore;
    if (scoreTrasfEl) scoreTrasfEl.textContent = state.trasfScore;
}

async function finishRigori(matchId, state, match) {
    if (!confirm("Confermi la fine dei rigori?")) return;
    
    const rigoriData = {
        matchId: matchId,
        casaRigori: state.casaScore,
        trasfRigori: state.trasfScore,
        events: state.history.map((h, idx) => ({
            teamId: h.team === 'casa' ? match.CASA_ID : match.TRASFERTA_ID,
            type: h.result === 'goal' ? 'RIGORE_SEGNO' : 'RIGORE_SBAGLIO',
            minute: 120 + idx + 1
        }))
    };
    
    try {
        // Salva risultati rigori
        await ApiClient.saveRigoriResults(rigoriData);
        
        // Aggiorna stato a FINITA con punteggi rigori
        match.STATO_PARTITA = "FINITA";
        match.RIGORI_CASA = state.casaScore;
        match.RIGORI_TRASFERTA = state.trasfScore;
        window.APP_STATE.lastMatch = match;
        updateMatchUI(match);
        
        // 🔥 RICARICA GLI EVENTI AGGIORNATI DAL BACKEND
        const freshEvents = await ApiClient.getEventsAdmin(matchId);
        window.APP_CACHE.eventsByMatch[matchId] = freshEvents;
        CacheManager.save(window.APP_CACHE);
        
        // Aggiorna la visualizzazione eventi
        renderEvents(freshEvents, match);
        
        // Pulisci localStorage
        localStorage.removeItem(`rigori_${matchId}`);
        
        // Chiudi popup
        document.getElementById('rigoriPopupOverlay')?.remove();
        
        // 🔥 Mostra indicatore DCR nella UI
        showDCRIndicator(state.casaScore, state.trasfScore);
        
        // 🔥 Aggiorna classifica
        refreshStandingsDebounced(500);
        
    } catch (error) {
        console.error('Errore:', error);
        alert('Errore: ' + error.message);
    }
}

function showDCRIndicator(casaScore, trasfScore) {
    // Cerca il banner MVP o il container degli eventi
    const target = document.getElementById("mvpBanner") || document.getElementById("eventsContent");
    if (!target) return;

    // Rimuovi eventuale card DCR precedente per evitare duplicati
    const existing = document.getElementById("dcrIndicator");
    if (existing) existing.remove();

    const dcrIndicator = document.createElement("div");
    dcrIndicator.id = "dcrIndicator";
    dcrIndicator.className = "dcr-indicator";
    dcrIndicator.innerHTML = `
        <div class="dcr-title">⚽ DCR - CALCI DI RIGORE</div>
        <div class="dcr-score">${casaScore} - ${trasfScore}</div>
    `;
    dcrIndicator.style.cssText = `
        background: linear-gradient(135deg, #7a1e2c 0%, #8c1d2c 100%);
        color: white;
        padding: 15px 20px;
        border-radius: 12px;
        text-align: center;
        margin: 15px 0;
        box-shadow: 0 4px 15px rgba(122, 30, 44, 0.3);
        animation: slideIn 0.3s ease;
    `;
    
    // Inserisci dopo l'MVP banner o prima degli eventi
    if (document.getElementById("mvpBanner")) {
        target.parentNode.insertBefore(dcrIndicator, target.nextSibling);
    } else {
        // Fallback: mettilo in cima alla cronaca
        const cronacaTitle = document.querySelector(".cronaca-title");
        if(cronacaTitle) cronacaTitle.parentNode.insertBefore(dcrIndicator, cronacaTitle.nextSibling);
    }

    // Aggiungi animazione CSS se non esiste
    if (!document.getElementById("dcr-style")) {
        const style = document.createElement('style');
        style.id = "dcr-style";
        style.textContent = `
            @keyframes slideIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .dcr-title { font-size: 14px; font-weight: 700; letter-spacing: 1px; margin-bottom: 5px; opacity: 0.9; }
            .dcr-score { font-size: 28px; font-weight: 900; }
        `;
        document.head.appendChild(style);
    }
}

// Funzione helper per aggiornare l'UI quando l'MVP è pronto
function pollForMVPUpdate(matchId) {
  let attempts = 0;
  const maxAttempts = 20; // Tenta per max 20 secondi
  
  const check = async () => {
    attempts++;
    try {
      const data = await ApiClient.getMatchFull(matchId);
      if (data?.match?.MVP) {
        console.log('🏆 MVP trovato:', data.match.MVP);
        window.APP_STATE.lastMatch = data.match;
        
        // Aggiorna Banner MVP
        updateMVPBanner(data.match);
        
        // Aggiorna Tab Giocatori (per mostrare la coroncina)
        loadPlayersForMatch(data.match);
        
        // Aggiorna Classifica
        refreshStandingsDebounced(500);
      } else if (attempts < maxAttempts) {
        setTimeout(check, 1000); // Riprova ogni secondo
      }
    } catch (e) {
      console.error('Errore polling MVP', e);
    }
  };
  
  setTimeout(check, 1000); // Primo controllo dopo 1 secondo
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
  
  // 🔥 FIX: Usa la cache locale specifica della partita per aggiornamenti immediati
  // Prima leggeva da window.APP_CACHE.events (lista globale) che non si aggiornava subito
  // Ora legge da eventsByMatch che contiene gli eventi appena inseriti
  const events = window.APP_CACHE.eventsByMatch?.[match.MATCH_ID] || [];
  
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
  
  // 🔥 CASO 1: Partita non iniziata o in pausa → MVP non disponibile
  if (!isLive && !isFinished) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#888;grid-column:1/-1">
        <div style="font-size:3rem;margin-bottom:16px">🎫</div>
        <div>La votazione MVP sarà disponibile durante la partita</div>
      </div>
    `;
    return;
  }
  
  // 🔥 CASO 2: Partita FINITA con MVP calcolato → MOSTRA VINCITORE
  if (isFinished && currentMVP) {
    const renderMVPWinner = (players, teamName) => {
      const mvpPlayer = players.find(p => 
        String(p.NOME || "").toUpperCase() === String(currentMVP).toUpperCase()
      );
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
    
    // Mostra vincitore SOLO nella colonna della sua squadra
    const casaHasMVP = casaPlayers.some(p => 
      String(p.NOME || "").toUpperCase() === String(currentMVP).toUpperCase()
    );
    const trasfHasMVP = trasfPlayers.some(p => 
      String(p.NOME || "").toUpperCase() === String(currentMVP).toUpperCase()
    );
    
    container.innerHTML = `
      <div class="players-col">
        <div class="players-team">${(casaData?.team?.NOME_SQUADRA || match.SQUADRA_CASA || "").toUpperCase()}</div>
        ${casaHasMVP ? renderMVPWinner(casaPlayers, match.SQUADRA_CASA) : ''}
      </div>
      <div class="players-col">
        <div class="players-team">${(trasfData?.team?.NOME_SQUADRA || match.SQUADRA_TRASFERTA || "").toUpperCase()}</div>
        ${trasfHasMVP ? renderMVPWinner(trasfPlayers, match.SQUADRA_TRASFERTA) : ''}
      </div>
    `;
    return;
  }
  
  // 🔥 CASO 3: Partita FINITA ma MVP non ancora calcolato (backend in elaborazione)
  if (isFinished && !currentMVP) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#888;grid-column:1/-1">
        <div style="font-size:3rem;margin-bottom:16px">⏳</div>
        <div>Calcolo MVP in corso...</div>
        <div style="font-size:12px;margin-top:8px;opacity:0.7">Attendere prego</div>
      </div>
    `;
    return;
  }
  
  // 🔥 CASO 4: Partita LIVE → Mostra interfaccia di voto
  const renderMVPVoteList = (players, teamId) => {
    if (!players.length) return `<div style="text-align:center;padding:20px;color:#888">Nessun giocatore</div>`;
    
    // 🔥 Carica voto esistente per questa squadra
    const savedVote = localStorage.getItem(`mvp_vote_${match.MATCH_ID}`);
    let selectedPlayerId = null;
    if (savedVote) {
      try {
        const voteData = JSON.parse(savedVote);
        if (voteData.playerId) {
          selectedPlayerId = voteData.playerId;
        }
      } catch(e) {}
    }
    
    let html = "<div class='players-list'>";
    players.forEach(p => {
      const photoHtml = p.FOTO_ID 
        ? `<img src="${getCachedImage(p.FOTO_ID, 40)}" alt="${p.NOME}">`
        : `<div class="player-avatar-fallback">👤</div>`;
      
      // 🔥 Evidenzia se è il giocatore già votato
      const isSelected = String(p.PLAYER_ID) === String(selectedPlayerId);
      const bgStyle = isSelected ? 'background:#fef3c7;opacity:1;' : '';
      const checkOpacity = isSelected ? 'opacity:1' : 'opacity:0';
      
      html += `
        <div class="player-row mvp-vote-row" 
             onclick="voteMVP('${p.PLAYER_ID}', '${p.NOME.replace(/'/g, "\\'")}', event)"
             style="cursor:pointer;transition:all 0.3s;${bgStyle}">
          <div class="player-avatar">${photoHtml}</div>
          <div class="player-name">
            ${(p.NOME || "").toUpperCase()}
          </div>
          <div class="vote-check" style="${checkOpacity};font-size:1.2rem;color:#059669;font-weight:bold;">✓</div>
        </div>
      `;
    });
    html += "</div>";
    return html;
  };
  
  container.innerHTML = `
    <div class="players-col">
      <div class="players-team">${(casaData?.team?.NOME_SQUADRA || match.SQUADRA_CASA || "").toUpperCase()}</div>
      ${renderMVPVoteList(casaPlayers, match.CASA_ID)}
    </div>
    <div class="players-col">
      <div class="players-team">${(trasfData?.team?.NOME_SQUADRA || match.SQUADRA_TRASFERTA || "").toUpperCase()}</div>
      ${renderMVPVoteList(trasfPlayers, match.TRASFERTA_ID)}
    </div>
  `;

  // 🔥 Carica voto esistente dopo il rendering
  setTimeout(() => loadExistingMVPVote(match.MATCH_ID), 50);
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

async function voteMVP(playerId, playerName, event) {
  const match = window.APP_STATE.lastMatch;
  if (!match || match.STATO_PARTITA !== "LIVE") {
    return;
  }
  
  // 🔥 1. GENERA/RECUPERA ID DISPOSITIVO
  let voterId = localStorage.getItem('mvp_voter_id');
  if (!voterId) {
    voterId = 'voter_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('mvp_voter_id', voterId);
  }
  
  // 🔥 2. SALVA LOCALSTORAGE (immediato, sincrono)
  const voteData = {
    matchId: match.MATCH_ID,
    playerId: playerId,
    playerName: playerName,
    voterId: voterId,
    timestamp: Date.now()
  };
  localStorage.setItem(`mvp_vote_${match.MATCH_ID}`, JSON.stringify(voteData));
  
  // 🔥 3. MOSTRA SPUNTA IMMEDIATA (nessuna attesa)
  updateMVPVoteUI(playerId);
  
  // 🔥 4. INVIA AL BACKEND (background, non bloccante)
  ApiClient.saveMVPVote(match.MATCH_ID, voterId, playerId)
    .then(() => console.log(`✅ Voto salvato backend: ${playerName}`))
    .catch(err => console.warn('⚠️ Errore backend (voto locale ok):', err));
}

function updateMVPVoteUI(selectedPlayerId) {
  // Rimuovi spunte esistenti
  document.querySelectorAll('.mvp-vote-row').forEach(row => {
    row.style.background = '';
    row.style.opacity = '0.6';
    const check = row.querySelector('.vote-check');
    if (check) check.style.opacity = '0';
  });
  
  // Mostra spunta immediata
  const selectedRow = document.querySelector(`.mvp-vote-row[onclick*="'${selectedPlayerId}'"]`);
  if (selectedRow) {
    selectedRow.style.background = '#fef3c7';
    selectedRow.style.opacity = '1';
    const check = selectedRow.querySelector('.vote-check');
    if (check) {
      check.style.opacity = '1';
      check.textContent = '✓';
      check.style.color = '#059669';
      check.style.fontWeight = 'bold';
    }
  }
}

function loadExistingMVPVote(matchId) {
  const savedVote = localStorage.getItem(`mvp_vote_${matchId}`);
  if (savedVote) {
    try {
      const voteData = JSON.parse(savedVote);
      console.log('📥 Voto precedente:', voteData.playerName);
      updateMVPVoteUI(voteData.playerId);
    } catch (e) {
      console.error('Errore lettura voto:', e);
    }
  }
}

function updateLocalMVPCounter() {
  const votes = window.APP_STATE.localMVPVotes || {};
  const matchId = window.APP_STATE.currentMatchId;
  
  // Conta voti per questa partita
  const matchVotes = Object.values(votes).filter(v => v.matchId === matchId);
  const counts = {};
  
  matchVotes.forEach(v => {
    counts[v.playerId] = (counts[v.playerId] || 0) + 1;
  });
  
  // Mostra contatori UI (opzionale, solo per admin)
  console.log('📊 Voti locali:', counts);
}

async function submitAllMVPVotes(matchId) {
  const votes = window.APP_STATE.localMVPVotes || {};
  const matchVotes = Object.values(votes).filter(v => v.matchId === matchId);
  
  if (matchVotes.length === 0) {
    console.log('📭 Nessun voto da inviare');
    return;
  }
  
  console.log(`📤 Invio ${matchVotes.length} voti al backend...`);
  
  // Invia tutti i voti al backend
  const promises = matchVotes.map(vote => {
    return ApiClient.saveMVPVote(matchId, vote.voterId || vote.timestamp, vote.playerId)
      .catch(err => console.error('❌ Errore invio voto:', err));
  });
  
  await Promise.all(promises);
  
  console.log(`✅ ${matchVotes.length} voti inviati con successo!`);
  
  // Pulisci voti locali dopo l'invio
  delete window.APP_STATE.localMVPVotes;
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
    
    const activeTab = window.APP_STATE._activeStandingsTab;
    
    if (activeTab === "gironi") {
      // Aggiorna classifiche gironi
      ApiClient.getStandings().then(data => {
        if (data) { 
          window.APP_CACHE.standings = data; 
          CacheManager.save(window.APP_CACHE); 
        }
        if (window.APP_STATE._activeStandingsTab === "gironi") {
          renderStandings(data);
        }
      }).catch(console.error);
    }
    // 🔥 AGGIUNTO: Aggiorna anche la fase finale in tempo reale
    else if (activeTab === "fasefinale") {
      ApiClient.getFinalStageMatches().then(data => {
        if (data) {
          window.APP_CACHE.finalStage = data || [];
          CacheManager.save(window.APP_CACHE);
        }
        // Renderizza solo se siamo ancora nella tab fase finale
        if (window.APP_STATE._activeStandingsTab === "fasefinale") {
          renderFinalStage(data || window.APP_CACHE.finalStage);
        }
      }).catch(console.error);
    }
  }, 5000); // Ogni 5 secondi
}

function showStandings() {
   window.location.hash = 'standings';
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
    const type = tab.dataset.tab; 
    window.APP_STATE._activeStandingsTab = type;
    
    if (type === "gironi") {
      renderStandings(window.APP_CACHE.standings || {});
    }
    if (type === "fasefinale") {
      if (!window.APP_STATE._finalStageLoaded) { 
        loadFinalStage(); 
        window.APP_STATE._finalStageLoaded = true; 
      } else {
        renderFinalStage(window.APP_CACHE.finalStage || []);
      }
      // 🔥 ASSICURA CHE IL POLLING SIA ATTIVO ANCHE PER FASE FINALE
      startStandingsLiveRefresh();
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
  // 🔥 CONTROLLA SE FASE FINALE È INIZIATA
  const finalStageStarted = window.APP_CACHE.meta?.finalStageStarted || false;
  
  let html = `<div class="girone-block"><div class="girone-title">${Sanitizer.html(title)}</div><table class="standings-table"><thead><tr>
    <th></th><th class="team-col">SQUADRA</th><th>PT</th><th>PG</th><th>V</th><th>P</th><th>S</th><th>GF</th><th>GS</th><th>DR</th></tr></thead><tbody>`;
  
  (teams||[]).forEach((t, idx) => {
    // 🔥 LOGO SQUADRA
    const logoHtml = t.logo 
      ? `<img src="${getCachedImage(t.logo, 48)}" class="standings-logo" alt="${t.nome}" onerror="this.style.display='none'">`
      : `<div style="font-size:1.2rem">⚽</div>`;
    
    // 🔥 MOSTRA ANIMAZIONE LIVE SOLO SE FASE FINALE NON È INIZIATA
    const showLive = t.live && !finalStageStarted;
    
    html += `<tr class="${idx<2?"qualified":""} ${showLive?"live-team-row":""}">
      <td class="pos-col">${idx+1}</td><td class="team-col">
        <div class="standings-team" onclick="openTeamEditor('${Sanitizer.attr(t.id)}')">
          <div class="standings-logo-wrap">${logoHtml}</div>
          <div class="standings-team-name ${showLive?"live-team-name":""}">${Sanitizer.html(t.nome)}</div>
          ${showLive?`<div class="live-dot"></div>`:""}
        </div></td>
      <td class="pts ${showLive?"live-pts":""}">${t.pt}</td><td>${t.pg}</td><td>${t.v}</td><td>${t.p}</td><td>${t.s}</td><td>${t.gf}</td><td>${t.gs}</td><td>${t.dr}</td></tr>`;
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
  const container = document.getElementById("standingsContent"); 
  if (!container) return;
  if (!data?.length) {
    container.innerHTML = `<div class="final-empty"><div class="final-empty-icon">🏆</div><div class="final-empty-title">FASE FINALE</div><div class="final-empty-line"></div>
      <div class="final-empty-text">Crea la fase finale per visualizzare il tabellone del torneo.</div>
      <div class="phase-btn" onclick="createFinalStage()">CREA FASE FINALE</div></div>`; return;
  }
  container.innerHTML = `<div class="final-stage-page"><div id="finalBracketContainer"></div></div>`;
  
  // 1. Disegna il tabellone
  renderFinalBracket(data);
  
  // 2. 🔥 INSERISCI IL PULSANTE DOPO AVER DISEGNATO IL TABELLONE
  renderNextPhaseButton();
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

function renderNextPhaseButton() {
  // Rimuovi pulsanti vecchi se esistono
  const oldBtn = document.getElementById("next-phase-action-btn");
  if (oldBtn) oldBtn.remove();

  const container = document.getElementById("finalBracketContainer");
  if (!container) return;

  // Prendi i dati dalla cache
  const finalStageData = window.APP_CACHE.finalStage || [];
  
  const quarti = finalStageData.filter(m => m.turno === "QUARTI");
  const quartiFiniti = quarti.filter(m => m.stato === "FINITA").length;
  
  const semi = finalStageData.filter(m => m.turno === "SEMIFINALE");
  const semiFiniti = semi.filter(m => m.stato === "FINITA").length;

  // Logica: Il pulsante si attiva SOLO se tutti i quarti sono finiti (per creare semi)
  // O se tutte le semi sono finite (per creare finali)
  let isReady = false;
  let action = null;

  // Se 4 quarti finiti -> Possiamo creare le Semifinali
  if (quartiFiniti === 4) {
    isReady = true;
    action = "SEMIFINALI";
  } 
  // Se 4 quarti finiti E 2 semi finite -> Possiamo creare le Finali
  else if (quartiFiniti === 4 && semiFiniti === 2) {
    isReady = true;
    action = "FINALI";
  }

  // Crea il contenitore del pulsante
  const btnWrapper = document.createElement("div");
  btnWrapper.className = "next-phase-button";
  btnWrapper.id = "next-phase-action-btn";

  // Crea il bottone
  const btn = document.createElement("button");
  // Se non è pronto, aggiungi la classe disabled
  btn.className = `next-phase-btn ${isReady ? '' : 'disabled'}`;
  
  // SCRITTA FISSA
  btn.textContent = "PROSSIMA FASE";
  
  // Azione click solo se pronto
  if (isReady) {
    btn.onclick = () => openNextPhasePopup(action);
  }

  btnWrapper.appendChild(btn);
  
  // Inserisci il pulsante sotto il tabellone
  const pageContainer = document.querySelector('.final-stage-page');
  if(pageContainer) {
    pageContainer.appendChild(btnWrapper);
  }
}

function openNextPhasePopup(phase) {
  const modal = document.createElement("div");
  modal.className = "modalOverlay";
  
  const title = phase === "SEMIFINALI" ? "CREA SEMIFINALI" : "CREA FINALI";
  const match1Label = phase === "SEMIFINALI" ? "SEMIFINALE 1" : "FINALE 1°-2°";
  const match2Label = phase === "SEMIFINALI" ? "SEMIFINALE 2" : "FINALE 3°-4°";
  
  modal.innerHTML = `
    <div class="modalBox" style="max-width:500px;">
      <div class="modalTitle">${title}</div>
      <div class="match-form">
        <div style="margin-bottom:20px;">
          <div style="font-weight:700;margin-bottom:8px;">${match1Label}</div>
          <input type="date" id="date1" class="match-input" style="margin-right:10px;">
          <input type="time" id="time1" class="match-input">
        </div>
        <div>
          <div style="font-weight:700;margin-bottom:8px;">${match2Label}</div>
          <input type="date" id="date2" class="match-input" style="margin-right:10px;">
          <input type="time" id="time2" class="match-input">
        </div>
        <div class="modalActions" style="margin-top:20px;">
          <div class="phase-btn" onclick="saveNextPhase('${phase}')">CREA PARTITE</div>
          <div class="phase-btn secondary" onclick="this.closest('.modalOverlay').remove()">ANNULLA</div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.querySelector(".modalBox").onclick = (e) => e.stopPropagation();
}

async function saveNextPhase(phase) {
  const date1 = document.getElementById("date1")?.value;
  const time1 = document.getElementById("time1")?.value;
  const date2 = document.getElementById("date2")?.value;
  const time2 = document.getElementById("time2")?.value;
  
  if (!date1 || !time1 || !date2 || !time2) {
    alert("Compila tutte le date e gli orari");
    return;
  }
  
  try {
    if (phase === "SEMIFINALI") {
      await ApiClient.createSemiFinals(date1, time1, date2, time2);
    } else {
      await ApiClient.createFinals(date1, time1, date2, time2);
    }
    
    // Chiudi popup e ricarica tabellone
    document.querySelector(".modalOverlay")?.remove();
    loadFinalStage(); // Ricarica i dati dal backend
    
    alert("Partite create con successo!");
    
  } catch (error) {
    console.error('Error creating next phase:', error);
    alert('Errore: ' + error.message);
  }
}

function renderPlaceholderCard(label, cls="") {
  return `
    <div class="bracket-match bracket-placeholder ${cls}">
      <div style="text-align:center; width:100%; display:flex; align-items:center; justify-content:center; height:100%;">
        <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#666;">${Sanitizer.html(label)}</div>
      </div>
    </div>
  `;
}

function renderBracketMatch(match, cls="") {
  if (!match || !match.casa?.nome) {
    return `<div class="bracket-placeholder ${cls}"><div class="bracket-placeholder-title"></div></div>`;
  }
  
  const logoCasa = match.casa?.logo
    ? `<img src="${getCachedImage(match.casa.logo, 24)}" alt="${match.casa.nome}" onerror="this.style.display='none'">`
    : `<div style="width:24px;height:24px;border-radius:50%;background:#f0f0f0"></div>`;
  
  const logoTrasf = match.trasferta?.logo
    ? `<img src="${getCachedImage(match.trasferta.logo, 24)}" alt="${match.trasferta.nome}" onerror="this.style.display='none'">`
    : `<div style="width:24px;height:24px;border-radius:50%;background:#f0f0f0"></div>`;
  
  // 🔥 FIX: Controlla anche SUPP oltre a LIVE
  const isLive = ["LIVE", "SUPP", "RIGORI"].includes(match.stato);
  const isSupp = match.stato === "SUPP";
  const isFinished = match.stato === "FINITA";
  
  let scoreCasa = "0";
  let scoreTrasf = "0";
  if (isLive || isFinished) {
    scoreCasa = match.golCasa || 0;
    scoreTrasf = match.golTrasferta || 0;
  }
  
  // 🔥 Usa bracket-score live per animazione corretta
  const scoreClass = isLive ? "bracket-score live" : "bracket-score scheduled";
  
  // 🔥 Determina vincitore/perdente se finita
  let casaClass = "", trasfClass = "";
  if (isFinished) {
    if (scoreCasa > scoreTrasf) {
      casaClass = "winner";
      trasfClass = "loser";
    } else {
      casaClass = "loser";
      trasfClass = "winner";
    }
  }

  // 🔥 Aggiungi indicatore SUPP se necessario
  const statusIndicator = isSupp ? '<span style="font-size:9px;color:#8c1d2c;font-weight:700;margin-left:4px"/span>' : '';
  
  return `
  <div class="bracket-match ${cls} ${isFinished ? 'concluded' : ''} ${isLive ? 'live-match' : ''}" onclick="openMatch('${match.matchId}')">
    <div class="bracket-team ${casaClass}">
      ${logoCasa}
      <span>${(match.casa?.nome || "TBD").toUpperCase()}</span>
      <span class="${scoreClass}">${scoreCasa}${statusIndicator}</span>
    </div>
    <div class="bracket-team ${trasfClass}">
      ${logoTrasf}
      <span>${(match.trasferta?.nome || "TBD").toUpperCase()}</span>
      <span class="${scoreClass}">${scoreTrasf}${statusIndicator}</span>
    </div>
  </div>
  `;
}

function recoverMatchFromCache(matchId) {
  if (!matchId) return null;
  
  // Priorità: cerca dove ci sono più probabilità di trovare dati completi
  const sources = [
    () => window.APP_STATE.matchesById?.[matchId],
    () => window.APP_CACHE.matches?.find(m => String(m.MATCH_ID) === String(matchId)),
    () => {
      const cached = window.APP_CACHE.fullTeams;
      // Se abbiamo i team, ricostruisci match
      return null; // Implementazione opzionale
    }
  ];
  
  for (const source of sources) {
    const match = source();
    if (match?.CASA_ID && match?.TRASFERTA_ID) {
      console.log('✅ Match recuperato da cache');
      return { ...match };
    }
  }
  
  return null;
}

function createFinalStage() {
  if (!confirm("Confermi il passaggio alla FASE FINALE?")) return;
  alert("Demo: fase finale creata! (backend non configurato)");
}

// ============================================================================
// ⚙️ UTILS & BOOT
// ============================================================================

function bootAdminApp() {
    // 🔒 Protegge lastMatch da valori incompleti
    Object.defineProperty(window.APP_STATE, 'lastMatch', {
        set(value) {
            if (value && (!value.CASA_ID || !value.TRASFERTA_ID)) {
                console.error('🚨 TENTATIVO DI SALVARE lastMatch INCOMPLETO:', value);
            }
            this._lastMatch = value;
        },
        get() { return this._lastMatch; }
    });

    console.log("🚀 Booting Torneo Admin - PRODUCTION MODE");
    
    // 1. Carica cache istantaneamente
    window.APP_CACHE = CacheManager.load();
    
    const loader = document.getElementById("startupLoader");
    if (loader) loader.style.display = "flex";

    let dataLoaded = false;
    let initialRouteHandled = false;

    // 🔥 Timeout di sicurezza
    const maxTimeout = setTimeout(() => {
        if (!dataLoaded) {
            console.warn('⏱️ Timeout caricamento dati - mostro UI comunque');
            hideLoader();
            if (!initialRouteHandled) {  // ✅ RIMOSSO: && !rigoriMatch
                showHome();
                initialRouteHandled = true;
            }
        }
    }, 3000);

    function hideLoader() {
        clearTimeout(maxTimeout);
        if (loader) {
            loader.classList.add("hide");
            setTimeout(() => loader.style.display = "none", 300);
        }
    }

    // 2. Caricamento dati in background
    ApiClient.getInitialData()
        .then(data => {
            dataLoaded = true;
            clearTimeout(maxTimeout);
            hideLoader(); 
            console.log('✅ Dati iniziali caricati:', data);
            
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
                preloadRecentEvents();
                CacheManager.save(window.APP_CACHE);
                
                if (!initialRouteHandled) {  // ✅ RIMOSSO: && !rigoriMatch
                    initialRouteHandled = true;
                    const currentHash = window.location.hash || "#home";
                    if (currentHash.includes("matches")) showMatches();
                    else if (currentHash.includes("teams")) showTeams();
                    else if (currentHash.includes("standings")) showStandings();
                    else showHome();
                }
            }
            
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
            hideLoader();
            if (!initialRouteHandled) {  // ✅ RIMOSSO: && !rigoriMatch
                initialRouteHandled = true;
                showHome();
            }
        });

    // 🔥 Global error handling
    window.addEventListener("error", e => console.error("Global error:", e.error||e.message));
    window.addEventListener("beforeunload", () => { 
        Cleanup.releaseAll(); 
        CacheManager.save(window.APP_CACHE, 0); 
    });
}

function preloadRecentEvents() {
  const matches = window.APP_CACHE.matches || [];
  
  const now = new Date();
  const recentMatches = matches.filter(m => {
    if (m.STATO_PARTITA === "LIVE") return true;
    
    if (m.DATA) {
      const matchDate = parseLocalDate(m.DATA);
      if (matchDate) {
        const diffHours = (now - matchDate) / (1000 * 60 * 60);
        return diffHours < 24;
      }
    }
    return false;
  });
  
  recentMatches.forEach(m => {
    if (!window.APP_CACHE.eventsByMatch) window.APP_CACHE.eventsByMatch = {};
    
    if (!window.APP_CACHE.eventsByMatch[m.MATCH_ID]) {
      ApiClient.getEventsAdmin(m.MATCH_ID)
        .then(events => {
          window.APP_CACHE.eventsByMatch[m.MATCH_ID] = events;
          CacheManager.save(window.APP_CACHE);
        })
        .catch(err => console.error(`❌ Errore eventi ${m.MATCH_ID}:`, err));
    }
    
    // 🔥 Precarica anche i dati completi del match
    ApiClient.getMatchFull(m.MATCH_ID)
      .then(data => {
        if (data?.match && data.match.CASA_ID && data.match.TRASFERTA_ID) {
          window.APP_STATE.matchesById[m.MATCH_ID] = data.match;
        }
      })
      .catch(err => console.error(`❌ Errore precaricamento match ${m.MATCH_ID}:`, err));
  });
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

// 🔥 FIX DEFINITIVO: Funzioni globali per i rigori
// Incolla questo blocco in FONDO a app.js

function checkRigoriWinner(state) {
    const casaKicks = state.history.filter(h => h.team === 'casa').length;
    const trasfKicks = state.history.filter(h => h.team === 'trasferta').length;
    
    // Dopo almeno 5 rigori per squadra
    if (casaKicks >= 5 && trasfKicks >= 5) {
        if (state.casaScore !== state.trasfScore) return true;
    }
    
    // Vittoria matematica prima dei 5 rigori
    const remainingKicks = 5 - Math.max(casaKicks, trasfKicks);
    if (remainingKicks > 0) {
        const diff = Math.abs(state.casaScore - state.trasfScore);
        if (diff > remainingKicks) return true;
    }
    
    // Morte improvvisa dopo il 5-5
    if (casaKicks > 5 && trasfKicks === casaKicks) {
        if (state.casaScore !== state.trasfScore) return true;
    }
    
    return false;
}

function saveRigoriState(matchId, state) {
    localStorage.setItem(`rigori_${matchId}`, JSON.stringify(state));
}

function handleRigoreClick(result, state, match) {
    if (state.finished) return;
    const currentTeam = state.currentKicker;
    const isGoal = result === 'goal';

    // ✅ Aggiorna punteggio correttamente per ENTRAMBE le squadre
    if (isGoal) {
        if (currentTeam === 'casa') state.casaScore++;
        else state.trasfScore++;
    }

    state.history.push({ team: currentTeam, result });
    saveRigoriState(match.MATCH_ID, state);

    // ✅ Aggiorna UI punteggi in tempo reale
    const scoreCasa = document.getElementById('score-casa');
    const scoreTrasf = document.getElementById('score-trasferta');
    if (scoreCasa) scoreCasa.textContent = state.casaScore;
    if (scoreTrasf) scoreTrasf.textContent = state.trasfScore;

    // ✅ Cambia squadra e aggiorna nome sotto il semaforo
    state.currentKicker = currentTeam === 'casa' ? 'trasferta' : 'casa';
    const currentEl = document.getElementById('rigori-current');
    if (currentEl) {
        const nomeCasa = window.APP_CACHE.fullTeams?.[String(match.CASA_ID)]?.team?.NOME_SQUADRA || match.SQUADRA_CASA;
        const nomeTrasf = window.APP_CACHE.fullTeams?.[String(match.TRASFERTA_ID)]?.team?.NOME_SQUADRA || match.SQUADRA_TRASFERTA;
        currentEl.textContent = state.currentKicker === 'casa' ? nomeCasa : nomeTrasf;
    }

    if (checkRigoriWinner(state)) state.finished = true;
}
