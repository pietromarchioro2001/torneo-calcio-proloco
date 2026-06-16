// ============================================================================
// 🔧 CONFIGURAZIONE - INSERISCI IL TUO BACKEND URL
// ============================================================================
const CONFIG = {
    // 🔥 SOSTITUISCI CON IL TUO URL APPS SCRIPT WEB APP
    BACKEND_URL: 'https://script.google.com/macros/s/AKfycbx_AKBiFVn2H3qdTpoyecdxMBiqC0gY57zLHtj39i8Wrq6Smozoq1QLZYRNxGXVtY2m/exec',
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
  // ✅ NUOVA FUNZIONE per URL - mantiene i caratteri validi degli URL
  url: (str) => {
    if (typeof str !== 'string') return '';
    // Permetti solo URL che iniziano con http:// o https://
    const trimmed = str.trim();
    if (!trimmed.match(/^https?:\/\//i)) {
      return ''; // Blocca URL non validi
    }
    // Rimuovi caratteri pericolosi ma mantieni quelli validi per URL
    return trimmed.replace(/[<>"'`\s]/g, '');
  },
  json: (str) => {
    try { return JSON.parse(str); } catch { return null; }
  }
};

// ============================================================================
// 💾 CACHE MANAGER
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
// 🎨 UTILITY FUNCTIONS
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
// 🌐 API CLIENT
// ============================================================================
const ApiClient = {
    async call(action, payload = null) {
    // ✅ USA CONFIG.BACKEND_URL invece dell'URL hardcoded
    const url = CONFIG.BACKEND_URL;
    
    if (!url || url.includes('DEPLOYMENT_ID')) {
      throw new Error('Backend URL non configurato. Controlla CONFIG in app.js');
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
            action: action,
            payload: payload
        }),
        redirect: 'follow'
    });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ HTTP ${response.status}:`, errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Unknown API error');
      }
      
      return data.data;
    } catch (error) {
      console.error(`❌ API Error [${action}]:`, error);
      throw error;
    }
  },
    getInitialData: () => ApiClient.call('getInitialAdminData'),
    getMatches: () => ApiClient.call('getMatchesAdmin'),
    getStandings: () => ApiClient.call('getStandingsGironiCached'),
    getTeamFull: (id) => ApiClient.call('getTeamFullCached', id),
    getMatchFull: (id) => ApiClient.call('getMatchFull', id),
    getPlayersByTeam: (teamId) => ApiClient.call('getPlayersByTeam', teamId),
    getPlayerDetail: (id) => ApiClient.call('getPlayerDetail', id),
    getEventsAdmin: (matchId) => ApiClient.call('getEventsAdmin', matchId),
    saveMVPVote: (matchId, userId, playerId) => ApiClient.call('saveMVPVote', [matchId, userId, playerId]),
    saveTeamAdmin: (id, name, photo, girone) => ApiClient.call('saveTeamAdmin', [id, name, photo, girone]),
    updateTeamName: (id, name) => ApiClient.call('updateTeamName', [id, name]),
    updateTeamGirone: (id, girone) => ApiClient.call('updateTeamGirone', [id, girone]),
    deleteTeamAdmin: (id) => ApiClient.call('deleteTeamAdmin', [id]),
    createMatchGirone: (girone, casa, trasferta, data, ora) => ApiClient.call('createMatchGirone', [girone, casa, trasferta, data, ora]),
    deleteMatchAdmin: (id) => ApiClient.call('deleteMatchAdmin', [id]),
    updateMatchStatus: (id, status) => ApiClient.call('updateMatchStatus', [id, status]),
    addEventAdmin: (matchId, teamId, type, minute, playerId, assistId) => ApiClient.call('addEventAdmin', [matchId, teamId, type, minute, playerId, assistId]),
    editEventAdmin: (eventId, data) => ApiClient.call('editEventAdmin', [eventId, data]),
    deleteEventAdmin: (id) => ApiClient.call('deleteEventAdmin', [id]),
    savePlayerAdmin: (id, teamId, name, photo) => ApiClient.call('savePlayerAdmin', [id, teamId, name, photo]),
    deletePlayerAdmin: (id) => ApiClient.call('deletePlayerAdmin', [id]),
    uploadTeamLogoReplace: (teamId, fileName, fileType, base64) => ApiClient.call('uploadTeamLogoReplace', [teamId, fileName, fileType, base64]),
    uploadTeamPhotoReplace: (teamId, fileName, fileType, base64) => ApiClient.call('uploadTeamPhotoReplace', [teamId, fileName, fileType, base64]),
    uploadPlayerPhotoReplace: (playerId, teamId, playerName, fileName, fileType, base64) => ApiClient.call('uploadPlayerPhotoReplace', [playerId, teamId, playerName, fileName, fileType, base64]),
    saveRigoriResults: (data) => ApiClient.call('saveRigoriResults', [data]),
    prepareFinalStage: () => ApiClient.call('prepareFinalStage'),
    createFinalStageMatches: (matches) => ApiClient.call('createFinalStageMatches', [matches]),
    getFinalStageMatches: () => ApiClient.call('getFinalStageMatches'),
    createSemiFinals: (dataSF1, oraSF1, dataSF2, oraSF2) => ApiClient.call('createSemiFinals', [dataSF1, oraSF1, dataSF2, oraSF2]),
    createFinals: (dataFinale1, oraFinale1, dataFinale2, oraFinale2) => ApiClient.call('createFinals', [dataFinale1, oraFinale1, dataFinale2, oraFinale2]),
    saveMVPFinal: (matchId, playerId) => ApiClient.call('saveMVPFinal', [matchId, playerId]),
    isFinalStageStarted: () => ApiClient.call('isFinalStageStarted'),
    finalizeMVP: (matchId) => ApiClient.call('finalizeMVP', [matchId]),
    getTeamsByGironeSimple: (girone) => ApiClient.call('getTeamsByGironeSimple', [girone]),
    resetTournament: () => ApiClient.call('resetTournament'),
    uploadMediaFile: (matchId, fileName, fileType, base64) => 
      ApiClient.call('uploadMediaFile', [matchId, fileName, fileType, base64]),
};

// ============================================================================
// 🧹 CLEANUP & MEMORY
// ============================================================================
const Cleanup = {
    tempUrls: new Set(),
    trackUrl: (url) => { if (url?.startsWith?.('blob:')) this.tempUrls.add(url); return url; },
    releaseUrl: (url) => {
        if (url && this.tempUrls.has(url)) { try { URL.revokeObjectURL(url); } catch {} this.tempUrls.delete(url); }
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
    _currentOpenTeam: null, _pendingFinalMatches: null, _standingsInterval: null,
    _activeStandingsTab: "gironi", _finalStageLoaded: false, _standingsActive: false,
    _currentPlayerPreviewUrl: null, _matchRequestNonce: 0,
    activeMatchTab: 'diretta',
    _podiumShownThisSession: false
};

// 🔥 AGGIUNGI in GLOBAL STATE (dopo window.APP_STATE)
window.APP_STATE._initialLoadComplete = false;
window.APP_STATE._apiCallQueue = [];

let podiumDismissed = false;

// 🔥 AGGIUNGI questa funzione helper
function queueApiCall(fn, priority = 0) {
  if (window.APP_STATE._initialLoadComplete) {
    return fn(); // Esegui subito se caricamento completato
  }
  // Altrimenti accoda
  window.APP_STATE._apiCallQueue.push({ fn, priority, timestamp: Date.now() });
  // Ordina per priorità (più alto = prima)
  window.APP_STATE._apiCallQueue.sort((a, b) => b.priority - a.priority);
}

function refreshStandingsDebounced(delay = 1200) {
  // ✅ Se non abbiamo finito il caricamento iniziale, accoda
  if (!window.APP_STATE._initialLoadComplete) {
    queueApiCall(() => {
      clearTimeout(standingsRefreshTimer);
      standingsRefreshTimer = setTimeout(() => {
        ApiClient.getStandings().then(data => {
          if (data) { 
            window.APP_CACHE.standings = data; 
            CacheManager.save(window.APP_CACHE); 
          }
          if (document.querySelector(".standings-page")) {
            renderStandings(data || window.APP_CACHE.standings);
          }
        }).catch(console.error);
      }, delay);
    }, 10); // Priorità alta
    return;
  }
  
  // Comportamento normale se caricamento completato
  clearTimeout(standingsRefreshTimer);
  standingsRefreshTimer = setTimeout(() => {
    ApiClient.getStandings().then(data => {
      if (data) { window.APP_CACHE.standings = data; CacheManager.save(window.APP_CACHE); }
      if (document.querySelector(".standings-page")) renderStandings(data || window.APP_CACHE.standings);
    }).catch(console.error);
  }, delay);
}

function hydrateMatches(matches = []) {
    window.APP_STATE.matchesById = {};
    (matches || []).forEach(m => { if (m?.MATCH_ID) window.APP_STATE.matchesById[m.MATCH_ID] = m; });
}

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
    if (matches.length === 0 && !window.APP_STATE._dataReady) {
    return renderLoadingNextMatch();
  }
  const eventsByMatch = window.APP_CACHE.eventsByMatch || {};
  const now = new Date();
  const nowStr = formatLocalDate(now);
  const finale1 = matches.find(m => m.TURNO === "FINALE 1-2" || m.matchKey === "F");
  const finale3 = matches.find(m => m.TURNO === "FINALE 3-4" || m.matchKey === "TP");
  
  if (finale1 && finale3 &&
      finale1.STATO_PARTITA === "FINITA" &&
      finale3.STATO_PARTITA === "FINITA") {
    
    // 🔥 DETERMINA VINCITORE CONSIDERANDO I RIGORI
    let vincitore;
    
    // ✅ Controlla TUTTE le varianti (minuscolo dal backend, maiuscolo da cache)
    const rigoriCasa = finale1.rigoriCasa ?? finale1.RIGORE_CASA ?? finale1.RIGORI_CASA ?? null;
    const rigoriTrasf = finale1.rigoriTrasferta ?? finale1.RIGORE_TRASFERTA ?? finale1.RIGORI_TRASFERTA ?? null;
    
    // ✅ Verifica che i rigori siano valori VALIDI (non null/undefined/vuoti)
    const hasValidRigori = (
      rigoriCasa !== null && rigoriCasa !== undefined && rigoriCasa !== "" &&
      rigoriTrasf !== null && rigoriTrasf !== undefined && rigoriTrasf !== ""
    );
    
    if (hasValidRigori) {
      // ✅ Usa SEMPRE i rigori se sono presenti
      vincitore = Number(rigoriCasa) > Number(rigoriTrasf)
        ? { nome: finale1.SQUADRA_CASA, logo: finale1.LOGO_CASA }
        : { nome: finale1.SQUADRA_TRASFERTA, logo: finale1.LOGO_TRASFERTA };
    } else {
      // Altrimenti usa il punteggio regolare
      vincitore = finale1.GOL_CASA > finale1.GOL_TRASFERTA
        ? { nome: finale1.SQUADRA_CASA, logo: finale1.LOGO_CASA }
        : { nome: finale1.SQUADRA_TRASFERTA, logo: finale1.LOGO_TRASFERTA };
    }
    
    const logoHtml = vincitore.logo
        ? `<img src="${getCachedImage(vincitore.logo, 50)}" alt="${vincitore.nome}" class="champion-logo">`
        : '<div class="champion-logo" style="display:flex;align-items:center;justify-content:center;font-size:18px;">⚽</div>';
        
    const nomeVincitore = Sanitizer.html((vincitore.nome || "").toUpperCase());
    return `
    <div class="home-next-match winner-card" onclick="openMatch('${Sanitizer.attr(finale1.MATCH_ID)}')">
        <div class="champion-label">CAMPIONE 2026:</div>
        <div class="champion-content">
            ${logoHtml}
            <div class="champion-name">${nomeVincitore}</div>
        </div>
    </div>
    `;
  }

// 1. Cerca partite LIVE/SUPP/RIGORI
const liveMatch = matches.find(m =>
m.STATO_PARTITA === "LIVE" ||
m.STATO_PARTITA === "SUPP" ||
m.STATO_PARTITA === "RIGORI"
);

if (liveMatch) {
if (!liveMatch.MATCH_ID || !liveMatch.CASA_ID || !liveMatch.TRASFERTA_ID) {
console.error('⚠️ Match LIVE/SUPP incompleto:', liveMatch);
const fullMatch = window.APP_STATE.matchesById[liveMatch.MATCH_ID];
if (fullMatch && fullMatch.CASA_ID && fullMatch.TRASFERTA_ID) {
let matchWithScore = { ...fullMatch };
const hasValidScore = (fullMatch.GOL_CASA !== undefined && fullMatch.GOL_TRASFERTA !== undefined);
if (!hasValidScore) {
const liveEvents = eventsByMatch[fullMatch.MATCH_ID] || [];
matchWithScore = calculateMatchScore(fullMatch, liveEvents);
}
return renderHomeMatchCard(matchWithScore, liveMatch.STATO_PARTITA);
}
return renderEmptyNextMatch();
}

let matchWithScore = { ...liveMatch };
const hasValidScore = (liveMatch.GOL_CASA !== undefined && liveMatch.GOL_TRASFERTA !== undefined);
if (!hasValidScore) {
const liveEvents = eventsByMatch[liveMatch.MATCH_ID] || [];
matchWithScore = calculateMatchScore(liveMatch, liveEvents);
}
return renderHomeMatchCard(matchWithScore, liveMatch.STATO_PARTITA);
}

// 2. Cerca partite future
const todayMatches = matches.filter(m => {
const matchDate = String(m.DATA || "").slice(0, 10);
return matchDate >= nowStr &&
m.STATO_PARTITA !== "FINITA" &&
m.STATO_PARTITA !== "LIVE" &&
m.STATO_PARTITA !== "SUPP" &&
m.STATO_PARTITA !== "RIGORI";
}).sort((a, b) => {
const dateA = String(a.DATA || "").slice(0, 10) + (a.ORA || "00:00");
const dateB = String(b.DATA || "").slice(0, 10) + (b.ORA || "00:00");
return dateA.localeCompare(dateB);
});

if (todayMatches.length > 0) {
let nextMatch = { ...todayMatches[0] };
if (!nextMatch.MATCH_ID || !nextMatch.CASA_ID || !nextMatch.TRASFERTA_ID) {
console.error('⚠️ Prossima partita incompleta:', nextMatch);
const fullMatch = window.APP_STATE.matchesById[nextMatch.MATCH_ID];
if (fullMatch && fullMatch.CASA_ID && fullMatch.TRASFERTA_ID) {
nextMatch = fullMatch;
} else {
return renderEmptyNextMatch();
}
}
const hasValidScore = (nextMatch.GOL_CASA !== undefined && nextMatch.GOL_TRASFERTA !== undefined);
if (!hasValidScore) {
const nextEvents = eventsByMatch[nextMatch.MATCH_ID] || [];
nextMatch = calculateMatchScore(nextMatch, nextEvents);
}
return renderHomeMatchCard(nextMatch, false);
}

return renderEmptyNextMatch();
}

// ✅ AGGIUNGI QUESTA FUNZIONE
function renderEmptyNextMatch() {
  return `<div class="home-next-match" style="
    opacity:0.7;
    pointer-events:none;
    cursor:default;
    border: 1px solid rgba(122, 30, 44, 0.12);
    background: rgba(255,255,255,0.98);
    padding: 20px 15px;
    text-align: center;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
  ">
    <div style="
      color: #666;
      font-size: 14px;
      letter-spacing: 1px;
      font-weight: 600;
      text-transform: uppercase;
      width: 100%;
    ">
      Nessuna partita in programma
    </div>
  </div>`;
}
function calculateMatchScore(match, events) {
    const goals = events.filter(e => e.TIPO === 'GOAL');
    let golCasa = 0, golTrasferta = 0;
    goals.forEach(g => {
        if (String(g.TEAM_ID) === String(match.CASA_ID)) golCasa++;
        else if (String(g.TEAM_ID) === String(match.TRASFERTA_ID)) golTrasferta++;
    });
    return { ...match, GOL_CASA: golCasa, GOL_TRASFERTA: golTrasferta };
}

function mergeEventsWithLocal(freshEvents, matchId) {
    const localEvents = window.APP_CACHE.eventsByMatch?.[matchId] || [];
    const mergedEvents = [...freshEvents];
    
    localEvents.forEach(localEv => {
        if (localEv.EVENT_ID && String(localEv.EVENT_ID).startsWith('temp_')) {
            // Verifica se l'evento è già stato salvato nel backend (confronto approssimativo)
            const alreadySaved = freshEvents.some(fe => 
                String(fe.MINUTO) === String(localEv.MINUTO) &&
                String(fe.TEAM_ID) === String(localEv.TEAM_ID) &&
                String(fe.TIPO) === String(localEv.TIPO) &&
                String(fe.PLAYER_ID) === String(localEv.PLAYER_ID)
            );
            
            // Se non è ancora nel backend, lo manteniamo in cache per evitare che scompaia dalla UI
            if (!alreadySaved) {
                mergedEvents.push(localEv);
            }
        }
    });
    
    return mergedEvents;
}

function renderHomeMatchCard(match, isLive) {
  // ✅ CONTROLLI DI SICUREZZA
  if (!match || !match.SQUADRA_CASA || !match.SQUADRA_TRASFERTA) {
    console.error('❌ renderHomeMatchCard: dati incompleti', match);
    return renderEmptyNextMatch();
  }
  
  const statoDisplay = typeof isLive === 'string' ? isLive : (isLive ? "LIVE" : "");
  const isAttiva = (statoDisplay === "LIVE" || statoDisplay === "SUPP" || statoDisplay === "RIGORI");
  
  // ✅ SANITIZZA TUTTI I DATI
  const squadraCasa = Sanitizer.html((match.SQUADRA_CASA || "").toUpperCase());
  const squadraTrasf = Sanitizer.html((match.SQUADRA_TRASFERTA || "").toUpperCase());
  
  // ✅ GESTIONE LOGO PIÙ SICURA
  let logoCasaHtml = `<div class="home-team-logo">⚽</div>`;
  if (match.LOGO_CASA) {
    const logoUrl = getCachedImage(match.LOGO_CASA, 34);
    if (logoUrl) {
      logoCasaHtml = `<img src="${logoUrl}" alt="${squadraCasa}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                      <div class="home-team-logo" style="display:none">⚽</div>`;
    }
  }
  
  let logoTrasfHtml = `<div class="home-team-logo">⚽</div>`;
  if (match.LOGO_TRASFERTA) {
    const logoUrl = getCachedImage(match.LOGO_TRASFERTA, 34);
    if (logoUrl) {
      logoTrasfHtml = `<img src="${logoUrl}" alt="${squadraTrasf}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                       <div class="home-team-logo" style="display:none">⚽</div>`;
    }
  }
  
  let centerContent = "";
  if (isAttiva) {
    centerContent = `<div class="home-live-badge"><div class="home-score">${match.GOL_CASA || 0} - ${match.GOL_TRASFERTA || 0}</div>
    <div class="home-live-row"><div class="home-live-text">${statoDisplay}</div><div class="home-live-dot"></div></div></div>`;
  } else {
    const dateObj = parseLocalDate(match.DATA);
    const dateStr = dateObj ? `${dateObj.getDate()}/${dateObj.getMonth()+1}` : "";
    centerContent = `<div class="home-match-time">${match.ORA || "--:--"}</div><div class="home-match-date">${dateStr}</div>`;
  }
  
  // ✅ SANITIZZA matchId
  const matchId = Sanitizer.attr(match.MATCH_ID);
  
  return `<div class="home-next-match ${isAttiva ? 'live-card' : ''}" onclick="openMatch('${matchId}')">
    <div class="home-team-block left">${logoCasaHtml}<span class="home-team">${squadraCasa}</span></div>
    <div class="home-match-center">${centerContent}</div>
    <div class="home-team-block right"><span class="home-team">${squadraTrasf}</span>${logoTrasfHtml}</div>
  </div>`;
}

function showHome() {
    closeTournamentPodium();
    window.location.hash = '#home';
    stopStandingsLiveRefresh();
    renderToolbar("home");
     // 🔥 Controlla se ci sono partite LIVE e avvia polling
    const hasLiveMatch = (window.APP_CACHE.matches || []).some(m => 
        m.STATO_PARTITA === "LIVE" || m.STATO_PARTITA === "SUPP" || m.STATO_PARTITA === "RIGORI"
    );
    if (hasLiveMatch) {
        startMatchLiveRefresh();
    }
    const app = document.getElementById("app");
    if (!app) return;
    const currentYear = new Date().getFullYear();
    const nextMatchCard = getNextMatchCard();
    app.innerHTML = `
        <div class="home-container">
          <div class="home-sponsors">
            <img src="https://i.imgur.com/NugXx1k.png" alt="Sponsor 1" loading="lazy">
            <img src="https://i.imgur.com/oiMHzlC.jpeg" alt="Sponsor 2" loading="lazy">
          </div>
          
          <!-- 🔥 PULSANTE RESET TORNEO (solo admin, nascosto su mobile) -->
          <div class="admin-reset-zone">
            <button class="admin-reset-btn" onclick="resetTournament()">
              RESET TORNEO
            </button>
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
          ${nextMatchCard}
        </div>`;
}

// ============================================================================
// 👥 TEAMS FUNCTIONS
// ============================================================================
function showTeams() {
    closeTournamentPodium();
    window.location.hash = '#teams'; stopStandingsLiveRefresh(); renderToolbar("teams");
    document.getElementById("app").innerHTML = `<div class="teams-page"><div class="teams-header"><div class="page-title">SQUADRE</div><div class="phase-btn" onclick="openNewTeamPage()">+ NUOVA SQUADRA</div></div><div class="teams-scroll"><div id="teamsList"></div></div></div>`;
    renderTeams();
}

function renderTeams() {
    const container = document.getElementById("teamsList"); if (!container) return;
    const teams = window.APP_CACHE.teams || [];
    if (teams.length === 0) { container.innerHTML = `<div style="text-align:center;padding:40px;color:#888"><div style="font-size:3rem;margin-bottom:16px">⚽</div><div>Nessuna squadra presente</div></div>`; return; }
    
    let html = "<table class='teams-table'><tr><th></th><th>SQUADRA</th><th></th></tr>";
    teams.forEach(t => {
        const logoHtml = t.LOGO_ID ? `<img src="${getCachedImage(t.LOGO_ID, 65)}" class="team-mini-logo" alt="${t.NOME_SQUADRA}" onerror="this.style.display='none';this.parentElement.innerHTML='⚽'">` : `<div style="font-size:1.2rem">⚽</div>`;
        html += `<tr class='team-row-click' data-id='${t.TEAM_ID}'><td><div class="team-logo-box">${logoHtml}</div></td><td><span class='teams-team-name'>${(t.NOME_SQUADRA || "").toUpperCase()}</span></td><td><div class='delete-btn' data-del='${t.TEAM_ID}' onclick="event.stopPropagation(); deleteTeam('${t.TEAM_ID}')"></div></td></tr>`;
    });
    html += "</table>"; container.innerHTML = html;
    document.querySelectorAll(".team-row-click").forEach(row => { row.onclick = () => openTeamEditor(row.dataset.id); });
}

function openNewTeamPage() {
    window.APP_STATE.currentTeamId = null;
    document.getElementById("app").innerHTML = `<div class="page-container"><div class="page-title">NUOVA SQUADRA</div><div class="form-wrapper"><div class="form-row"><div class="form-group"><label>Nome squadra</label><input id="teamName" class="form-input" placeholder="Es: SARNONICO"></div><div class="form-group small"><label>Girone</label><select id="teamGirone" class="form-select"><option value="">Seleziona</option><option value="A">Girone A</option><option value="B">Girone B</option></select></div></div><div class="upload-row"><div id="logoUpload" class="uploadBox">LOGO</div><input type="file" id="logoInput" hidden><div id="photoUpload" class="uploadBox">FOTO SQUADRA</div><input type="file" id="photoInput" hidden></div><div class="form-actions"><div class="phase-btn" onclick="saveTeam()">SALVA</div><div class="phase-btn secondary" onclick="showTeams()">INDIETRO</div></div></div></div>`;
    initUploadBox("logoUpload", "logoInput"); initUploadBox("photoUpload", "photoInput");
}

function initUploadBox(boxId, inputId) {
    const box = document.getElementById(boxId), input = document.getElementById(inputId);
    if (!box || !input) return;
    box.onclick = () => input.click();
    box.ondragover = e => { e.preventDefault(); box.style.background = "#fff5f7"; box.style.borderColor = "#7a1e2c"; };
    box.ondragleave = () => { box.style.background = "#fafafa"; box.style.borderColor = "#ccc"; };
    box.ondrop = e => { e.preventDefault(); input.files = e.dataTransfer.files; box.innerHTML = Sanitizer.html(e.dataTransfer.files[0]?.name || 'File selezionato'); box.style.background = "#fafafa"; box.style.borderColor = "#ccc"; };
    input.onchange = () => { if (input.files[0]) box.innerHTML = Sanitizer.html(input.files[0].name); };
}

async function saveTeam() {
    const name = document.getElementById("teamName")?.value?.trim()?.toUpperCase();
    const girone = document.getElementById("teamGirone")?.value;
    if (!name) { alert("Inserisci nome squadra"); return; }
    if (!girone) { alert("Seleziona girone"); return; }
    try {
        const res = await ApiClient.saveTeamAdmin(window.APP_STATE.currentTeamId, name, "", girone);
        if (res?.id) {
            const newTeam = { TEAM_ID: res.id, NOME_SQUADRA: name, GIRONE: girone, LOGO_ID: null };
            window.APP_CACHE.teams = [...(window.APP_CACHE.teams || []), newTeam];
            CacheManager.save(window.APP_CACHE);
        }
        // 🔥 AGGIUNGI QUESTA RIGA
        await invalidateCacheAndRefresh('teams');
        showTeams();
    } catch (e) { alert("Errore salvataggio: " + (e?.message || e)); }
}

function openTeamEditor(teamId) {
    window.APP_STATE._currentOpenTeam = teamId; window.APP_STATE.currentTeamId = teamId;
    document.getElementById("app").innerHTML = `<div class="team-editor"><div class="team-header-fixed"><div class="team-header"><div id="teamLogoBox"><div class="empty-logo">⚽</div></div><div class="team-name-wrapper"><div id="teamNameDisplay" class="team-name-display">CARICAMENTO...</div><input id="teamNameInput" style="display:none;"><div id="teamGironeDisplay" class="team-girone-display">GIRONE -</div><select id="teamGironeSelect" class="team-girone-select" style="display:none;"><option value="A">GIRONE A</option><option value="B">GIRONE B</option></select></div></div></div><div class="team-content-scroll"><div id="teamPhotoBox"><div class="team-photo-empty"><div class="team-photo-empty-plus">📷</div><div class="team-photo-empty-text">FOTO SQUADRA</div></div></div><div class="players-header"><div class="players-title">GIOCATORI</div><div class="phase-btn" onclick="openPlayerPopup()">+ NUOVO GIOCATORE</div></div><div id="playersSection"><div style="text-align:center;padding:20px;color:#888">Nessun giocatore</div></div><div class="back-btn-wrapper"><div class="phase-btn secondary" onclick="showTeams()">← INDIETRO</div></div></div></div>`;
    loadTeamData(teamId);
}

function loadTeamData(teamId) {
    const cached = window.APP_CACHE.fullTeams?.[teamId];
    if (cached?.team) { renderTeamEditor(cached.team, cached.players || []); }
    ApiClient.getTeamFull(teamId).then(data => {
        if (window.APP_STATE._currentOpenTeam !== teamId) return;
        if (!window.APP_CACHE.fullTeams) window.APP_CACHE.fullTeams = {};
        window.APP_CACHE.fullTeams[teamId] = data; CacheManager.save(window.APP_CACHE);
        if (data?.team) renderTeamEditor(data.team, data.players || []);
    }).catch(error => { console.warn('Failed to load team from backend:', error); });
}

function renderTeamEditor(team, players = []) {
    if (!team) return;
    const logoBox = document.getElementById("teamLogoBox");
    if (logoBox) { if (team.LOGO_ID) { logoBox.innerHTML = `<img src="${getCachedImage(team.LOGO_ID, 512)}" class="team-header-logo" alt="Logo" onclick="teamLogoAction()">`; } else { logoBox.innerHTML = `<div class="empty-logo" onclick="uploadNewLogo()">⚽</div>`; } }
    const photoBox = document.getElementById("teamPhotoBox");
    if (photoBox) { 
      if (team.FOTO_SQUADRA_FILE_ID) { 
        // ✅ Assegna sempre onclick, la funzione controllerà se è mobile
        photoBox.innerHTML = `<div class="team-photo-wrapper"><img src="${getCachedImage(team.FOTO_SQUADRA_FILE_ID, 800)}" class="team-photo-view loaded" alt="Foto squadra" onclick="teamPhotoAction()"></div>`; 
      } else { 
        photoBox.innerHTML = `<div class="team-photo-empty" onclick="uploadNewTeamPhoto()"><div class="team-photo-empty-plus">📷</div><div class="team-photo-empty-text">FOTO SQUADRA</div></div>`; 
      } 
    }
    const nameDisplay = document.getElementById("teamNameDisplay"); const nameInput = document.getElementById("teamNameInput");
    if (nameDisplay && nameInput) { nameDisplay.textContent = team.NOME_SQUADRA || ""; nameInput.value = team.NOME_SQUADRA || ""; nameDisplay.onclick = () => { nameDisplay.style.display="none"; nameInput.style.display="block"; nameInput.focus(); }; nameInput.onblur = async () => { const newName = nameInput.value.trim().toUpperCase(); if (newName && newName !== team.NOME_SQUADRA) { nameDisplay.textContent = newName; await ApiClient.updateTeamName(team.TEAM_ID, newName); if (window.APP_CACHE.teams) { const idx = window.APP_CACHE.teams.findIndex(t=>t.TEAM_ID===team.TEAM_ID); if (idx >= 0) { window.APP_CACHE.teams[idx].NOME_SQUADRA = newName; CacheManager.save(window.APP_CACHE); } } } nameInput.style.display="none"; nameDisplay.style.display="block"; }; }
    const gironeDisplay = document.getElementById("teamGironeDisplay"); const gironeSelect = document.getElementById("teamGironeSelect");
    if (gironeDisplay && gironeSelect) { gironeDisplay.textContent = "GIRONE " + (team.GIRONE || "-"); gironeSelect.value = team.GIRONE || "A"; gironeDisplay.onclick = () => { gironeDisplay.style.display="none"; gironeSelect.style.display="block"; gironeSelect.focus(); }; gironeSelect.onchange = async () => { const newGirone = gironeSelect.value; gironeDisplay.textContent = "GIRONE " + newGirone; await ApiClient.updateTeamGirone(team.TEAM_ID, newGirone); if (window.APP_CACHE.teams) { const idx = window.APP_CACHE.teams.findIndex(t=>t.TEAM_ID===team.TEAM_ID); if (idx >= 0) { window.APP_CACHE.teams[idx].GIRONE = newGirone; CacheManager.save(window.APP_CACHE); } } refreshStandingsDebounced(); }; gironeSelect.onblur = () => { gironeSelect.style.display="none"; gironeDisplay.style.display="block"; }; }
    renderPlayersList(players);
}

function teamLogoAction() {
    const teamId = window.APP_STATE.currentTeamId; const team = window.APP_CACHE.fullTeams?.[teamId]?.team;
    if (!team?.LOGO_ID) { uploadNewLogo(); return; }
    const modal = document.createElement("div"); modal.className = "modalOverlay";
    modal.innerHTML = `<div class="modalBox"><div class="modalTitle">LOGO SQUADRA</div><img src="${getCachedImage(team.LOGO_ID, 400)}" style="max-width:100%;border-radius:12px;margin:20px 0;"><div class="modalActions"><div class="phase-btn secondary" onclick="window.open('https://drive.google.com/file/d/${team.LOGO_ID}/view', '_blank'); this.closest('.modalOverlay').remove()">APRI</div><div class="phase-btn" onclick="this.closest('.modalOverlay').remove(); uploadNewLogo()">CAMBIA</div></div></div>`;
    document.body.appendChild(modal); modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

async function uploadNewLogo() {
    const teamId = window.APP_STATE.currentTeamId; const input = document.createElement("input"); input.type = "file"; input.accept = "image/*";
    input.onchange = async function() {
        const file = input.files[0]; if (!file) return;
        const logoBox = document.getElementById("teamLogoBox"); const tempUrl = URL.createObjectURL(file);
        logoBox.innerHTML = `<div class="logo-loading-wrap"><img src="${tempUrl}" class="team-header-logo updating"><div class="logo-updating-badge">AGGIORNO...</div></div>`;
        try {
            const base64 = await fileToBase64(file); const newId = await ApiClient.uploadTeamLogoReplace(teamId, file.name, file.type, base64);
            if (window.APP_CACHE.fullTeams?.[teamId]?.team) { window.APP_CACHE.fullTeams[teamId].team.LOGO_ID = newId?.fileId || newId; CacheManager.save(window.APP_CACHE); }
            setTimeout(() => { renderTeamEditor(window.APP_CACHE.fullTeams[teamId].team, window.APP_CACHE.fullTeams[teamId].players || []); }, 2000);
        } catch (error) { console.error('Upload logo failed:', error); alert('Errore upload logo: ' + error.message); URL.revokeObjectURL(tempUrl); renderTeamEditor(window.APP_CACHE.fullTeams[teamId].team, window.APP_CACHE.fullTeams[teamId].players || []); }
    }; input.click();
}

function uploadNewTeamPhoto() {
    const teamId = window.APP_STATE.currentTeamId; const input = document.createElement("input"); input.type = "file"; input.accept = "image/*";
    input.onchange = async function() {
        const file = input.files[0]; if (!file) return;
        const photoBox = document.getElementById("teamPhotoBox"); const tempUrl = URL.createObjectURL(file);
        photoBox.innerHTML = `<div class="team-photo-wrapper"><img src="${tempUrl}" class="team-photo-view updating"><div class="photo-updating-badge">AGGIORNAMENTO...</div></div>`;
        try {
            const base64 = await fileToBase64(file); const newId = await ApiClient.uploadTeamPhotoReplace(teamId, file.name, file.type, base64);
            if (window.APP_CACHE.fullTeams?.[teamId]?.team) { window.APP_CACHE.fullTeams[teamId].team.FOTO_SQUADRA_FILE_ID = newId; CacheManager.save(window.APP_CACHE); }
            setTimeout(() => { renderTeamEditor(window.APP_CACHE.fullTeams[teamId].team, window.APP_CACHE.fullTeams[teamId].players || []); }, 2000);
        } catch (error) { console.error('Upload photo failed:', error); alert('Errore upload foto: ' + error.message); URL.revokeObjectURL(tempUrl); renderTeamEditor(window.APP_CACHE.fullTeams[teamId].team, window.APP_CACHE.fullTeams[teamId].players || []); }
    }; input.click();
}

function teamPhotoAction() {
    if (window.innerWidth <= 768) {
        return; // Non fare nulla su mobile
      }
      const teamId = window.APP_STATE.currentTeamId; 
      const team = window.APP_CACHE.fullTeams?.[teamId]?.team;
      if (!team?.FOTO_SQUADRA_FILE_ID) { 
        uploadNewTeamPhoto(); 
        return; 
      }
    const modal = document.createElement("div"); modal.className = "modalOverlay";
    modal.innerHTML = `<div class="modalBox" style="max-width:800px;"><div class="modalTitle">FOTO SQUADRA</div><img src="${getCachedImage(team.FOTO_SQUADRA_FILE_ID, 1200)}" style="max-width:100%;border-radius:12px;margin:20px 0;"><div class="modalActions"><div class="phase-btn secondary" onclick="window.open('https://drive.google.com/file/d/${team.FOTO_SQUADRA_FILE_ID}/view', '_blank'); this.closest('.modalOverlay').remove()">APRI</div><div class="phase-btn" onclick="this.closest('.modalOverlay').remove(); uploadNewTeamPhoto()">CAMBIA</div></div></div>`;
    document.body.appendChild(modal); modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

let currentPlayerId = null; let playerPhotoTemp = null;
function openPlayerPopup(playerId = null) {
    currentPlayerId = playerId; playerPhotoTemp = null; const teamId = window.APP_STATE.currentTeamId; const title = playerId ? "MODIFICA GIOCATORE" : "NUOVO GIOCATORE";
    const modal = document.createElement("div"); modal.className = "modalOverlay";
    modal.innerHTML = `<div class="modalBox player-modal" id="playerBox"><div class="modalTitle">${title}</div><div class="player-form"><label>NOME</label><input id="playerNameInput" class="player-input" placeholder="Inserisci nome giocatore"><div id="playerPhotoUpload" class="player-upload">FOTO GIOCATORE</div><div class="modalActions"><div class="phase-btn" onclick="savePlayerPopup()">SALVA</div>${playerId ? '<div class="phase-btn secondary" onclick="deletePlayer(\'' + playerId + '\'); this.closest(\'.modalOverlay\').remove()">ELIMINA</div>' : ''}</div></div></div>`;
    document.body.appendChild(modal); modal.onclick = (e) => { if (e.target === modal) modal.remove(); }; document.getElementById("playerBox").onclick = (e) => e.stopPropagation();
    initPlayerUploadBox();
    if (playerId) {
        const player = window.APP_CACHE.playersMap?.[playerId];
        if (player) { loadPlayerData(player); } else { ApiClient.getPlayerDetail(playerId).then(p => { if (p) { loadPlayerData(p); if (!window.APP_CACHE.playersMap) window.APP_CACHE.playersMap = {}; window.APP_CACHE.playersMap[playerId] = p; CacheManager.save(window.APP_CACHE); } }).catch(err => console.error('Error loading player:', err)); }
    }
}

function initPlayerUploadBox() {
    const box = document.getElementById("playerPhotoUpload");
    box.onclick = () => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.onchange = () => { playerPhotoTemp = input.files[0]; renderPlayerTempPhoto(); }; input.click(); };
}

function loadPlayerData(player) {
    document.getElementById("playerNameInput").value = player?.NOME || "";
    const box = document.getElementById("playerPhotoUpload");
    const photoId = player?.FOTO_ID || player?.FOTO_URL;

if (photoId) {
    box.innerHTML = `<img src="${getCachedImage(photoId, 200)}"
                     class="playerPhotoBig"
                     alt="${player.NOME}">`;
} else { box.innerHTML = "FOTO GIOCATORE"; box.classList.remove("has-photo"); }
}

function renderPlayerTempPhoto() {
    const box = document.getElementById("playerPhotoUpload");
    if (playerPhotoTemp) { const url = URL.createObjectURL(playerPhotoTemp); box.innerHTML = `<img src="${url}" class="playerPhotoBig" alt="Preview">`; box.classList.add("has-photo"); }
}

async function savePlayerPopup() {
    const name = document.getElementById("playerNameInput")?.value?.trim();
    if (!name) { alert("Inserisci nome giocatore"); return; }
    const teamId = window.APP_STATE.currentTeamId;
    try {
        const playerId = await ApiClient.savePlayerAdmin(currentPlayerId, teamId, name.toUpperCase(), "");
        currentPlayerId = playerId;
        if (playerPhotoTemp) {
            const base64 = await fileToBase64(playerPhotoTemp);
            const newPhotoId = await ApiClient.uploadPlayerPhotoReplace(playerId, teamId, name.toUpperCase(), playerPhotoTemp.name, playerPhotoTemp.type, base64);
            if (window.APP_CACHE.playersMap) {
                window.APP_CACHE.playersMap[playerId] = { ...window.APP_CACHE.playersMap[playerId], FOTO_ID: newPhotoId, NOME: name.toUpperCase() };
                CacheManager.save(window.APP_CACHE);
            }
        }
        document.querySelector(".modalOverlay")?.remove();
        // 🔥 AGGIUNGI QUESTA RIGA
        await invalidateCacheAndRefresh('teams');
        await loadTeamData(teamId);
    } catch (error) { console.error('Save player error:', error); alert("Errore salvataggio: " + error.message); }
}

async function deletePlayer(playerId) {
    if (!confirm("Eliminare questo giocatore?")) return;
    try { await ApiClient.deletePlayerAdmin(playerId); if (window.APP_CACHE.playersMap) { delete window.APP_CACHE.playersMap[playerId]; } await loadTeamData(window.APP_STATE.currentTeamId); } catch (error) { console.error('Delete player error:', error); alert("Errore eliminazione: " + error.message); }
}

function renderPlayersList(players) {
    const container = document.getElementById("playersSection"); if (!container) return;
    if (!players?.length) { container.innerHTML = `<div style="text-align:center;padding:20px;color:#888">Nessun giocatore</div>`; return; }
    let html = `<table class='playersTable'><tr><th></th><th>NOME</th><th>GOL</th><th>ASS</th><th>AMM</th><th>ESP</th><th>MVP</th></tr>`;
    players.forEach(p => {
        const photoHtml = p.FOTO_ID ? `<img src="${getCachedImage(p.FOTO_ID, 42)}" class="playerPhoto" alt="${p.NOME}" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\'playerPhotoEmpty\'></div>'">` : "<div class='playerPhotoEmpty'></div>";
        const gol = Number(p.GOL) || 0; const assist = Number(p.ASSIST) || 0; const amm = Number(p.AMMONIZIONI) || 0; const esp = Number(p.ESPULSIONI) || 0; const mvp = Number(p.MVP_VINTI) || 0;
        html += `<tr onclick="openPlayerPopup('${p.PLAYER_ID}')"><td>${photoHtml}</td><td>${(p.NOME || "").toUpperCase()}</td><td>${gol}</td><td>${assist}</td><td>${amm}</td><td>${esp}</td><td class="mvp-cell">${mvp}</td></tr>`;
    });
    html += "</table>"; container.innerHTML = html;
}

function deleteTeam(id) {
    if (!confirm("Eliminare squadra?")) return;
    document.querySelector(`[data-id="${Sanitizer.attr(id)}"]`)?.remove();
    if (window.APP_CACHE.fullTeams) delete window.APP_CACHE.fullTeams[id];
    if (window.APP_CACHE.teams) { window.APP_CACHE.teams = window.APP_CACHE.teams.filter(t => t.TEAM_ID != id); CacheManager.save(window.APP_CACHE); }
    ApiClient.deleteTeamAdmin(id).catch(console.error);
    // 🔥 AGGIUNGI QUESTA RIGA
    invalidateCacheAndRefresh('teams');
}

// ============================================================================
// 🗑 EVENT MENU & DELETE
// ============================================================================
function openEventMenu(ev, eventId, matchId) {
    ev.stopPropagation(); ev.preventDefault();
    document.querySelectorAll(".event-popup-menu").forEach(e => e.remove());
    const menu = document.createElement("div"); menu.className = "event-popup-menu";
    menu.innerHTML = `<div onclick="deleteEvent('${eventId}', '${matchId}'); this.parentElement.remove()">🗑 Elimina evento</div>`;
    menu.style.cssText = `position: fixed;left: ${ev.clientX}px;top: ${ev.clientY}px;background: white;border-radius: 6px;box-shadow: 0 4px 12px rgba(0,0,0,0.15);padding: 8px 0;z-index: 10000;min-width: 140px;`;
    const menuItem = menu.querySelector("div"); menuItem.style.cssText = `padding: 8px 16px;cursor: pointer;font-size: 13px;color: #333;`;
    menuItem.onmouseover = () => menuItem.style.background = "#f5f5f5"; menuItem.onmouseout = () => menuItem.style.background = "white";
    menu.onclick = e => e.stopPropagation(); document.body.appendChild(menu);
    setTimeout(() => { const close = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", close); } }; document.addEventListener("click", close, { once: true }); }, 0);
}

async function deleteEvent(eventId, matchId) {
    if (!confirm("Eliminare evento?")) return;
    const strEventId = String(eventId); const strMatchId = String(matchId);
    const events = window.APP_CACHE.eventsByMatch?.[strMatchId] || [];
    const newEvents = events.filter(e => String(e.EVENT_ID) !== strEventId);
    if (newEvents.length === events.length) { console.warn("Evento non trovato in cache locale:", strEventId); }
    window.APP_CACHE.eventsByMatch[strMatchId] = newEvents; CacheManager.save(window.APP_CACHE);
    const match = window.APP_STATE.lastMatch;
    if (match && String(match.MATCH_ID) === strMatchId) {
        const deletedEvent = events.find(e => String(e.EVENT_ID) === strEventId);
        if (deletedEvent && deletedEvent.TIPO === 'GOAL') {
            const isCasa = String(deletedEvent.TEAM_ID) === String(match.CASA_ID);
            if (isCasa) { match.GOL_CASA = Math.max(0, (Number(match.GOL_CASA) || 0) - 1); } else { match.GOL_TRASFERTA = Math.max(0, (Number(match.GOL_TRASFERTA) || 0) - 1); }
            if (window.APP_CACHE.matches) { const idx = window.APP_CACHE.matches.findIndex(m => String(m.MATCH_ID) === String(matchId)); if (idx >= 0) { const existingMatch = window.APP_CACHE.matches[idx]; window.APP_CACHE.matches[idx] = { ...existingMatch, GOL_CASA: match.GOL_CASA, GOL_TRASFERTA: match.GOL_TRASFERTA }; CacheManager.save(window.APP_CACHE); } }
            const scoreEl = document.querySelector(".score-big"); if (scoreEl) { scoreEl.textContent = `${match.GOL_CASA} - ${match.GOL_TRASFERTA}`; }
        }
        renderEvents(newEvents, match); renderPlayersTab(window.APP_CACHE.fullTeams?.[String(match.CASA_ID)], window.APP_CACHE.fullTeams?.[String(match.TRASFERTA_ID)], match);
    }
    try { await ApiClient.deleteEventAdmin(strEventId); refreshStandingsDebounced(500); invalidateCacheAndRefresh('matches'); } catch (error) { console.error('Errore eliminazione backend:', error); alert('Errore eliminazione: ' + error.message); }
}

function updateScoreLocally(matchId, eventId) {
    const match = window.APP_STATE.lastMatch; if (!match) return;
    const events = window.APP_CACHE.eventsByMatch?.[matchId] || [];
    const event = events.find(e => e.EVENT_ID === eventId);
    if (event?.TIPO === 'GOAL') {
        const isCasa = String(event.TEAM_ID) === String(match.CASA_ID);
        if (isCasa) { match.GOL_CASA = Math.max(0, (match.GOL_CASA || 0) - 1); } else { match.GOL_TRASFERTA = Math.max(0, (match.GOL_TRASFERTA || 0) - 1); }
        const scoreEl = document.querySelector(".score-big"); if (scoreEl) { scoreEl.textContent = `${match.GOL_CASA || 0} - ${match.GOL_TRASFERTA || 0}`; }
    }
}

function updateMatchUI(match) {
    const statusEl = document.getElementById("matchStatus"), btn = document.querySelector(".start-btn");
    if (!statusEl || !btn) return;
    if (match.STATO_PARTITA === "LIVE") { statusEl.innerHTML = "LIVE"; statusEl.classList.add("live"); btn.textContent = "CONCLUDI"; btn.classList.add("active"); }
    else if (match.STATO_PARTITA === "SUPP") { statusEl.innerHTML = "SUPP"; statusEl.classList.add("live"); btn.textContent = "CONCLUDI"; btn.classList.add("active"); }
    else if (match.STATO_PARTITA === "RIGORI") { statusEl.innerHTML = "RIGORI"; statusEl.classList.add("live"); btn.textContent = "CONCLUDI"; btn.classList.add("active"); }
    else if (match.STATO_PARTITA === "FINITA") { statusEl.textContent = "TERMINATA"; statusEl.classList.remove("live"); btn.textContent = "INIZIO"; btn.classList.remove("active"); }
    else { statusEl.textContent = ""; btn.textContent = "INIZIO"; }
}

function updateMVPBanner(match) {
    const mvpBox = document.getElementById("mvpBanner"); if (!mvpBox) return;
    const isFinished = match.STATO_PARTITA === "FINITA"; const mvpName = match.MVP;
    if (isFinished && mvpName) { mvpBox.innerHTML = `<div class="mvp-title">🏆 MVP DEL MATCH</div><div class="mvp-name">${mvpName.toUpperCase()}</div>`; mvpBox.classList.add("show"); mvpBox.style.display = "flex"; }
    else { mvpBox.innerHTML = ""; mvpBox.classList.remove("show"); mvpBox.style.display = "none"; }
}

// ============================================================================
// ⚽ MATCHES FUNCTIONS
// ============================================================================
function showMatches() {
    closeTournamentPodium();
    window.location.hash = '#matches'; stopMatchLiveRefresh(); stopStandingsLiveRefresh(); renderToolbar("matches");
    // 🔥 Controlla se ci sono partite LIVE e avvia polling
    const hasLiveMatch = (window.APP_CACHE.matches || []).some(m => 
        m.STATO_PARTITA === "LIVE" || m.STATO_PARTITA === "SUPP" || m.STATO_PARTITA === "RIGORI"
    );
    if (hasLiveMatch) {
        startMatchLiveRefresh();
    }
    document.getElementById("app").innerHTML = `<div class="matches-page"><div class="page-title">PARTITE</div><div class="matches-actions"><div class="phase-btn" onclick="openNewMatchPage()">+ INSERISCI PARTITE</div></div><div class="dates-toolbar-wrapper"><div class="dates-toolbar" id="datesToolbar"></div></div><div class="matches-scroll"><div id="matchesList"></div></div></div>`;
    renderMatches();
}

function renderMatches() {
  const data = window.APP_CACHE.matches || [];
  
  const matches = (data || []).filter(m => m?.MATCH_ID && m?.DATA).map(m => ({ 
    ...m, 
    DATA: String(m.DATA).slice(0, 10), 
    STATO_PARTITA: String(m.STATO_PARTITA || "").trim().toUpperCase() 
  }));
  
  // ✅ LOG PER VEDERE LE DATE DISPONIBILI
  const uniqueDates = [...new Set(matches.map(m => m.DATA))].sort();
  
  const dates = uniqueDates.slice(0, 30);
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
        
        // ✅ MODIFICATO: Layout responsive con day-name visibile solo su desktop
        html += `
            <div class="date-item ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}" 
                 onclick="selectDate('${d}')" 
                 style="flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 12px; margin: 0 4px; border-radius: 8px; cursor: pointer; transition: all 0.2s; min-width: 50px;">
                <div class="date-day" style="font-size: 20px; font-weight: 700; line-height: 1;">${dayNum}</div>
                <div class="date-month" style="font-size: 11px; font-weight: 600; text-transform: uppercase; line-height: 1; margin-top: 2px;">${monthName}</div>
            </div>`;
    });
    
    container.innerHTML = html; 
    
    // ✅ AGGIUNTO: Stili per il container con scroll orizzontale
    container.style.cssText = `
        display: flex;
        flex-direction: row;
        overflow-x: auto;
        overflow-y: hidden;
        white-space: nowrap;
        padding: 10px 0;
        margin: 0 -10px;
        scroll-behavior: smooth;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
    `;
    container.classList.add('dates-toolbar-scroll');
    
    // Nascondi scrollbar ma mantieni funzionalità
    const style = document.createElement('style');
    style.textContent = `
        .dates-toolbar-scroll::-webkit-scrollbar {
            display: none;
        }
        .date-item.active {
            background: #7a1e2c !important;
            color: white !important;
        }
        .date-item.today {
            border: 2px solid #7a1e2c;
        }
        .date-item:hover {
            background: #f5f5f5;
        }
        .date-item.active:hover {
            background: #7a1e2c !important;
        }
    `;
    if (!document.getElementById('datesToolbarStyles')) {
        style.id = 'datesToolbarStyles';
        document.head.appendChild(style);
    }
    
    setTimeout(() => {
        centerActiveDate();
        enableDragScrollDates();
    }, 100);
}

function enableDragScrollDates() {
    const el = document.getElementById("datesToolbar");
    if (!el) return;
    
    const isMobile = window.innerWidth <= 768;
    
    let isDown = false;
    let startX;
    let scrollLeft;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    
    window.isDraggingDates = false;
    
    // 🖱️ MOUSE EVENTS (solo PC)
    el.addEventListener("mousedown", (e) => {
        if (isMobile) return;
        isDown = true;
        el.classList.add("dragging");
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
        window.isDraggingDates = false;
    });
    
    el.addEventListener("mouseleave", () => {
        isDown = false;
        el.classList.remove("dragging");
    });
    
    el.addEventListener("mouseup", () => {
        isDown = false;
        el.classList.remove("dragging");
    });
    
    el.addEventListener("mousemove", (e) => {
        if (!isDown || isMobile) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        const walk = (x - startX) * 1.2;
        el.scrollLeft = scrollLeft - walk;
        window.isDraggingDates = true;
    });
    
    // 📱 TOUCH EVENTS - solo per aggiornare indicatori, NON per scroll
    // Lo scroll orizzontale lo gestisce nativamente il browser con overflow-x: auto
    el.addEventListener("touchstart", (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }, { passive: true });
    
    el.addEventListener("touchend", () => {
        // Aggiorna indicatori dopo il touch
        updateScrollIndicators();
    }, { passive: true });
    
    // 🔄 AGGIORNAMENTO INDICATORI SCROLL
    function updateScrollIndicators() {
        const wrapper = el.closest('.dates-toolbar-wrapper');
        if (!wrapper) return;
        const canScrollLeft = el.scrollLeft > 5;
        const canScrollRight = el.scrollLeft < (el.scrollWidth - el.clientWidth - 5);
        wrapper.classList.toggle('can-scroll-left', canScrollLeft);
        wrapper.classList.toggle('can-scroll-right', canScrollRight);
    }
    
    el.addEventListener("scroll", updateScrollIndicators, { passive: true });
    window.addEventListener("resize", updateScrollIndicators);
    
    // Inizializza indicatori
    setTimeout(updateScrollIndicators, 100);
}

function selectDate(date) {
    if (window.isDraggingDates) return;

    window.APP_STATE.selectedDate = date;
    window.APP_STATE.userSelectedDate = true;
    renderDatesToolbar();
    renderMatchesByDate(date);
}

function getMatchPriority(m) {
    const status = (m.STATO_PARTITA || "").toUpperCase();
    
    // 1. Partite LIVE - massima priorità (vanno sempre sopra)
    if (status === "LIVE" || status === "SUPP" || status === "RIGORI") {
        return 0;
    }
    
    // 2. Partite programmate (non iniziate) - priorità media
    if (status !== "FINITA") {
        return 1;
    }
    
    // 3. Partite TERMINATE - priorità bassa (vanno in fondo)
    if (status === "FINITA") {
        return 2;
    }
    
    // Default
    return 3;
}

function centerActiveDate() {
    const container = document.getElementById("datesToolbar");
    const active = container?.querySelector(".date-item.active");
    if (!active || !container) return;
    
    const containerWidth = container.offsetWidth;
    const activeOffset = active.offsetLeft;
    const activeWidth = active.offsetWidth;
    const offset = activeOffset - (containerWidth / 2) + (activeWidth / 2);
    
    container.scrollTo({ 
        left: offset, 
        behavior: "smooth" 
    });
}

function renderMatchesByDate(date) {
   const container = document.getElementById("matchesList");
    if (!container) return;
    
    const allMatches = window.APP_CACHE.matches || [];
    
    let matches = allMatches.filter(m => {
        const matchDate = String(m.DATA || "").slice(0, 10);
        return matchDate === date && m?.MATCH_ID;
    }).sort((a, b) => {
        // Prima ordina per priorità (stato partita)
        const pa = getMatchPriority(a);
        const pb = getMatchPriority(b);
        
        if (pa !== pb) return pa - pb;
        
        // Se stessa priorità, ordina per ora
        return (a.ORA || "").localeCompare(b.ORA || "");
    });
  
  if (matches.length === 0) {
    container.innerHTML = `
    <div style="text-align:center;padding:40px;color:#888">
      <div style="font-size:3rem;margin-bottom:16px">📅</div>
      <div>Nessuna partita per questa data</div>
      <div style="font-size:12px;margin-top:10px">Data selezionata: ${date}</div>
    </div>`;
    return;
  }

    let html = "";

    matches.forEach(m => {
        // 🔥 LOGO SQUADRA CASA con fallback
        const logoCasa = m.LOGO_CASA 
            ? `<div class="team-logo-placeholder-wrap">
                <img src="${getCachedImage(m.LOGO_CASA, 50)}" 
                     alt="${Sanitizer.attr(m.SQUADRA_CASA || '')}" 
                     class="team-logo-placeholder-img" 
                     onerror="this.style.display='none'; this.parentElement.querySelector('.team-logo-placeholder-fallback').style.display='flex'">
                <div class="team-logo-placeholder-fallback" style="display:none">⚽</div>
               </div>`
            : `<div class="team-logo-placeholder-wrap"><div class="team-logo-placeholder-fallback">⚽</div></div>`;

        // 🔥 LOGO SQUADRA TRASFERTA con fallback
        const logoTrasf = m.LOGO_TRASFERTA 
            ? `<div class="team-logo-placeholder-wrap">
                <img src="${getCachedImage(m.LOGO_TRASFERTA, 50)}" 
                     alt="${Sanitizer.attr(m.SQUADRA_TRASFERTA || '')}" 
                     class="team-logo-placeholder-img" 
                     onerror="this.style.display='none'; this.parentElement.querySelector('.team-logo-placeholder-fallback').style.display='flex'">
                <div class="team-logo-placeholder-fallback" style="display:none">⚽</div>
               </div>`
            : `<div class="team-logo-placeholder-wrap"><div class="team-logo-placeholder-fallback">⚽</div></div>`;

        // 🔥 BADGE FASE (Quarti, Semifinali, Finale)
        let faseBadge = "";
            const turnoVal = m.TURNO || m.turno || m.matchKey || "";
            const faseVal = m.FASE || "";
            
            if (turnoVal && !["LIVE", "SUPP", "RIGORI"].includes(m.STATO_PARTITA)) {
              const turnoMap = {
                "Q1": "QUARTI", "Q2": "QUARTI", "Q3": "QUARTI", "Q4": "QUARTI",
                "SF1": "SEMIFINALE", "SF2": "SEMIFINALE",
                "F": "FINALE", "TP": "FINALE 3°-4°"
              };
              const turno = turnoMap[turnoVal] || turnoVal;
              
              // ✅ MOSTRA "GIRONE X" se FASE = GIRONI
              let badgeText = turno;
              if (faseVal === "GIRONI" && turnoVal) {
                badgeText = `GIRONE ${turnoVal}`;
              }
              
              faseBadge = `<div class="match-fase-badge-text" style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-top:4px">${Sanitizer.html(badgeText)}</div>`;
            }

        // 🔥 CENTRO CARD: punteggio, stato, badge fase
        let center = "";
        const status = String(m.STATO_PARTITA || "").trim().toUpperCase();
        
        if (status === "LIVE") {
            center = `<div class="score live">${m.GOL_CASA ?? 0} - ${m.GOL_TRASFERTA ?? 0}</div>
                      <div class="status live">LIVE</div>${faseBadge}`;
        }
        else if (status === "SUPP") {
            center = `<div class="score live">${m.GOL_CASA ?? 0} - ${m.GOL_TRASFERTA ?? 0}</div>
                      <div class="status live">SUPP</div>${faseBadge}`;
        }
        else if (status === "RIGORI") {
            const rigoriCasa = m.RIGORI_CASA ?? m.RIGORE_CASA ?? 0;
            const rigoriTrasf = m.RIGORI_TRASFERTA ?? m.RIGORE_TRASFERTA ?? 0;
            center = `<div class="score live">${m.GOL_CASA ?? 0} - ${m.GOL_TRASFERTA ?? 0} 
                      <span style="font-size:14px;color:#888">(${rigoriCasa}-${rigoriTrasf} dcr)</span></div>
                      <div class="status live">RIGORI</div>${faseBadge}`;
        }
        else if (status === "FINITA") {
          // 🔥 Gestione compatibile rigori: controlla entrambe le varianti di campo
          const rc = m.RIGORE_CASA ?? m.RIGORI_CASA;
          const rt = m.RIGORE_TRASFERTA ?? m.RIGORI_TRASFERTA;
          
          // ✅ Mostra DCR solo se entrambi i valori sono NUMERI > 0
          // (0 significa che le colonne J/K sono vuote, non che hanno fatto 0 rigori)
          const hasValidRigori = (
            rc !== null && rc !== undefined && rc !== "" && Number(rc) > 0 &&
            rt !== null && rt !== undefined && rt !== "" && Number(rt) > 0
          );
          
          if (hasValidRigori) {
            center = `<div class="score">${m.GOL_CASA ?? 0} - ${m.GOL_TRASFERTA ?? 0}
            <span style="font-size:12px;color:#666">(${rc}-${rt} dcr)</span></div>
            <div class="status">TERMINATA</div>${faseBadge}`;
          } else {
            center = `<div class="score">${m.GOL_CASA ?? 0} - ${m.GOL_TRASFERTA ?? 0}</div>
            <div class="status">TERMINATA</div>${faseBadge}`;
          }
        }
        else {
            // Partita programmata
            center = `<div class="time">${m.ORA || "--:--"}</div>${faseBadge}`;
        }

        // 🔥 Classe per highlight partite LIVE
        const isActive = ["LIVE", "SUPP", "RIGORI"].includes(status);
        const matchClass = isActive ? "match-card live-match" : "match-card";
        
        // 🔥 Nomi squadre sanitizzati per sicurezza
        const nomeCasa = Sanitizer.html((m.SQUADRA_CASA || "").toUpperCase());
        const nomeTrasf = Sanitizer.html((m.SQUADRA_TRASFERTA || "").toUpperCase());
        const matchId = Sanitizer.attr(m.MATCH_ID);

        html += `
            <div class="${matchClass}" onclick="openMatch('${matchId}')">
                <div class="team-block left">
                    ${logoCasa}
                    <div class="team-name">${nomeCasa}</div>
                </div>
                <div class="match-center">${center}</div>
                <div class="team-block right">
                    <div class="team-name">${nomeTrasf}</div>
                    ${logoTrasf}
                </div>
                <div class="match-options" onclick='event.stopPropagation(); openMatchMenu(event, "${matchId}")'>⋮</div>
            </div>`;
    });

    container.innerHTML = html;
}

function openMatchMenu(ev, matchId) {
    ev.stopPropagation(); ev.preventDefault(); document.querySelectorAll(".event-popup-menu").forEach(e => e.remove());
    const menu = document.createElement("div"); menu.className = "event-popup-menu"; menu.innerHTML = `<div onclick='this.parentElement.remove(); deleteMatch("${Sanitizer.attr(matchId)}")'>🗑 Elimina partita</div>`;
    menu.style.position = "fixed"; menu.style.left = ev.clientX + "px"; menu.style.top = ev.clientY + "px"; menu.onclick = e => e.stopPropagation(); document.body.appendChild(menu);
    setTimeout(() => { const close = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", close); } }; document.addEventListener("click", close, { once: true }); }, 0);
}

async function deleteMatch(matchId) {
    if (!confirm("Eliminare partita?")) return;
    
    // 1. Rimuovi immediatamente dalla UI (feedback istantaneo)
    delete window.APP_STATE.matchesById[matchId];
    if (window.APP_CACHE.matches) { 
        window.APP_CACHE.matches = window.APP_CACHE.matches.filter(m => String(m.MATCH_ID) !== String(matchId)); 
        CacheManager.save(window.APP_CACHE); 
    }
    renderMatches();
    
    // 2. Elimina dal backend e ASPETTA la conferma
    try {
        await ApiClient.deleteMatchAdmin(matchId);
        console.log('✅ Partita eliminata dal backend');
        
        // 3. Solo ora ricarica i dati freschi
        await invalidateCacheAndRefresh('matches');
    } catch (error) {
        console.error('❌ Errore eliminazione:', error);
        alert('Errore durante l\'eliminazione: ' + error.message);
    }
}

function openNewMatchPage() {
    const modal = document.createElement("div"); modal.className = "modalOverlay";
    modal.innerHTML = `<div class="modalBox match-modal" id="matchBox"><div class="modalTitle">NUOVA PARTITA</div><div class="match-form"><select id="matchGirone" class="match-select"><option value="">SELEZIONA GIRONE</option><option value="A">GIRONE A</option><option value="B">GIRONE B</option></select><div class="match-row"><select id="teamCasa" class="match-select"><option value="">SQUADRA CASA</option></select><div class="vs-big">VS</div><select id="teamTrasferta" class="match-select"><option value="">SQUADRA TRASFERTA</option></select></div><div class="match-row time-row"><input type="date" id="matchDate" class="match-input"><input type="time" id="matchTime" class="match-input"></div><div class="modalActions"><div class="phase-btn" onclick="saveMatch()">SALVA</div></div></div></div>`;
    document.body.appendChild(modal); modal.onclick = () => modal.remove(); document.getElementById("matchBox").onclick = e => e.stopPropagation();
    document.getElementById("matchGirone").onchange = function() {
        const girone = this.value, casa = document.getElementById("teamCasa"), trasferta = document.getElementById("teamTrasferta");
        casa.innerHTML = `<option value="">SQUADRA CASA</option>`; trasferta.innerHTML = `<option value="">SQUADRA TRASFERTA</option>`;
        if (!girone) return; const teams = (window.APP_CACHE.teams || []).filter(t => t.GIRONE === girone);
        teams.forEach(t => { casa.innerHTML += `<option value="${Sanitizer.attr(t.TEAM_ID)}">${Sanitizer.html(t.NOME_SQUADRA)}</option>`; trasferta.innerHTML += `<option value="${Sanitizer.attr(t.TEAM_ID)}">${Sanitizer.html(t.NOME_SQUADRA)}</option>`; });
    };
}

async function saveMatch() {
    const girone = document.getElementById("matchGirone")?.value, casa = document.getElementById("teamCasa")?.value, trasferta = document.getElementById("teamTrasferta")?.value;
    const data = document.getElementById("matchDate")?.value, ora = document.getElementById("matchTime")?.value;
    if (!girone) { alert("Seleziona girone"); return; } if (!casa || !trasferta) { alert("Seleziona le squadre"); return; } if (casa === trasferta) { alert("Le squadre devono essere diverse"); return; }
    try {
        await ApiClient.createMatchGirone(girone, casa, trasferta, data, ora);
        document.querySelector(".modalOverlay")?.remove();
        // 🔥 AGGIUNGI QUESTA RIGA
        await invalidateCacheAndRefresh('matches');
        showMatches();
    } catch (e) { alert("Errore: " + (e?.message || e)); }
}

// ============================================================================
// 🎮 MATCH DETAIL & RIGORI
// ============================================================================
function setCurrentMatch(id) { window.APP_STATE.currentMatchId = id; }
function getCurrentMatch() { return window.APP_STATE.matchesById[window.APP_STATE.currentMatchId]; }

async function forceReloadEvents(matchId, match) {
    console.log('🔄 [FORCE RELOAD] Eventi per match:', matchId);
    try { 
        const freshEvents = await ApiClient.getEventsAdmin(matchId); 
        const mergedEvents = mergeEventsWithLocal(freshEvents, matchId);
        
        window.APP_CACHE.eventsByMatch[matchId] = mergedEvents; 
        CacheManager.save(window.APP_CACHE); 
        
        // 🔥 Ricalcola il punteggio con gli eventi mergiati
        const calculatedScore = calculateMatchScore(match, mergedEvents);
        const updatedMatch = { ...match, ...calculatedScore };
        
        renderEvents(mergedEvents, updatedMatch);
        
        // Aggiorna anche il punteggio a video se siamo nella pagina match
        const scoreEl = document.querySelector(".score-big");
        if (scoreEl) {
            scoreEl.textContent = `${updatedMatch.GOL_CASA || 0} - ${updatedMatch.GOL_TRASFERTA || 0}`;
        }
    } catch (error) { 
        console.error('❌ [FORCE RELOAD] Errore:', error); 
    }
}

function openMatch(id) {
    const myNonce = ++window.APP_STATE._matchRequestNonce;
    setCurrentMatch(id);
    window.APP_STATE._matchLoading = true;
    setTimeout(() => { window.APP_STATE._matchLoading = false; }, 10000);
    window.APP_STATE.activeMatchTab = 'diretta';
    const cachedMatch = window.APP_CACHE.matches?.find(m => String(m.MATCH_ID) === String(id));
    
    // ✅ PARTE 1: Render immediato dalla cache (se disponibile)
    if (cachedMatch && cachedMatch.CASA_ID && cachedMatch.TRASFERTA_ID) {

        // Render immediato con cache
        const localEvents = window.APP_CACHE.eventsByMatch?.[id] || [];
        const calculatedScore = calculateMatchScore(cachedMatch, localEvents);
        renderMatchPage({...cachedMatch, ...calculatedScore});
        updateMatchUI(cachedMatch);
        window.APP_STATE.lastMatch = { ...cachedMatch, ...calculatedScore };
        renderEvents(localEvents, cachedMatch);
        loadPlayersForMatch(cachedMatch);
        renderPenaltyIndicators(localEvents, cachedMatch);

        if (cachedMatch.STATO_PARTITA === "RIGORI" && !document.getElementById('rigoriPopupOverlay')) {
            const isMobile = window.innerWidth <= 768;
            console.log('🎯 Apertura automatica popup rigori - Device:', isMobile ? 'MOBILE' : 'PC');
            setTimeout(() => openRigoriPopup(isMobile), 300);
        }
        
        // Aggiorna cache in background (senza bloccare il popup)
        Promise.all([
            ApiClient.getMatchFull(id),
            ApiClient.getEventsAdmin(id)
        ]).then(([freshData, freshEvents]) => {
            if (freshData?.match && freshEvents) {
                const mergedEvents = mergeEventsWithLocal(freshEvents, id);
                window.APP_CACHE.eventsByMatch[id] = mergedEvents;
                if (window.APP_CACHE.matches) {
                    const idx = window.APP_CACHE.matches.findIndex(m => String(m.MATCH_ID) === String(id));
                    if (idx >= 0) {
                        window.APP_CACHE.matches[idx] = {
                            ...window.APP_CACHE.matches[idx],
                            ...freshData.match,
                            RIGORE_CASA: freshData.match.RIGORE_CASA ?? freshData.match.rigoriCasa,
                            RIGORE_TRASFERTA: freshData.match.RIGORE_TRASFERTA ?? freshData.match.rigoriTrasferta,
                            RIGORI_CASA: freshData.match.RIGORE_CASA ?? freshData.match.rigoriCasa,
                            RIGORI_TRASFERTA: freshData.match.RIGORE_TRASFERTA ?? freshData.match.rigoriTrasferta
                        };
                        CacheManager.save(window.APP_CACHE);
                    }
                }
            }
        }).catch(err => {
            console.error('❌ Errore refresh rigori:', err);
        });
        return; // Esce qui per le partite in RIGORI
    }
    
    // Per partite NON in rigori (o senza cache completa): comportamento normale
    const localEvents = window.APP_CACHE.eventsByMatch?.[id] || [];
    const calculatedScore = cachedMatch ? calculateMatchScore(cachedMatch, localEvents) : { GOL_CASA: 0, GOL_TRASFERTA: 0 };
    renderMatchPage({...cachedMatch, ...calculatedScore});
    updateMatchUI(cachedMatch);
    window.APP_STATE.lastMatch = { ...cachedMatch, ...calculatedScore };
    renderEvents(localEvents, cachedMatch);
    loadPlayersForMatch(cachedMatch);
    renderPenaltyIndicators(localEvents, cachedMatch);
    setTimeout(() => {
        const cachedEvents = window.APP_CACHE.eventsByMatch?.[id] || [];
        if (cachedEvents.length === 0) {
            console.log('⚠️ Cache eventi vuota, forzo ricarica...');
            forceReloadEvents(id, cachedMatch);
        }
    }, 500);
    
    // ✅ PARTE 2: Fetch dal backend (in background)
    ApiClient.getMatchFull(id).then(res => {
        if (myNonce !== window.APP_STATE._matchRequestNonce) return;
        if (!res?.match) return;
        const freshMatch = res.match;
        if (!freshMatch.CASA_ID || !freshMatch.TRASFERTA_ID || freshMatch.CASA_ID === "" || freshMatch.TRASFERTA_ID === "") {
            console.warn('⚠️ Backend ha ritornato ID VUOTI, MANTENGO CACHE:', freshMatch);
            return;
        }
        return ApiClient.getEventsAdmin(id).then(freshEvents => {
            const mergedEvents = mergeEventsWithLocal(freshEvents, id);
            window.APP_CACHE.eventsByMatch[id] = mergedEvents;
            CacheManager.save(window.APP_CACHE);
            const calculatedScore = calculateMatchScore(freshMatch, mergedEvents);
            console.log('✅ Backend dati validi, aggiorno cache con punteggio calcolato');
            window.APP_STATE.matchesById[freshMatch.MATCH_ID] = {...freshMatch, ...calculatedScore};
            window.APP_STATE.lastMatch = {...freshMatch, ...calculatedScore};
            if (window.APP_CACHE.matches) {
                const idx = window.APP_CACHE.matches.findIndex(m => String(m.MATCH_ID) === String(freshMatch.MATCH_ID));
                if (idx >= 0) {
                    window.APP_CACHE.matches[idx] = {
                        ...window.APP_CACHE.matches[idx],
                        ...freshMatch,
                        ...calculatedScore
                    };
                    CacheManager.save(window.APP_CACHE);
                }
            }
            // 🔥 AGGIORNA UI SOLO SE I DATI SONO CAMBIATI
            if (cachedMatch && (
                calculatedScore.GOL_CASA !== cachedMatch.GOL_CASA ||
                calculatedScore.GOL_TRASFERTA !== cachedMatch.GOL_TRASFERTA ||
                freshMatch.STATO_PARTITA !== cachedMatch.STATO_PARTITA
            )) {
                console.log('🔄 Aggiorno UI con nuovi dati backend + punteggio calcolato');
                renderMatchPage({...freshMatch, ...calculatedScore});
                renderPenaltyIndicators(mergedEvents, {...freshMatch, ...calculatedScore});
                loadPlayersForMatch(freshMatch);
            }
        });
    }).catch(err => {
        console.error('❌ Errore backend getMatchFull:', err);
    });
}

function renderMatchPage(match) {
  // ✅ VALIDAZIONE INIZIALE MIGLIORATA
  if (!match || !match.MATCH_ID) {
    console.error('❌ Match non valido', match);
    alert('Errore: dati partita non validi');
    return;
  }
  
  // ✅ CONTROLLA CHE GLI ID SQUADRA SIANO PRESENTI
  if (!match.CASA_ID || !match.TRASFERTA_ID) {
    console.error('❌ ID squadre mancanti!', match);
    const cachedMatch = window.APP_CACHE.matches?.find(m =>
      String(m.MATCH_ID) === String(match.MATCH_ID)
    );
    if (cachedMatch?.CASA_ID && cachedMatch?.TRASFERTA_ID) {
      match.CASA_ID = cachedMatch.CASA_ID;
      match.TRASFERTA_ID = cachedMatch.TRASFERTA_ID;
    } else {
      alert('Errore: dati squadre incompleti');
      return;
    }
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
  
  // 🔥 FORZA RICARICAMENTO EVENTI
  const events = window.APP_CACHE.eventsByMatch?.[match.MATCH_ID] || [];
  if (events.length === 0) {
    ApiClient.getEventsAdmin(match.MATCH_ID).then(freshEvents => {
      const mergedEvents = mergeEventsWithLocal(freshEvents, match.MATCH_ID);
      window.APP_CACHE.eventsByMatch[match.MATCH_ID] = mergedEvents;
      CacheManager.save(window.APP_CACHE);
      const calculatedScore = calculateMatchScore(match, mergedEvents);
      const updatedMatch = { ...match, ...calculatedScore };
      renderEvents(mergedEvents, updatedMatch);
      renderPenaltyIndicators(mergedEvents, updatedMatch);
      const scoreEl = document.querySelector(".score-big");
      if (scoreEl) scoreEl.textContent = `${updatedMatch.GOL_CASA || 0} - ${updatedMatch.GOL_TRASFERTA || 0}`;
    }).catch(err => {
      console.error('❌ Errore caricamento eventi:', err);
      renderEvents([], match);
    });
  } else {
    renderEvents(events, match);
  }
  
  // 🔥 DEFINISCI LOGHI
  const logoCasa = match.LOGO_CASA
    ? `<img src="${getCachedImage(match.LOGO_CASA, 120)}" alt="${match.SQUADRA_CASA}" onerror="this.style.display='none'">`
    : `<div style="width:100px;height:100px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:1.5rem">⚽</div>`;
  const logoTrasf = match.LOGO_TRASFERTA
    ? `<img src="${getCachedImage(match.LOGO_TRASFERTA, 120)}" alt="${match.SQUADRA_TRASFERTA}" onerror="this.style.display='none'">`
    : `<div style="width:100px;height:100px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:1.5rem">⚽</div>`;
  
  const nomeCasa = (match.SQUADRA_CASA || "CASA").toUpperCase();
  const nomeTrasf = (match.SQUADRA_TRASFERTA || "TRASFERTA").toUpperCase();
  
  // 🔥 GESTIONE STATI
  const isLive = ["LIVE", "SUPP", "RIGORI"].includes(match.STATO_PARTITA);
  const isFinished = match.STATO_PARTITA === "FINITA";
  const finalStageStarted = window.APP_CACHE.meta?.finalStageStarted;
  
  // 🔥 TAB ATTIVA DINAMICA
  const currentTab = window.APP_STATE.activeMatchTab || 'diretta';
  const isMVPDisabled = !isLive;
  const mvpActiveClass = currentTab === 'mvp' ? 'active' : (isMVPDisabled ? 'disabled' : '');
  const mvpTabHtml = `<div class="mt-btn ${mvpActiveClass}" data-tab="mvp">${isLive ? "MVP" : "🏆 MVP"}</div>`;
  
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
  
  // 🔥 RECUPERA LINK DRIVE
  const linkDrive = (match.LINK_DRIVE || match.linkDrive || '');
  const mediaButtonHtml = linkDrive && linkDrive.trim() !== '' ? `
    <button class="media-button" onclick="openMediaUploadModal('${Sanitizer.attr(match.MATCH_ID)}', '${Sanitizer.url(linkDrive).replace(/'/g, "\\'")}'); event.stopPropagation();">
      <span>MEDIA</span>
    </button>
  ` : '';
  
  // 🔥 TEMPLATE HTML
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
            <div class="phase-btn secondary-btn" onclick="openRigoriPopup(window.innerWidth <= 768)">RIGORI</div>
            ` : ''}
          </div>
          <div class="score-big ${isLive ? 'live-score-pulse' : ''}">${match.GOL_CASA || 0} - ${match.GOL_TRASFERTA || 0}</div>
          <div class="match-status" id="matchStatus"></div>
        </div>
        <div class="team-big right">
          <div class="team-big-name">${nomeTrasf}</div>
          ${logoTrasf}
        </div>
      </div>
      <div class="match-toolbar">
        <div class="mt-btn ${currentTab === 'diretta' ? 'active' : ''}" data-tab="diretta">DIRETTA</div>
        <div class="mt-btn ${currentTab === 'giocatori' ? 'active' : ''}" data-tab="giocatori">GIOCATORI</div>
        ${mvpTabHtml}
      </div>
      <div class="match-content">
        <div class="tab-content ${currentTab === 'diretta' ? 'active' : ''}" id="tab-diretta">
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
            <div class="match-banners-area">
              <div id="mvpBanner" class="mvp-banner"></div>
            </div>
            <div class="cronaca-title center"><span>CRONACA</span></div>
            <div id="eventsTimeline" class="events-timeline">
              <div id="eventsContent"></div>
            </div>
          </div>
        </div>
        <div class="tab-content ${currentTab === 'giocatori' ? 'active' : ''}" id="tab-giocatori">
          <div class="players-columns" id="playersColumns">
            <div style="text-align:center;padding:40px;color:#888;grid-column:1/-1">Caricamento giocatori...</div>
          </div>
        </div>
        <div class="tab-content ${currentTab === 'mvp' ? 'active' : ''}" id="tab-mvp">
          <div class="players-columns" id="mvpColumns">
            <div style="text-align:center;padding:40px;color:#888;grid-column:1/-1">
              ${isLive ? "Vota il MVP" : isFinished ? "MVP della partita" : "Disponibile durante la partita"}
            </div>
          </div>
        </div>
      </div>
      ${mediaButtonHtml}
      <div class="back-btn-wrapper">
        <div class="phase-btn secondary" onclick="showMatches()">INDIETRO</div>
      </div>
    </div>
  `;
  
  // Aggiorna UI
  updateMatchUI(match);
  if (match.STATO_PARTITA === "FINITA" && match.MVP) {
    updateMVPBanner(match);
  }
  
  // Renderizza eventi
  renderEvents(events, match);
  
  // Carica giocatori
  loadPlayersForMatch(match);
  
  // 🔥 RENDER INDICATORI RIGORI
  renderPenaltyIndicators(events, match);
  
  // 🔥 SE LA PARTITA È IN RIGORI, avvia polling accelerato per sincronizzazione
  if (match.STATO_PARTITA === "RIGORI") {
    startMatchLiveRefresh();
    
    // 🔥 Forza un refresh immediato dopo 1 secondo per aggiornare i tiri
    setTimeout(() => {
      const currentMatchId = window.APP_STATE.currentMatchId;
      if (currentMatchId && String(currentMatchId) === String(match.MATCH_ID)) {
        ApiClient.getMatchFull(match.MATCH_ID).then(freshData => {
          if (freshData?.match) {
            const updatedMatch = { ...match, ...freshData.match };
            // Aggiorna solo il punteggio se cambiato (senza rerender completo)
            const scoreEl = document.querySelector(".score-big");
            if (scoreEl) {
              scoreEl.textContent = `${updatedMatch.GOL_CASA || 0} - ${updatedMatch.GOL_TRASFERTA || 0}`;
            }
            // Aggiorna indicatori rigori con dati freschi
            const currentEvents = window.APP_CACHE.eventsByMatch?.[match.MATCH_ID] || [];
            renderPenaltyIndicators(currentEvents, updatedMatch);
          }
        }).catch(err => console.error('❌ Errore refresh rigori:', err));
      }
    }, 1000);
  }
  
  // Salva riferimento
  window.APP_STATE.lastMatch = match;
}

function getSafeMatchData(matchId) {
    if (!matchId) return null; const strMatchId = String(matchId);
    let match = window.APP_STATE.matchesById?.[strMatchId];
    if (!match && window.APP_CACHE.matches) { match = window.APP_CACHE.matches.find(m => String(m.MATCH_ID) === strMatchId); }
    if (!match) { console.error('❌ Match non trovato:', matchId); return null; }
    if (!match.CASA_ID || !match.TRASFERTA_ID) {
        console.warn('⚠️ ID squadre mancanti, provo a recuperare...');
        if (match.SQUADRA_CASA && window.APP_CACHE.teams) { const casaTeam = window.APP_CACHE.teams.find(t => String(t.NOME_SQUADRA).toUpperCase() === String(match.SQUADRA_CASA).toUpperCase()); if (casaTeam) { match.CASA_ID = casaTeam.TEAM_ID; console.log('✅ Recuperato CASA_ID:', match.CASA_ID); } }
        if (match.SQUADRA_TRASFERTA && window.APP_CACHE.teams) { const trasfTeam = window.APP_CACHE.teams.find(t => String(t.NOME_SQUADRA).toUpperCase() === String(match.SQUADRA_TRASFERTA).toUpperCase()); if (trasfTeam) { match.TRASFERTA_ID = trasfTeam.TEAM_ID; console.log('✅ Recuperato TRASFERTA_ID:', match.TRASFERTA_ID); } }
    }
    if (match.CASA_ID) { const casaData = window.APP_CACHE.fullTeams?.[String(match.CASA_ID)]; if (casaData?.team) { match.SQUADRA_CASA = casaData.team.NOME_SQUADRA || match.SQUADRA_CASA; match.LOGO_CASA = casaData.team.LOGO_ID || match.LOGO_CASA; } }
    if (match.TRASFERTA_ID) { const trasfData = window.APP_CACHE.fullTeams?.[String(match.TRASFERTA_ID)]; if (trasfData?.team) { match.SQUADRA_TRASFERTA = trasfData.team.NOME_SQUADRA || match.SQUADRA_TRASFERTA; match.LOGO_TRASFERTA = trasfData.team.LOGO_ID || match.LOGO_TRASFERTA; } }
    match.SQUADRA_CASA = match.SQUADRA_CASA || "CASA"; match.SQUADRA_TRASFERTA = match.SQUADRA_TRASFERTA || "TRASFERTA";
    match.GOL_CASA = Number(match.GOL_CASA) || 0; match.GOL_TRASFERTA = Number(match.GOL_TRASFERTA) || 0;
    return match;
}

function ensureMatchHasTeamIds(match) {
    if (!match) return null; if (match.CASA_ID && match.TRASFERTA_ID) { return match; }
    console.warn('🔧 Recovery ID squadre per match:', match.MATCH_ID);
    const teams = window.APP_CACHE.teams || [];
    if (!match.CASA_ID && match.SQUADRA_CASA) { const casaTeam = teams.find(t => String(t.NOME_SQUADRA).toUpperCase() === String(match.SQUADRA_CASA).toUpperCase()); if (casaTeam) { match.CASA_ID = casaTeam.TEAM_ID; console.log('✅ Recuperato CASA_ID:', match.CASA_ID); } }
    if (!match.TRASFERTA_ID && match.SQUADRA_TRASFERTA) { const trasfTeam = teams.find(t => String(t.NOME_SQUADRA).toUpperCase() === String(match.SQUADRA_TRASFERTA).toUpperCase()); if (trasfTeam) { match.TRASFERTA_ID = trasfTeam.TEAM_ID; console.log('✅ Recuperato TRASFERTA_ID:', match.TRASFERTA_ID); } }
    return match;
}

async function toggleMatch() {
    const match = window.APP_STATE.lastMatch;
    if (!match) return;

    // Determina il nuovo stato
    const isCurrentlyActive = ["LIVE", "SUPP", "RIGORI"].includes(match.STATO_PARTITA);
    const newStatus = isCurrentlyActive ? "FINITA" : "LIVE";

    // 🔥 1. AGGIUNTA CONFERMA PER LA CONCLUSIONE
    if (newStatus === "FINITA") {
        if (!confirm("⚠️ Sei sicuro di voler CONCLUDERE la partita?\n\nQuesta azione disattiverà l'inserimento di nuovi eventi e avvierà il calcolo dell'MVP.")) {
            return; // L'utente ha annullato, non facciamo nulla
        }
    }

    // Aggiorna stato locale immediatamente per reattività UI istantanea
    match.STATO_PARTITA = newStatus;
    window.APP_STATE.lastMatch = match;
    updateMatchUI(match); // Aggiorna il badge di stato e il pulsante principale

    // Disabilita/Abilita i pulsanti degli eventi in base al nuovo stato
    const canAddEvents = (newStatus === "LIVE" || newStatus === "SUPP") && (match.FASE === "FINALI" || !window.APP_CACHE.meta?.finalStageStarted);
    document.querySelectorAll('.phase-btn.small').forEach(btn => {
        if (btn.textContent.trim().includes('+ EVENTO')) {
            if (canAddEvents) {
                btn.style.opacity = '1'; 
                btn.style.pointerEvents = 'auto'; 
                btn.style.cursor = 'pointer';
                if (btn.textContent.includes('CASA')) btn.onclick = () => addEvent('casa');
                else if (btn.textContent.includes('TRASFERTA')) btn.onclick = () => addEvent('trasferta');
            } else {
                btn.style.opacity = '0.5'; 
                btn.style.pointerEvents = 'none'; 
                btn.style.cursor = 'not-allowed'; 
                btn.onclick = null;
            }
        }
    });

    let freshMatch = null;
    try {
        // 1. Invia aggiornamento al backend
        await ApiClient.updateMatchStatus(match.MATCH_ID, newStatus);

        // 2. Gestione Polling
        if (newStatus === "LIVE") {
            startMatchLiveRefresh();
        } else {
            stopMatchLiveRefresh();
        }

        // 3. Recupera i dati freschi dal backend (incluso eventuale MVP calcolato)
        const fullData = await ApiClient.getMatchFull(match.MATCH_ID);
        if (fullData?.match) {
            freshMatch = fullData.match;
            window.APP_STATE.lastMatch = freshMatch;
            window.APP_STATE.matchesById[freshMatch.MATCH_ID] = freshMatch;

            // Aggiorna cache globale delle partite
            if (window.APP_CACHE.matches) {
                const idx = window.APP_CACHE.matches.findIndex(m => String(m.MATCH_ID) === String(freshMatch.MATCH_ID));
                if (idx >= 0) {
                    window.APP_CACHE.matches[idx] = { ...window.APP_CACHE.matches[idx], ...freshMatch };
                    CacheManager.save(window.APP_CACHE);
                }
            }

            // 🔥 4. RERENDER COMPLETO DELLA PAGINA (Risolve il problema del "non si aggiorna finché non esco e rientro")
            renderMatchPage(freshMatch);

            // Gestione MVP in background se la partita è appena finita
            if (newStatus === "FINITA") {
                console.log("🏆 Partita conclusa. Gestione MVP in background...");
                (async () => {
                    try {
                        await submitAllMVPVotes(freshMatch.MATCH_ID);
                        await ApiClient.finalizeMVP(freshMatch.MATCH_ID);
                        
                        // Dopo la finalizzazione, ricarichiamo di nuovo per mostrare l'MVP definitivo nella UI
                        const finalData = await ApiClient.getMatchFull(freshMatch.MATCH_ID);
                        if (finalData?.match) {
                            window.APP_STATE.lastMatch = finalData.match;
                            renderMatchPage(finalData.match); // Aggiorna UI con MVP definitivo
                        }
                        refreshStandingsDebounced(500);
                    } catch (err) {
                        console.error("Errore background MVP:", err);
                    }
                })();
            } else {
                refreshStandingsDebounced(500);
            }
        }
    } catch (error) {
        console.error('Errore toggle match:', error);
        alert("Errore durante l'aggiornamento: " + (error.message || "Sconosciuto"));
        
        // Revert locale in caso di errore di rete
        match.STATO_PARTITA = isCurrentlyActive ? "LIVE" : "FINITA";
        window.APP_STATE.lastMatch = match;
        updateMatchUI(match);
    }

    // Aggiorna classifiche e lista partite se finita
    if (newStatus === "FINITA") {
        invalidateCacheAndRefresh('standings');
        invalidateCacheAndRefresh('matches');
        // 🔥 AGGIUNGI QUESTA RIGA:
        invalidateCacheAndRefresh('finalStage');
    }
}

async function forzaRicalcoloFaseFinale() {
    
    try {
        // 1. Invalida cache
        const finalData = await ApiClient.getFinalStageMatches();
        if (finalData) {
            window.APP_CACHE.finalStage = finalData;
            CacheManager.save(window.APP_CACHE);
            console.log('✅ Cache finalStage aggiornata');
        }
        
        // 2. Aggiorna matches
        const matches = await ApiClient.getMatches();
        if (matches) {
            window.APP_CACHE.matches = matches;
            hydrateMatches(matches);
            CacheManager.save(window.APP_CACHE);
            console.log('✅ Cache matches aggiornata');
        }
        
        // 3. Rerenderizza se siamo nella pagina giusta
        if (document.querySelector('.final-stage-page')) {
            renderFinalStage(finalData || window.APP_CACHE.finalStage);
            console.log('✅ Tabellone rerenderizzato');
        }
        
        // 4. Aggiorna anche standings se necessario
        if (document.querySelector('.standings-page')) {
            const standings = await ApiClient.getStandings();
            if (standings) {
                window.APP_CACHE.standings = standings;
                CacheManager.save(window.APP_CACHE);
                if (window.APP_STATE._activeStandingsTab === "fasefinale") {
                    renderFinalStage(finalData || window.APP_CACHE.finalStage);
                }
            }
        }
        
        console.log('✅ Ricalcolo fase finale completato');
    } catch (error) {
        console.error('❌ Errore nel ricalcolo:', error);
    }
}

function addEvent(team) {
    let match = window.APP_STATE.lastMatch;
    if (!match || !match.CASA_ID || !match.TRASFERTA_ID) { 
        const matchId = window.APP_STATE.currentMatchId; 
        match = window.APP_STATE.matchesById?.[matchId]; 
        if (!match?.CASA_ID) { match = window.APP_CACHE.matches?.find(m => String(m.MATCH_ID) === String(matchId)); } 
    }
    
    if (!match) { alert("Partita non caricata. Ricarica la pagina."); return; }
    if (!match.CASA_ID || !match.TRASFERTA_ID) { alert("Errore: dati squadra incompleti."); return; }
    
    // 🔥 FIX: Permetti eventi anche in SUPP e RIGORI
    if (!["LIVE", "SUPP", "RIGORI"].includes(match.STATO_PARTITA)) { 
        alert("La partita non è in corso."); 
        return; 
    }
    
    if (match.FASE === "GIRONI" && window.APP_CACHE.meta?.finalStageStarted) { 
        alert("Impossibile modificare eventi: fase finale iniziata"); 
        return; 
    }
    openEventPopup(team);
}

function openEventPopup(team) {
    const match = window.APP_STATE.lastMatch; if (!match) { alert("Partita non caricata correttamente"); return; }
    const teamId = team === "casa" ? String(match.CASA_ID || "").trim() : String(match.TRASFERTA_ID || "").trim();
    const teamName = team === "casa" ? match.SQUADRA_CASA : match.SQUADRA_TRASFERTA;
    if (!teamId || teamId === "undefined" || teamId === "null" || teamId === "") { console.error('❌ teamId invalido:', { team, match }); alert("Errore: ID squadra non valido. Ricarica la pagina."); return; }
    const modal = document.createElement("div"); modal.className = "modalOverlay";
    modal.innerHTML = `<div class="modalBox" id="eventBox"><div class="modalTitle">NUOVO EVENTO - ${teamName || "???"}</div><div class="match-form"><select id="eventType" class="match-select"><option value="GOAL">⚽ Gol</option><option value="AMMONIZIONE">🟨 Ammonizione</option><option value="ESPULSIONE">🟥 Espulsione</option></select><input id="eventMinute" class="match-input" type="number" placeholder="Minuto" min="1" max="120"><select id="eventPlayer" class="match-select"><option value="">Caricamento...</option></select><select id="eventAssist" class="match-select"><option value="">Nessun assist</option></select><div class="modalActions"><div class="phase-btn" onclick="saveEvent('${team}')">SALVA</div><div class="phase-btn secondary" onclick="this.closest('.modalOverlay').remove()">ANNULLA</div></div></div></div>`;
    document.body.appendChild(modal); modal.onclick = (e) => { if (e.target === modal) modal.remove(); }; document.getElementById("eventBox").onclick = (e) => e.stopPropagation();
    let userHasSelected = false;
    const playerSelect = document.getElementById("eventPlayer");
    if (playerSelect) { playerSelect.addEventListener('change', () => { userHasSelected = true; console.log('👤 Utente ha selezionato giocatore:', playerSelect.value); }, { once: false }); }
    const cachedTeam = window.APP_CACHE.fullTeams?.[teamId]; const cachedPlayers = cachedTeam?.players || [];
    if (cachedPlayers.length > 0) { populateEventSelects(cachedPlayers, false); }
    ApiClient.getPlayersByTeam(teamId).then(freshPlayers => { if (!window.APP_CACHE.fullTeams) window.APP_CACHE.fullTeams = {}; window.APP_CACHE.fullTeams[teamId] = { team: cachedTeam?.team || {}, players: freshPlayers || [] }; CacheManager.save(window.APP_CACHE); if (document.getElementById("eventPlayer")) { populateEventSelects(freshPlayers, userHasSelected); } }).catch(err => console.error('Errore refresh giocatori:', err));
}

function populateEventSelects(players, preserveSelections = true) {
    const playerSelect = document.getElementById("eventPlayer"); const assistSelect = document.getElementById("eventAssist");
    if (!playerSelect || !assistSelect) return;
    const selectedPlayer = preserveSelections ? playerSelect.value : ""; const selectedAssist = preserveSelections ? assistSelect.value : "";
    console.log('🔄 populateEventSelects:', { playersCount: players?.length, preserve: preserveSelections, wasPlayerSelected: selectedPlayer, wasAssistSelected: selectedAssist });
    let playerOpts = `<option value="">Seleziona giocatore</option>`; let assistOpts = `<option value="">Nessun assist</option>`;
    (players || []).forEach(p => { const name = (p.NOME || "").toUpperCase(); const pid = String(p.PLAYER_ID); playerOpts += `<option value="${pid}">${name}</option>`; assistOpts += `<option value="${pid}">${name}</option>`; });
    playerSelect.innerHTML = playerOpts; assistSelect.innerHTML = assistOpts;
    if (preserveSelections && selectedPlayer) { const playerStillExists = players?.some(p => String(p.PLAYER_ID) === String(selectedPlayer)); if (playerStillExists) { playerSelect.value = selectedPlayer; console.log('✅ Ripristinata selezione giocatore:', selectedPlayer); } }
    if (preserveSelections && selectedAssist) { const assistStillExists = players?.some(p => String(p.PLAYER_ID) === String(selectedAssist)); if (assistStillExists) { assistSelect.value = selectedAssist; console.log('✅ Ripristinata selezione assist:', selectedAssist); } }
}

async function saveEvent(team) {
    const match = window.APP_STATE.lastMatch; if (!match) { alert("Partita non caricata"); return; }
    const type = document.getElementById("eventType")?.value; const minute = parseInt(document.getElementById("eventMinute")?.value);
    const playerId = document.getElementById("eventPlayer")?.value; const assistId = document.getElementById("eventAssist")?.value || "";
    if (!type || !minute || minute < 1 || !playerId) { alert("Compila tutti i campi"); return; }
    const teamId = String(team === "casa" ? match.CASA_ID : match.TRASFERTA_ID);
    const players = window.APP_CACHE.fullTeams?.[teamId]?.players || [];
    const player = players.find(p => String(p.PLAYER_ID) === String(playerId)); const playerName = player?.NOME || "";
    const assistPlayer = assistId ? players.find(p => String(p.PLAYER_ID) === String(assistId)) : null; const assistName = assistPlayer?.NOME || "";
    const tempEvent = { EVENT_ID: 'temp_' + Date.now(), MATCH_ID: match.MATCH_ID, TEAM_ID: teamId, TIPO: type, MINUTO: minute, PLAYER_ID: playerId, PLAYER: playerName, ASSIST: assistName };
    if (!window.APP_CACHE.eventsByMatch) window.APP_CACHE.eventsByMatch = {}; if (!window.APP_CACHE.eventsByMatch[match.MATCH_ID]) { window.APP_CACHE.eventsByMatch[match.MATCH_ID] = []; }
    window.APP_CACHE.eventsByMatch[match.MATCH_ID].push(tempEvent);
    renderEvents(window.APP_CACHE.eventsByMatch[match.MATCH_ID], match); renderPlayersTab(window.APP_CACHE.fullTeams?.[String(match.CASA_ID)], window.APP_CACHE.fullTeams?.[String(match.TRASFERTA_ID)], match);
    updateScoreFromEvents(match.MATCH_ID); document.querySelector(".modalOverlay")?.remove();
    ApiClient.addEventAdmin(match.MATCH_ID, teamId, type, minute, playerId, assistId).then(() => { refreshStandingsDebounced(500); }).catch(error => { console.error('Errore salvataggio:', error); if (error.message?.includes('teamId') || error.message?.includes('non valido')) { alert('Errore: ' + error.message); location.reload(); } });
}

function updateScoreFromEvents(matchId) {
    const match = window.APP_STATE.lastMatch; if (!match) return;
    const events = window.APP_CACHE.eventsByMatch?.[matchId] || []; const goals = events.filter(e => e.TIPO === 'GOAL');
    let golCasa = 0, golTrasferta = 0;
    goals.forEach(g => { if (String(g.TEAM_ID) === String(match.CASA_ID)) { golCasa++; } else if (String(g.TEAM_ID) === String(match.TRASFERTA_ID)) { golTrasferta++; } });
    const scoreEl = document.querySelector(".score-big"); if (scoreEl) { scoreEl.textContent = `${golCasa} - ${golTrasferta}`; }
}

function renderPenaltyIndicators(events, match) {
    const timeline = document.getElementById('eventsTimeline');
    if (!timeline) {
        console.error("❌ eventsTimeline element not found!");
        return;
    }
    // ✅ ESCI SUBITO SE NON SIAMO IN FASE FINALE
    const fase = String(match.FASE || "").trim().toUpperCase();
    if (fase !== "FINALI") {
        return;
    }
    // ✅ VERIFICA CHE CI SIANO I VALORI DEI RIGORI (da colonne J/K del foglio)
    const rc = match.RIGORE_CASA ?? match.RIGORI_CASA;
    const rt = match.RIGORE_TRASFERTA ?? match.RIGORI_TRASFERTA;
    // 🔥 FIX CRITICO: deve essere > 0, non solo "esistente"
    // Il backend restituisce 0 quando le colonne J/K sono vuote!
    const hasValidRigori = (
        rc !== null && rc !== undefined && rc !== "" && Number(rc) > 0 &&
        rt !== null && rt !== undefined && rt !== "" && Number(rt) > 0
    );
    // ✅ ESCI SE NON CI SONO RIGORI
    if (!hasValidRigori) {
        return;
    }
    // Rimuovi eventuali indicatori precedenti
    const existing = document.getElementById('penalty-indicators');
    if (existing) existing.remove();
    // Filtra eventi rigore: cerca RIGORE_RESULT (colonna E del foglio)
    const penaltyEvents = events.filter(e => {
        const rigoreResult = String(e.RIGORE_RESULT || "").toUpperCase();
        return rigoreResult === 'RIGORE_SEGNO' || rigoreResult === 'RIGORE_SBAGLIO';
    });
    const casaId = String(match.CASA_ID || "").trim();
    const casaTiri = [];
    const trasfTiri = [];
    // Organizza i tiri per squadra
    penaltyEvents.forEach(e => {
        const isGoal = (e.RIGORE_RESULT === 'RIGORE_SEGNO');
        const isCasa = String(e.TEAM_ID) === casaId;
        if (isCasa) casaTiri.push(isGoal);
        else trasfTiri.push(isGoal);
    });
    // Crea HTML bollini
    const createDots = (tiri) => tiri.map(isGoal =>
        `<span class="penalty-dot ${isGoal ? 'goal' : 'miss'}"></span>`
    ).join('');
    // 🔥 LETTURA PUNTEGGI - CON FALLBACK
    // Prima prova a leggere dalle colonne J/K
    let scoreCasa = match.RIGORE_CASA !== undefined ? match.RIGORE_CASA : match.RIGORI_CASA;
    let scoreTrasf = match.RIGORE_TRASFERTA !== undefined ? match.RIGORE_TRASFERTA : match.RIGORI_TRASFERTA;
    // Se sono null/undefined/vuoti, calcolali dai pallini verdi
    if (scoreCasa === null || scoreCasa === undefined || scoreCasa === "") {
        scoreCasa = casaTiri.filter(t => t === true).length;
    }
    if (scoreTrasf === null || scoreTrasf === undefined || scoreTrasf === "") {
        scoreTrasf = trasfTiri.filter(t => t === true).length;
    }
    const scoreText = `${scoreCasa} - ${scoreTrasf}`;
    const indicatorsDiv = document.createElement('div');
    indicatorsDiv.id = 'penalty-indicators';
    indicatorsDiv.className = 'penalty-indicators-container';
    indicatorsDiv.innerHTML = `
        <div class="penalty-header-label">SEQUENZA TIRI</div>
        <div class="penalty-dots-row">
            <div class="penalty-team-block">
                <div class="penalty-team-name">${match.SQUADRA_CASA}</div>
                <div class="penalty-dots">${createDots(casaTiri)}</div>
            </div>
            <div class="penalty-vs-score">${scoreText}</div>
            <div class="penalty-team-block">
                <div class="penalty-team-name">${match.SQUADRA_TRASFERTA}</div>
                <div class="penalty-dots">${createDots(trasfTiri)}</div>
            </div>
        </div>
    `;
    // 🔥 INSERISCI DOPO GLI EVENTI (sotto la timeline, non sopra)
    if (timeline.parentNode) {
        timeline.parentNode.insertBefore(indicatorsDiv, timeline.nextSibling);
    }
}

// ============================================================================
// 📊 RENDERING EVENTI E CRONACA
// ============================================================================
function renderEvents(events, match) {
    const container = document.getElementById("eventsContent"); if (!container) return;
    if (!events?.length) { container.innerHTML = `<div class="empty-events-grid"><div class="empty-team-events"><div class="empty-events-text">Nessun evento</div><div class="empty-events-icon">📋</div></div><div class="empty-team-events"><div class="empty-events-text">Nessun evento</div><div class="empty-events-icon">📋</div></div></div>`; return; }
    
    // 🔥 FIX: Filtra anche gli eventi RIGORE
    events = [...events].filter(e => {
        const minuto = Number(e.MINUTO) || 0;
        const isStandard = ["GOAL", "AMMONIZIONE", "ESPULSIONE"].includes(e.TIPO);
        const isRigore = e.TIPO && e.TIPO.toString().includes("RIGORE");
        return minuto > 0 && e.TEAM_ID && (isStandard || isRigore);
    }).sort((a, b) => (Number(a.MINUTO) || 0) - (Number(b.MINUTO) || 0));

    let html = "";
    events.forEach(e => {
        const teamId = String(e.TEAM_ID || "").trim(); const casaId = String(match.CASA_ID || "").trim(); const trasfertaId = String(match.TRASFERTA_ID || "").trim();
        const isCasa = teamId === casaId; const isTrasferta = teamId === trasfertaId;
        
        // 🔥 ICONE AGGIORNATE PER INCLUDERE I RIGORI
        let icon = "⚽"; let tipoDisplay = "";
        if (e.TIPO === "GOAL") { icon = "⚽"; } 
        else if (e.TIPO === "AMMONIZIONE") { icon = "🟨"; } 
        else if (e.TIPO === "ESPULSIONE") { icon = "🟥"; } 
        else if (e.TIPO === "RIGORE_SEGNO") { icon = "🥅"; tipoDisplay = " (Rigore)"; } 
        else if (e.TIPO === "RIGORE_SBAGLIO") { icon = "❌"; tipoDisplay = " (Rigore)"; }

        const deleteBtn = e.EVENT_ID ? `<span class="event-options" onclick="openEventMenu(event, '${e.EVENT_ID}', '${match.MATCH_ID}')">⋮</span>` : '';
        let playerText = (e.PLAYER || "").toUpperCase();
        if (tipoDisplay) { playerText += `<span style="font-size:0.85em; color:#888">${tipoDisplay}</span>`; }
        if (e.ASSIST) { playerText += `<span class="assist">(${(e.ASSIST).toUpperCase()})</span>`; }

        // 🔥 HTML DIVERSO per colonna sinistra e destra
        if (isCasa) {
          // SINISTRA: minuto - icon - player (da sinistra a destra)
          html += `<div class="event-line left" data-event-id="${e.EVENT_ID || ''}"><div class="event-content"><span class="event-minute">${e.MINUTO}'</span><span class="event-icon">${icon}</span><span class="event-player">${playerText}</span>${deleteBtn}</div></div>`;
        } else {
          // DESTRA: player - icon - minuto (da sinistra a destra, allineato a destra)
          html += `<div class="event-line right" data-event-id="${e.EVENT_ID || ''}"><div class="event-content"><span class="event-player">${playerText}</span><span class="event-icon">${icon}</span><span class="event-minute">${e.MINUTO}'</span>${deleteBtn}</div></div>`;
        }
    });
    container.innerHTML = html;
}

// ============================================================================
// 🎯 SUPPLEMENTARI E RIGORI
// ============================================================================
function toggleSupplementari() {
    const match = window.APP_STATE.lastMatch; if (!match || match.STATO_PARTITA !== "LIVE") return;
    match.STATO_PARTITA = "SUPP"; window.APP_STATE.lastMatch = match; updateMatchUI(match);
    document.querySelectorAll('.phase-btn.small').forEach(btn => { if (btn.textContent.trim().includes('+ EVENTO')) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; btn.style.cursor = 'pointer'; if (btn.textContent.includes('CASA')) btn.onclick = () => addEvent('casa'); if (btn.textContent.includes('TRASFERTA')) btn.onclick = () => addEvent('trasferta'); } });
    ApiClient.updateMatchStatus(match.MATCH_ID, "SUPP").then(() => console.log('✅ Stato SUPP inviato al backend')).catch(err => console.error('❌ Errore update supplementari:', err));
}

function openRigoriPopup(directMode = false) {
    const match = window.APP_STATE.lastMatch;
    if (!match) {
        console.error('❌ openRigoriPopup: match non trovato');
        return;
    }
    const casaData = window.APP_CACHE.fullTeams?.[String(match.CASA_ID)]?.team;
    const trasfData = window.APP_CACHE.fullTeams?.[String(match.TRASFERTA_ID)]?.team;
    const casaNome = casaData?.NOME_SQUADRA || match.SQUADRA_CASA;
    const trasfNome = trasfData?.NOME_SQUADRA || match.SQUADRA_TRASFERTA;
    const casaLogo = casaData?.LOGO_FILE_ID || casaData?.LOGO_ID || match.LOGO_CASA;
    const trasfLogo = trasfData?.LOGO_FILE_ID || trasfData?.LOGO_ID || match.LOGO_TRASFERTA;
    const storageKey = `rigori_${match.MATCH_ID}`;

    // 🔥 MOBILE: usa dati dalla cache/backend e mostra subito
    if (directMode) {
        window.APP_STATE._isRigoriAdmin = false;
        window.APP_STATE._isMobileViewer = true;
        
        // ✅ FIX CRITICO: Lettura robusta con fallback su minuscolo e localStorage
        const savedLocal = localStorage.getItem(storageKey);
        const localState = savedLocal ? JSON.parse(savedLocal) : null;
        
        const rigoriState = {
            fase: 'tiri',
            casaScore: Number(match.RIGORE_CASA ?? match.rigoriCasa ?? localState?.casaScore ?? 0) || 0,
            trasfScore: Number(match.RIGORE_TRASFERTA ?? match.rigoriTrasferta ?? localState?.trasfScore ?? 0) || 0,
            currentKicker: match.RIGORI_CURRENT_KICKER || match.rigoriCurrentKicker || localState?.currentKicker || 'casa',
            history: match.RIGORI_HISTORY || match.rigoriHistory || localState?.history || [],
            finished: false
        };
        
        localStorage.setItem(storageKey, JSON.stringify(rigoriState));
        renderRigoriPopup(rigoriState, match, casaNome, trasfNome, casaLogo, trasfLogo, storageKey);
        startMobileRigoriPolling(match.MATCH_ID, casaNome, trasfNome, casaLogo, trasfLogo, storageKey);
        return;
    }

    // 🔥 PC ADMIN
    window.APP_STATE._isRigoriAdmin = true;
    window.APP_STATE._isMobileViewer = false;

    // 🔥 Se la partita è in RIGORI, recupera SEMPRE dal backend
    if (match.STATO_PARTITA === "RIGORI") {
        const loader = document.createElement('div');
        loader.className = 'rigori-popup-overlay';
        loader.innerHTML = `<div class="rigori-popup" style="max-width: 400px; text-align: center; padding: 40px;"><div style="font-size: 48px; margin-bottom: 20px;">⏳</div><div style="font-size: 18px; font-weight: 700; color: #7a1e2c;">SINCRONIZZAZIONE...</div></div>`;
        document.body.appendChild(loader);
        
        Promise.all([ApiClient.getMatchFull(match.MATCH_ID), ApiClient.getEventsAdmin(match.MATCH_ID)])
        .then(([matchData, events]) => {
            loader.remove();
            if (matchData?.match) {
                const freshMatch = matchData.match;
                const casaId = String(freshMatch.CASA_ID).trim();
                
                // ✅ FIX CRITICO: Lettura robusta con fallback
                let history = freshMatch.RIGORI_HISTORY || freshMatch.rigoriHistory || [];
                if (history.length === 0 && events) {
                    history = events.filter(e =>
                        ['RIGORE_SEGNO', 'RIGORE_SBAGLIO'].includes(e.TIPO)
                    ).map(e => ({
                        team: String(e.TEAM_ID) === casaId ? 'casa' : 'trasferta',
                        result: e.TIPO === 'RIGORE_SEGNO' ? 'goal' : 'miss'
                    }));
                }
                
                let casaScore = Number(freshMatch.RIGORE_CASA ?? freshMatch.rigoriCasa ?? 0) || 0;
                let trasfScore = Number(freshMatch.RIGORE_TRASFERTA ?? freshMatch.rigoriTrasferta ?? 0) || 0;
                
                const rigoriState = {
                    fase: 'tiri',
                    casaScore,
                    trasfScore,
                    currentKicker: freshMatch.RIGORI_CURRENT_KICKER || freshMatch.rigoriCurrentKicker || 'casa',
                    history,
                    finished: false
                };
                
                localStorage.setItem(storageKey, JSON.stringify(rigoriState));
                renderRigoriPopup(rigoriState, match, casaNome, trasfNome, casaLogo, trasfLogo, storageKey);
            }
        }).catch(err => {
            loader.remove();
            console.error('❌ Errore recupero stato rigori:', err);
            // Fallback a localStorage se il backend fallisce momentaneamente
            const savedState = localStorage.getItem(storageKey);
            const rigoriState = savedState ? JSON.parse(savedState) : { 
                fase: 'selezione', casaScore: 0, trasfScore: 0, currentKicker: 'casa', history: [], finished: false 
            };
            renderRigoriPopup(rigoriState, match, casaNome, trasfNome, casaLogo, trasfLogo, storageKey);
        });
        return;
    }

    // 🔥 Se la partita NON è in RIGORI, usa localStorage (per fase di selezione iniziale)
    const savedState = localStorage.getItem(storageKey);
    let rigoriState = savedState ? JSON.parse(savedState) : {
        fase: 'selezione',
        casaScore: 0,
        trasfScore: 0,
        currentKicker: 'casa',
        history: [],
        finished: false
    };
    rigoriState.casaScore = parseInt(rigoriState.casaScore) || 0;
    rigoriState.trasfScore = parseInt(rigoriState.trasfScore) || 0;
    rigoriState.finished = false;
    
    renderRigoriPopup(rigoriState, match, casaNome, trasfNome, casaLogo, trasfLogo, storageKey);
}

// ✅ NUOVA FUNZIONE: Aggiornamento fluido senza re-render completo
function updateRigoriPopupUI(newState) {
    // Aggiorna solo punteggi se cambiati
    const scoreCasaEl = document.getElementById('score-casa');
    const scoreTrasfEl = document.getElementById('score-trasferta');
    
    if (scoreCasaEl && parseInt(scoreCasaEl.textContent) !== newState.casaScore) {
        scoreCasaEl.textContent = newState.casaScore;
        scoreCasaEl.style.transform = 'scale(1.2)';
        setTimeout(() => scoreCasaEl.style.transform = 'scale(1)', 200);
    }
    
    if (scoreTrasfEl && parseInt(scoreTrasfEl.textContent) !== newState.trasfScore) {
        scoreTrasfEl.textContent = newState.trasfScore;
        scoreTrasfEl.style.transform = 'scale(1.2)';
        setTimeout(() => scoreTrasfEl.style.transform = 'scale(1)', 200);
    }
    
    // Aggiorna bollini solo se history cambiata
    const casaKicks = document.getElementById('kicks-casa');
    const trasfKicks = document.getElementById('kicks-trasferta');
    
    if (casaKicks) {
        casaKicks.innerHTML = '';
        newState.history.filter(k => k.team === 'casa').forEach(kick => {
            const kickEl = document.createElement('div');
            kickEl.className = `kick-indicator ${kick.result}`;
            kickEl.style.cssText = 'width: 20px; height: 20px; border-radius: 50%; margin: 2px; display: inline-block; animation: fadeIn 0.3s ease;';
            kickEl.style.background = kick.result === 'goal' ? '#22c55e' : '#ef4444';
            casaKicks.appendChild(kickEl);
        });
    }
    
    if (trasfKicks) {
        trasfKicks.innerHTML = '';
        newState.history.filter(k => k.team === 'trasferta').forEach(kick => {
            const kickEl = document.createElement('div');
            kickEl.className = `kick-indicator ${kick.result}`;
            kickEl.style.cssText = 'width: 20px; height: 20px; border-radius: 50%; margin: 2px; display: inline-block; animation: fadeIn 0.3s ease;';
            kickEl.style.background = kick.result === 'goal' ? '#22c55e' : '#ef4444';
            trasfKicks.appendChild(kickEl);
        });
    }
    
    // Aggiorna "chi calcia"
    const currentEl = document.getElementById('rigori-current');
    if (currentEl) {
        const matchData = window.APP_STATE.lastMatch;
        const nextTeamName = newState.currentKicker === 'casa' ? 
            (matchData?.SQUADRA_CASA || 'CASA') : 
            (matchData?.SQUADRA_TRASFERTA || 'TRASFERTA');
        
        if (currentEl.textContent !== nextTeamName) {
            currentEl.style.opacity = '0';
            setTimeout(() => {
                currentEl.textContent = nextTeamName;
                currentEl.style.opacity = '1';
            }, 150);
        }
    }
}

// ✅ Modifica polling per essere più fluido
function startMobileRigoriPolling(matchId, casaNome, trasfNome, casaLogo, trasfLogo, storageKey) {
    stopMobileRigoriPolling();
    
    let lastHistoryLength = 0;
    let lastCasaScore = 0;
    let lastTrasfScore = 0;
    
    const doPoll = async () => {
        try {
            const freshData = await ApiClient.getMatchFull(matchId);
            if (!freshData?.match) return;
            
            const freshMatch = freshData.match;
            
            // Ferma polling se partita finita
            if (freshMatch.STATO_PARTITA === 'FINITA') {
                stopMobileRigoriPolling();
                return;
            }
            
            const history = freshMatch.RIGORI_HISTORY || freshMatch.rigoriHistory || [];
            const casaScore = Number(freshMatch.RIGORE_CASA ?? freshMatch.rigoriCasa ?? 0) || 0;
            const trasfScore = Number(freshMatch.RIGORE_TRASFERTA ?? freshMatch.rigoriTrasferta ?? 0) || 0;
            
            // ✅ Aggiorna SOLO se ci sono cambiamenti reali
            const hasNewKick = history.length !== lastHistoryLength;
            const scoreChanged = casaScore !== lastCasaScore || trasfScore !== lastTrasfScore;
            
            if (hasNewKick || scoreChanged) {
                const currentState = JSON.parse(localStorage.getItem(storageKey) || '{}');
                currentState.history = history;
                currentState.casaScore = casaScore;
                currentState.trasfScore = trasfScore;
                currentState.currentKicker = freshMatch.RIGORI_CURRENT_KICKER || 'casa';
                localStorage.setItem(storageKey, JSON.stringify(currentState));
                
                // Aggiornamento fluido
                if (document.getElementById('rigoriPopupOverlay')) {
                    updateRigoriPopupUI(currentState);
                }
                
                lastHistoryLength = history.length;
                lastCasaScore = casaScore;
                lastTrasfScore = trasfScore;
            }
        } catch (error) {
            console.error('❌ Errore polling:', error);
        }
    };
    
    // Primo caricamento immediato
    doPoll();
    // Poi ogni 3 secondi (più fluido di 2)
    mobileRigoriPollingInterval = setInterval(doPoll, 3000);
}

// Aggiungi CSS per animazione fluida
if (!document.getElementById('rigoriAnimations')) {
    const style = document.createElement('style');
    style.id = 'rigoriAnimations';
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.5); }
            to { opacity: 1; transform: scale(1); }
        }
        .kick-indicator {
            transition: all 0.3s ease;
        }
        #score-casa, #score-trasferta {
            transition: transform 0.2s ease;
        }
    `;
    document.head.appendChild(style);
}

// 🔥 NUOVA FUNZIONE: Polling mobile SEMPLICE - legge direttamente dal backend
let mobileRigoriPollingInterval = null;

function stopMobileRigoriPolling() {
    if (mobileRigoriPollingInterval) {
        clearInterval(mobileRigoriPollingInterval);
        mobileRigoriPollingInterval = null;
    }
}

function closeRigoriPopup() {
    stopMobileRigoriPolling(); // 🔥 Ferma polling mobile
    const popup = document.getElementById('rigoriPopupOverlay');
    if (popup) { popup.remove(); }
}

window.APP_STATE._lastRigoreClickTime = 0;
window.APP_STATE._isRigoriAdmin = false;

function renderRigoriPopup(rigoriState, match, casaNome, trasfNome, casaLogo, trasfLogo, storageKey) {
    // ✅ UNICA dichiarazione di isMobile e isAdmin
    const isMobile = window.APP_STATE._isMobileViewer === true;
    const isAdmin = window.APP_STATE._isRigoriAdmin === true;
    
    function saveRigoriState() {
        localStorage.setItem(storageKey, JSON.stringify(rigoriState));
    }
    
    const popup = document.createElement('div');
    popup.className = 'rigori-popup-overlay';
    popup.id = 'rigoriPopupOverlay';
    
    // ✅ Gestione fase di selezione (solo Admin)
    if (rigoriState.fase === 'selezione') {
        popup.innerHTML = `
        <div class="rigori-popup" style="max-width: 600px; position: relative; padding: 40px 20px;">
            <div style="position: absolute; right: 20px; top: 15px; cursor: pointer; font-size: 42px; color: #7a1e2c; line-height: 1; z-index: 10; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 8px; transition: all 0.2s ease; font-weight: 300;" onclick="closeRigoriPopup()" onmouseover="this.style.background='#7a1e2c';this.style.color='#fff';this.style.transform='rotate(90deg)'" onmouseout="this.style.background='';this.style.color='#7a1e2c';this.style.transform='rotate(0deg)'">×</div>
            <div class="rigori-title" style="font-size: 26px; font-weight: 800; color: #7a1e2c; letter-spacing: 2px; margin-bottom: 50px; text-align: center;">CHI CALCIA PER PRIMO?</div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 30px;">
                <button id="btn-seleziona-casa" style="background: none; border: none; cursor: pointer; padding: 0; transition: transform 0.2s; text-align: center;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    <div style="width: 140px; height: 140px; border-radius: 50%; background: #f5f5f5; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                        ${casaLogo ? `<img src="${getCachedImage(casaLogo, 140)}" alt="${casaNome}" style="width: 100%; height: 100%; object-fit: contain;">` : '<div style="font-size: 60px;">⚽</div>'}
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #333; text-transform: uppercase; letter-spacing: 1px;">${casaNome}</div>
                </button>
                <div style="font-size: 32px; font-weight: 900; color: #7a1e2c; letter-spacing: 3px;">VS</div>
                <button id="btn-seleziona-trasferta" style="background: none; border: none; cursor: pointer; padding: 0; transition: transform 0.2s; text-align: center;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    <div style="width: 140px; height: 140px; border-radius: 50%; background: #f5f5f5; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                        ${trasfLogo ? `<img src="${getCachedImage(trasfLogo, 140)}" alt="${trasfNome}" style="width: 100%; height: 100%; object-fit: contain;">` : '<div style="font-size: 60px;">⚽</div>'}
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #333; text-transform: uppercase; letter-spacing: 1px;">${trasfNome}</div>
                </button>
            </div>
            <div style="text-align: center; margin-top: 40px; font-size: 14px; color: #888; font-weight: 500;">Clicca sulla squadra che calcia per prima</div>
        </div>`;
        document.body.appendChild(popup);
        
        const btnCasa = document.getElementById('btn-seleziona-casa');
        const btnTrasf = document.getElementById('btn-seleziona-trasferta');
        
        if (btnCasa) {
            btnCasa.onclick = async () => {
                rigoriState.fase = 'tiri';
                rigoriState.currentKicker = 'casa';
                saveRigoriState();
                closeRigoriPopup();
                try {
                    await ApiClient.saveRigoriResults({
                        matchId: match.MATCH_ID, casaScore: 0, trasfScore: 0,
                        history: [], currentKicker: 'casa', finished: false
                    });
                    await ApiClient.updateMatchStatus(match.MATCH_ID, "RIGORI");
                    if (window.APP_CACHE.matches) {
                        const idx = window.APP_CACHE.matches.findIndex(m => String(m.MATCH_ID) === String(match.MATCH_ID));
                        if (idx >= 0) {
                            window.APP_CACHE.matches[idx].STATO_PARTITA = "RIGORI";
                            CacheManager.save(window.APP_CACHE);
                        }
                    }
                } catch(e) { console.error('Errore:', e); }
                openRigoriPopup(false);
            };
        }
        if (btnTrasf) {
            btnTrasf.onclick = function() {
                rigoriState.fase = 'tiri';
                rigoriState.currentKicker = 'trasferta';
                saveRigoriState();
                closeRigoriPopup();
                ApiClient.saveRigoriResults({
                    matchId: match.MATCH_ID, casaScore: 0, trasfScore: 0,
                    history: [], currentKicker: 'trasferta', finished: false
                }).then(() => {
                    ApiClient.updateMatchStatus(match.MATCH_ID, "RIGORI").then(() => {
                        if (window.APP_CACHE.matches) {
                            const idx = window.APP_CACHE.matches.findIndex(m => String(m.MATCH_ID) === String(match.MATCH_ID));
                            if (idx >= 0) {
                                window.APP_CACHE.matches[idx].STATO_PARTITA = "RIGORI";
                                CacheManager.save(window.APP_CACHE);
                            }
                        }
                    });
                });
                setTimeout(() => openRigoriPopup(false), 100);
            };
        }
        return;
    }
    
    // ✅ FASE DI TIRO - costruisci controlsHtml UNA SOLA VOLTA
    let controlsHtml = '';
    if (!isMobile) {
        controlsHtml = `
            <div class="rigori-controls" style="display: flex; justify-content: center; gap: 50px; margin: 40px 0;">
                <button class="rigori-btn miss" id="btn-miss" style="width: 100px; height: 100px; border-radius: 50%; border: none; background: #ef4444; cursor: pointer;"></button>
                <button class="rigori-btn goal" id="btn-goal" style="width: 100px; height: 100px; border-radius: 50%; border: none; background: #22c55e; cursor: pointer;"></button>
            </div>
            <button class="rigori-finish" id="rigori-finish" style="width: 100%; max-width: 300px; margin: 20px auto 0; padding: 12px 20px; background: #7a1e2c; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer;" onclick="finishRigori()">FINE</button>
        `;
    }
    
    popup.innerHTML = `
    <div class="rigori-popup" style="max-width: 700px;">
        <div class="rigori-header" style="text-align: center; margin-bottom: 30px; position: relative;">
            <div style="position: absolute; right: 20px; top: 15px; cursor: pointer; font-size: 42px; color: #7a1e2c; line-height: 1; z-index: 10; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 8px; transition: all 0.2s ease; font-weight: 300;" onclick="closeRigoriPopup()" onmouseover="this.style.background='#7a1e2c';this.style.color='#fff';this.style.transform='rotate(90deg)'" onmouseout="this.style.background='';this.style.color='#7a1e2c';this.style.transform='rotate(0deg)'">×</div>
            <div class="rigori-title" style="font-size: 32px; font-weight: 800; color: #7a1e2c; letter-spacing: 2px;">CALCI DI RIGORE</div>
        </div>
        <div id="rigori-tiri" style="display: block;">
            <div class="rigori-teams" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding: 0 20px;">
                <div class="rigori-team" id="rigori-casa" style="text-align: center; flex: 1; display: flex; flex-direction: column; align-items: center;">
                    ${casaLogo ? `<img src="${getCachedImage(casaLogo, 70)}" alt="${casaNome}" style="width: 70px; height: 70px; margin-bottom: 10px; object-fit: contain;">` : '<div style="width: 70px; height: 70px; background: #f0f0f0; margin: 0 auto 10px; border-radius: 50%;"></div>'}
                    <div class="team-name" style="font-weight: 700; font-size: 15px; margin-bottom: 8px;">${casaNome}</div>
                    <div class="rigori-kicks" id="kicks-casa" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; width: 100%; max-width: 180px;"></div>
                </div>
                <div class="rigori-score-center" style="text-align: center; flex: 0 0 150px;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 10px;">
                        <div class="rigori-score" id="score-casa" style="font-size: 56px; font-weight: 900; color: #7a1e2c; line-height: 1;">${rigoriState.casaScore}</div>
                        <div style="font-size: 32px; font-weight: 700; color: #999;">-</div>
                        <div class="rigori-score" id="score-trasferta" style="font-size: 56px; font-weight: 900; color: #7a1e2c; line-height: 1;">${rigoriState.trasfScore}</div>
                    </div>
                </div>
                <div class="rigori-team" id="rigori-trasferta" style="text-align: center; flex: 1; display: flex; flex-direction: column; align-items: center;">
                    ${trasfLogo ? `<img src="${getCachedImage(trasfLogo, 70)}" alt="${trasfNome}" style="width: 70px; height: 70px; margin-bottom: 10px; object-fit: contain;">` : '<div style="width: 70px; height: 70px; background: #f0f0f0; margin: 0 auto 10px; border-radius: 50%;"></div>'}
                    <div class="team-name" style="font-weight: 700; font-size: 15px; margin-bottom: 8px;">${trasfNome}</div>
                    <div class="rigori-kicks" id="kicks-trasferta" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; width: 100%; max-width: 180px;"></div>
                </div>
            </div>
            <div class="rigori-center" style="text-align: center; margin: 40px 0;">
                <div class="rigori-indicator" id="rigori-indicator" style="width: 120px; height: 120px; border-radius: 50%; background: #555; margin: 0 auto 20px; box-shadow: inset 0 -15px 25px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.2); transition: all 0.3s ease;"></div>
                <div class="rigori-current" id="rigori-current" style="font-size: 20px; color: #333; font-weight: 700; letter-spacing: 1px;">${rigoriState.currentKicker === 'casa' ? casaNome : trasfNome}</div>
            </div>
            ${controlsHtml}
        </div>
    </div>
    `;
    
    document.body.appendChild(popup);

    setTimeout(() => {
    renderKickIndicators();
}, 100);
    
    const styleEl = document.createElement('style');
    styleEl.textContent = `.rigori-kicks {display: flex;flex-wrap: wrap;gap: 8px;justify-content: center;margin-top: 5px;min-height: 30px;} .kick-indicator {width: 20px;height: 20px;border-radius: 50%;display: inline-block;transition: all 0.3s ease;} .kick-indicator.goal {background: #22c55e;box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);} .kick-indicator.miss {background: #ef4444;box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);}`;
    document.head.appendChild(styleEl);
    
    function renderKickIndicators() {
        const casaKicks = document.getElementById('kicks-casa');
        const trasfKicks = document.getElementById('kicks-trasferta');
        if (casaKicks) casaKicks.innerHTML = '';
        if (trasfKicks) trasfKicks.innerHTML = '';
        rigoriState.history.forEach(kick => {
            const kickEl = document.createElement('div');
            kickEl.className = `kick-indicator ${kick.result}`;
            kickEl.style.cssText = 'width: 20px; height: 20px; border-radius: 50%; margin: 2px; display: inline-block;';
            kickEl.style.background = kick.result === 'goal' ? '#22c55e' : '#ef4444';
            if (kick.team === 'casa' && casaKicks) { casaKicks.appendChild(kickEl); }
            else if (kick.team === 'trasferta' && trasfKicks) { trasfKicks.appendChild(kickEl); }
        });
    }
    
    function updateUI() {
        const scoreCasaEl = document.getElementById('score-casa');
        const scoreTrasfEl = document.getElementById('score-trasferta');
        if (scoreCasaEl) scoreCasaEl.textContent = rigoriState.casaScore;
        if (scoreTrasfEl) scoreTrasfEl.textContent = rigoriState.trasfScore;
    }
    
    updateUI();
    
    const currentEl = document.getElementById('rigori-current');
    if (currentEl) {
        currentEl.textContent = rigoriState.currentKicker === 'casa' ? casaNome : trasfNome;
    }
    
    setTimeout(() => { renderKickIndicators(); }, 50);
    
    // ✅ Event listener solo su PC
    const btnMiss = document.getElementById('btn-miss');
    const btnGoal = document.getElementById('btn-goal');
    
    if (btnMiss && !isMobile) {
        btnMiss.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            handleRigoreClick('miss', rigoriState, saveRigoriState, casaNome, trasfNome, match);
        };
    }
    if (btnGoal && !isMobile) {
        btnGoal.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            handleRigoreClick('goal', rigoriState, saveRigoriState, casaNome, trasfNome, match);
        };
    }
    
    function handleRigoreClick(result, rigoriState, saveRigoriState, casaNome, trasfNome, match) {
    
    const currentTeam = rigoriState.currentKicker;
    const isGoal = result === 'goal';
    
    // 🔥 Aggiorna stato locale
    if (isGoal) {
        if (currentTeam === 'casa') { rigoriState.casaScore++; }
        else { rigoriState.trasfScore++; }
    }
    rigoriState.history.push({ team: currentTeam, result: result });
    saveRigoriState();
    
    // 🔥 UI locale immediata
    const scoreCasaEl = document.getElementById('score-casa');
    const scoreTrasfEl = document.getElementById('score-trasferta');
    if (scoreCasaEl) scoreCasaEl.textContent = rigoriState.casaScore;
    if (scoreTrasfEl) scoreTrasfEl.textContent = rigoriState.trasfScore;
    
    // 🔥 Animazione semaforo PC
    const indicator = document.getElementById('rigori-indicator');
    if (indicator) {
        indicator.classList.remove('goal', 'miss');
        indicator.classList.add(isGoal ? 'goal' : 'miss');
    }
    
    // 🔥 SALVA SUBITO NEL BACKEND (così il mobile legge subito)
    ApiClient.saveRigoriResults({
        matchId: match.MATCH_ID,
        casaScore: rigoriState.casaScore,
        trasfScore: rigoriState.trasfScore,
        history: rigoriState.history,
        currentKicker: rigoriState.currentKicker,
        finished: false
    })
    
    // 🔥 Dopo 3 secondi: aggiorna bollini e cambia squadra
    setTimeout(() => {
        if (indicator) indicator.classList.remove('goal', 'miss');
        
        const casaKicks = document.getElementById('kicks-casa');
        const trasfKicks = document.getElementById('kicks-trasferta');
        if (casaKicks) casaKicks.innerHTML = '';
        if (trasfKicks) trasfKicks.innerHTML = '';
        
        rigoriState.history.forEach(kick => {
            const kickEl = document.createElement('div');
            kickEl.className = `kick-indicator ${kick.result}`;
            kickEl.style.cssText = 'width: 20px; height: 20px; border-radius: 50%; margin: 2px; display: inline-block;';
            kickEl.style.background = kick.result === 'goal' ? '#22c55e' : '#ef4444';
            if (kick.team === 'casa' && casaKicks) casaKicks.appendChild(kickEl);
            else if (kick.team === 'trasferta' && trasfKicks) trasfKicks.appendChild(kickEl);
        });
        
        // 🔥 Cambia chi calcia
        rigoriState.currentKicker = currentTeam === 'casa' ? 'trasferta' : 'casa';
        const nextTeamName = rigoriState.currentKicker === 'casa' ? casaNome : trasfNome;
        
        const currentEl = document.getElementById('rigori-current');
        if (currentEl) {
            currentEl.style.opacity = '0';
            setTimeout(() => {
                currentEl.textContent = nextTeamName;
                currentEl.style.transition = 'opacity 0.3s';
                currentEl.style.opacity = '1';
            }, 150);
        }
        
        saveRigoriState();
    }, 3000);
}
}
    
async function finishRigori() {
    const match = window.APP_STATE.lastMatch;
    if (!match) return;
    
    const storageKey = `rigori_${match.MATCH_ID}`;
    const savedState = localStorage.getItem(storageKey);
    if (!savedState) return;
    
    const rigoriState = JSON.parse(savedState);
    
    console.log('🏁 Finish rigori:', rigoriState);
    
    try {
        // 1. Salva risultati finali sul backend
        await ApiClient.saveRigoriResults({
            matchId: match.MATCH_ID,
            casaScore: rigoriState.casaScore,
            trasfScore: rigoriState.trasfScore,
            history: rigoriState.history,
            currentKicker: rigoriState.currentKicker,
            finished: true
        });
        
        // 2. Cambia stato partita a FINITA
        await ApiClient.updateMatchStatus(match.MATCH_ID, "FINITA");
        
        // 3. Aggiorna cache locale
        if (window.APP_CACHE.matches) {
            const idx = window.APP_CACHE.matches.findIndex(m => String(m.MATCH_ID) === String(match.MATCH_ID));
            if (idx >= 0) {
                window.APP_CACHE.matches[idx].STATO_PARTITA = "FINITA";
                window.APP_CACHE.matches[idx].RIGORE_CASA = rigoriState.casaScore;
                window.APP_CACHE.matches[idx].RIGORE_TRASFERTA = rigoriState.trasfScore;
                window.APP_CACHE.matches[idx].RIGORI_CASA = rigoriState.casaScore;
                window.APP_CACHE.matches[idx].RIGORI_TRASFERTA = rigoriState.trasfScore;
                CacheManager.save(window.APP_CACHE);
            }
        }
        
        console.log('✅ Rigori completati e salvati');
    } catch(e) {
        console.error('Errore finish rigori:', e);
    }
    
    // 4. Chiudi popup e aggiorna UI
    closeRigoriPopup();
    stopMatchLiveRefresh();
    invalidateCacheAndRefresh('matches');
    invalidateCacheAndRefresh('finalStage');
    refreshStandingsDebounced(500);
}
// ============================================================================
// 📊 STANDINGS
// ============================================================================
let standingsRefreshTimer = null;

function refreshStandingsDebounced(delay = 1200) {
  clearTimeout(standingsRefreshTimer); 
  standingsRefreshTimer = setTimeout(() => {
    ApiClient.getStandings().then(data => { 
      if (data) { 
        window.APP_CACHE.standings = data; 
        CacheManager.save(window.APP_CACHE); 
      } 
      if (document.querySelector(".standings-page")) 
        renderStandings(data || window.APP_CACHE.standings); 
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
    else if (activeTab === "fasefinale") { 
      ApiClient.getFinalStageMatches().then(data => { 
        if (data) { 
          window.APP_CACHE.finalStage = data || []; 
          CacheManager.save(window.APP_CACHE); 
        } 
        if (window.APP_STATE._activeStandingsTab === "fasefinale") { 
          renderFinalStage(data || window.APP_CACHE.finalStage); 
        } 
      }).catch(console.error); 
    }
  }, 3000);
}
// 🔥 POLLING PER PARTITE LIVE - Aggiorna risultati in tempo reale
// 🔥 POLLING PER PARTITE LIVE - Con protezione anti-rate-limit
let matchLiveRefreshInterval = null;
let currentPollingMatchId = null;
let consecutiveErrors = 0;
let currentPollingInterval = 2000;

function startMatchLiveRefresh() {
  if (matchLiveRefreshInterval) return;
  consecutiveErrors = 0;
  currentPollingInterval = 2000;
  
  const getInterval = () => {
        if (consecutiveErrors > 0) {
            const backoff = Math.min(60000, 5000 * Math.pow(2, consecutiveErrors));
            return backoff;
        }
        const hasRigori = (window.APP_CACHE.matches || []).some(m => m.STATO_PARTITA === "RIGORI");
        return hasRigori ? 2000 : 5000;  // ← 2000ms per rigori, 5000ms normale
    };
  
  const doRefresh = async () => {
    const liveMatches = (window.APP_CACHE.matches || []).filter(m =>
      ["LIVE", "SUPP", "RIGORI"].includes(m.STATO_PARTITA)
    );
    if (liveMatches.length === 0) {
      stopMatchLiveRefresh();
      return;
    }
    for (const match of liveMatches) {
      try {
        const freshData = await ApiClient.getMatchFull(match.MATCH_ID);
        const freshEvents = await ApiClient.getEventsAdmin(match.MATCH_ID);
        
        if (freshData?.match) {
          consecutiveErrors = 0;
          
          const mergedEvents = mergeEventsWithLocal(freshEvents, match.MATCH_ID);
          const calculatedScore = calculateMatchScore(freshData.match, mergedEvents);
          
          const idx = window.APP_CACHE.matches.findIndex(m => String(m.MATCH_ID) === String(match.MATCH_ID));
          if (idx < 0) continue;
          
          let safeData = window.APP_CACHE.matches[idx]?.DATA;
          if (freshData.match.DATA) {
            try {
              const str = String(freshData.match.DATA).trim();
              const matchDateStr = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
              if (matchDateStr) {
                safeData = `${matchDateStr[1]}-${String(matchDateStr[2]).padStart(2, '0')}-${String(matchDateStr[3]).padStart(2, '0')}`;
              } else {
                const matchDateStr2 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                if (matchDateStr2) {
                  safeData = `${matchDateStr2[3]}-${String(matchDateStr2[2]).padStart(2, '0')}-${String(matchDateStr2[1]).padStart(2, '0')}`;
                }
              }
            } catch(e) {
              console.warn('⚠️ Errore normalizzazione data:', e, freshData.match.DATA);
            }
          }
          
          const updatedMatch = {
            ...window.APP_CACHE.matches[idx],
            ...freshData.match,
            ...calculatedScore,
            DATA: safeData
          };
          
          window.APP_CACHE.matches[idx] = updatedMatch;
          window.APP_CACHE.eventsByMatch[match.MATCH_ID] = mergedEvents;
          CacheManager.save(window.APP_CACHE);
          
          if (window.APP_STATE.matchesById[match.MATCH_ID]) {
            window.APP_STATE.matchesById[match.MATCH_ID] = {
              ...window.APP_STATE.matchesById[match.MATCH_ID],
              ...updatedMatch,
              DATA: safeData
            };
          }
          
          // 🔥 SE POPUP RIGORI APERTO - AGGIORNA SOLO SE MOBILE
          const rigoriPopupOpen = document.getElementById('rigoriPopupOverlay') &&
            String(window.APP_STATE.currentMatchId) === String(match.MATCH_ID);
          if (rigoriPopupOpen) {
            if (updatedMatch.STATO_PARTITA === "FINITA") {
              console.log('🏁 Partita finita - chiudo popup');
              closeRigoriPopup();
            } else {
              // 🔥 AGGIORNA POPUP RIGORI SOLO SU MOBILE
              const isMobileViewer = window.APP_STATE._isMobileViewer === true;
              const isAdminViewer = window.APP_STATE._isRigoriAdmin === true && !isMobileViewer;
              if (isMobileViewer && !isAdminViewer) {
                updateRigoriPopupMobile(updatedMatch);
              }
            }
          }
   
        // 🔥 AGGIORNAMENTO PAGINA PARTITA - OTTIMIZZATO (evita flickering)
        if (document.querySelector('.match-page') && String(window.APP_STATE.currentMatchId) === String(match.MATCH_ID)) {
            const previousMatch = window.APP_STATE.lastMatch;
            
            // ✅ CONFRONTA i dati: aggiorna SOLO se qualcosa è cambiato davvero
            const scoreChanged = (
                previousMatch?.GOL_CASA !== updatedMatch.GOL_CASA ||
                previousMatch?.GOL_TRASFERTA !== updatedMatch.GOL_TRASFERTA
            );
            const statusChanged = previousMatch?.STATO_PARTITA !== updatedMatch.STATO_PARTITA;
            const eventsChanged = (
                JSON.stringify(previousMatch?._eventsHash || '') !== 
                JSON.stringify(mergedEvents.length + '_' + (mergedEvents[mergedEvents.length-1]?.EVENT_ID || ''))
            );
            
            // Salva hash eventi per confronto futuro
            updatedMatch._eventsHash = mergedEvents.length + '_' + (mergedEvents[mergedEvents.length-1]?.EVENT_ID || '');
            
            // ✅ AGGIORNA lastMatch PRIMA di qualsiasi altra cosa
            window.APP_STATE.lastMatch = updatedMatch;
            
            // 🔥 AGGIORNAMENTO MIRATO (solo elementi cambiati, NO re-render completo)
            if (scoreChanged || statusChanged) {
                // Aggiorna solo il punteggio
                const scoreEl = document.querySelector(".score-big");
                if (scoreEl) {
                    scoreEl.textContent = `${updatedMatch.GOL_CASA || 0} - ${updatedMatch.GOL_TRASFERTA || 0}`;
                }
                // Aggiorna solo lo stato
                updateMatchUI(updatedMatch);
                console.log('🔄 Aggiornamento mirato:', { scoreChanged, statusChanged });
            }
            
            // ✅ Aggiorna eventi SOLO se sono cambiati (evita flickering nomi)
            if (eventsChanged) {
                renderEvents(mergedEvents, updatedMatch);
                renderPenaltyIndicators(mergedEvents, updatedMatch);
                console.log('📋 Eventi aggiornati:', mergedEvents.length);
            }
            
            // ✅ Aggiorna giocatori SOLO se necessario (non ad ogni refresh)
            // I giocatori cambiano raramente durante la partita, quindi li aggiorniamo solo al primo caricamento
            if (!window.APP_STATE._playersLoadedForMatch || 
                window.APP_STATE._playersLoadedForMatch !== updatedMatch.MATCH_ID) {
                loadPlayersForMatch(updatedMatch);
                window.APP_STATE._playersLoadedForMatch = updatedMatch.MATCH_ID;
            }
        }
          
          // 🔥 AGGIORNAMENTO LISTA PARTITE
          if (document.querySelector('.matches-page')) {
            const selectedDate = window.APP_STATE.selectedDate;
            if (selectedDate) {
              renderMatchesByDate(selectedDate);
            } else {
              renderMatches();
            }
          }
          
          //  AGGIORNAMENTO HOME
          if (document.querySelector('.home-container')) {
            const nextCardHtml = getNextMatchCard();
            const existing = document.querySelector('.home-next-match');
            if (existing && nextCardHtml) {
              existing.outerHTML = nextCardHtml;
            }
          }
        }
      } catch (error) {
        console.error(`❌ Errore refresh match ${match.MATCH_ID}:`, error);
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          console.warn(`⚠️ Troppi errori consecutivi (${consecutiveErrors}). Polling rallentato.`);
        }
        if (error.message?.includes('Servizio Fogli di lavoro') ||
            error.message?.includes('rate limit') ||
            error.message?.includes('quota')) {
          console.warn('⚠️ Rate limit rilevato. Aumento intervallo polling.');
          consecutiveErrors = Math.max(consecutiveErrors, 3);
        }
      }
    }
    if (matchLiveRefreshInterval) {
      clearInterval(matchLiveRefreshInterval);
      matchLiveRefreshInterval = setInterval(doRefresh, getInterval());
    }
  };
  matchLiveRefreshInterval = setInterval(doRefresh, getInterval());
}

function updateRigoriPopupMobile(updatedMatch) {
    const history = updatedMatch.RIGORI_HISTORY || updatedMatch.rigoriHistory || [];
    const currentKicker = updatedMatch.RIGORI_CURRENT_KICKER || updatedMatch.rigoriCurrentKicker || 'casa';
    const casaScore = Number(updatedMatch.RIGORE_CASA ?? updatedMatch.rigoriCasa ?? 0) || 0;
    const trasfScore = Number(updatedMatch.RIGORE_TRASFERTA ?? updatedMatch.rigoriTrasferta ?? 0) || 0;

    // RILEVA NUOVO TIRO
    const prevHistoryLength = window.APP_STATE._lastRigoriHistoryLength || 0;
    const hasNewKick = history.length > prevHistoryLength;

    if (hasNewKick) {
        const lastKick = history[history.length - 1];
        const indicator = document.getElementById('rigori-indicator');

        console.log('🎯 Nuovo tiro mobile:', lastKick);

        // ✅ FASE 1: SUBITO - Colora il semaforo
        if (indicator) {
            indicator.classList.remove('goal', 'miss');
            void indicator.offsetWidth; // Force reflow
            indicator.classList.add(lastKick.result);
            console.log('🚦 Semaforo colorato:', lastKick.result);
        }

        // ✅ FASE 2: Dopo 3 secondi - Torna grigio E aggiungi i bollini
        setTimeout(() => {
            // Torna grigio
            if (indicator) {
                indicator.classList.remove('goal', 'miss');
                console.log('✅ Semaforo tornato grigio');
            }

            // Aggiungi i bollini sotto le squadre
            const casaKicks = document.getElementById('kicks-casa');
            const trasfKicks = document.getElementById('kicks-trasferta');
            
            if (casaKicks) {
                casaKicks.innerHTML = '';
                history.filter(k => k.team === 'casa').forEach(kick => {
                    const kickEl = document.createElement('div');
                    kickEl.className = `kick-indicator ${kick.result}`;
                    kickEl.style.cssText = 'width: 20px; height: 20px; border-radius: 50%; margin: 2px; display: inline-block;';
                    kickEl.style.background = kick.result === 'goal' ? '#22c55e' : '#ef4444';
                    casaKicks.appendChild(kickEl);
                });
            }
            
            if (trasfKicks) {
                trasfKicks.innerHTML = '';
                history.filter(k => k.team === 'trasferta').forEach(kick => {
                    const kickEl = document.createElement('div');
                    kickEl.className = `kick-indicator ${kick.result}`;
                    kickEl.style.cssText = 'width: 20px; height: 20px; border-radius: 50%; margin: 2px; display: inline-block;';
                    kickEl.style.background = kick.result === 'goal' ? '#22c55e' : '#ef4444';
                    trasfKicks.appendChild(kickEl);
                });
            }
            
            console.log('🔵 Bollini aggiunti dopo 3s');
        }, 3000); // ✅ 3 SECONDI prima di mostrare i bollini
    }

    window.APP_STATE._lastRigoriHistoryLength = history.length;

    // ✅ Aggiorna punteggi subito
    const scoreCasaEl = document.getElementById('score-casa');
    const scoreTrasfEl = document.getElementById('score-trasferta');
    if (scoreCasaEl) scoreCasaEl.textContent = casaScore;
    if (scoreTrasfEl) scoreTrasfEl.textContent = trasfScore;

    // 🔥 AGGIORNA "CHI CALCIA"
    const currentEl = document.getElementById('rigori-current');
    if (currentEl) {
        const nextTeamName = currentKicker === 'casa' ?
            updatedMatch.SQUADRA_CASA : updatedMatch.SQUADRA_TRASFERTA;
        if (currentEl.textContent !== nextTeamName) {
            console.log('🎯 Cambio nome squadra:', currentEl.textContent, '->', nextTeamName);
            currentEl.style.transition = 'opacity 0.3s ease';
            currentEl.style.opacity = '0';
            setTimeout(() => {
                currentEl.textContent = nextTeamName ||
                    (currentKicker === 'casa' ? 'SQUADRA CASA' : 'SQUADRA TRASFERTA');
                currentEl.style.opacity = '1';
            }, 150);
        }
    }
}

function stopMatchLiveRefresh() {
  if (matchLiveRefreshInterval) {
    clearInterval(matchLiveRefreshInterval);
    matchLiveRefreshInterval = null;
  }
  // 🔥 RESET contatore errori
  consecutiveErrors = 0;
  currentPollingInterval = 2000;
}

// ✅ NUOVA FUNZIONE: Render bollini dalla history del backend
function renderKickIndicatorsFromHistory(history, casaId) {
  const casaKicks = document.getElementById('kicks-casa');
  const trasfKicks = document.getElementById('kicks-trasferta');
  
  if (casaKicks) casaKicks.innerHTML = '';
  if (trasfKicks) trasfKicks.innerHTML = '';
  
  history.forEach(kick => {
    const kickEl = document.createElement('div');
    kickEl.className = `kick-indicator ${kick.result}`;
    kickEl.style.cssText = 'width: 20px; height: 20px; border-radius: 50%; margin: 2px; display: inline-block;';
    kickEl.style.background = kick.result === 'goal' ? '#22c55e' : '#ef4444';
    
    if (kick.team === 'casa' && casaKicks) {
      casaKicks.appendChild(kickEl);
    } else if (kick.team === 'trasferta' && trasfKicks) {
      trasfKicks.appendChild(kickEl);
    }
  });
}

function showStandings() {
  window.location.hash = '#standings';
  renderToolbar("standings");
  
  const isFinalStage = window.APP_CACHE.meta?.finalStageStarted === true;
  window.APP_STATE._activeStandingsTab = isFinalStage ? "fasefinale" : "gironi";
  window.APP_STATE._finalStageLoaded = !isFinalStage;
  
  // ✅ Inizializza variabile per podio automatico (solo sessione corrente)
  if (window.APP_STATE._podiumAutoShownThisSession === undefined) {
    window.APP_STATE._podiumAutoShownThisSession = false;
  }
  
  // ✅ Rileva se siamo su mobile
  const isMobile = window.innerWidth <= 768;
  
  // ✅ Su mobile: mostra tab FASE FINALE solo se bracket già creato
  // Su desktop: mostra sempre entrambi i tab
  const showFaseFinaleTab = isMobile ? isFinalStage : true;
  
  // ✅ Renderizza struttura base con tab FASE FINALE condizionale
  document.getElementById("app").innerHTML = `
    <div class="page-container standings-page">
      <div class="page-title">CLASSIFICHE</div>
      <div class="standings-tabs">
        <div class="standings-tab ${!isFinalStage ? 'active' : ''}" data-tab="gironi">GIRONI</div>
        ${showFaseFinaleTab ? `<div class="standings-tab ${isFinalStage ? 'active' : ''}" data-tab="fasefinale">FASE FINALE</div>` : ''}
      </div>
      <div id="standingsContent"></div>
    </div>`;
  
  if (isFinalStage) {
    document.getElementById("standingsContent").innerHTML =
      `<div style="text-align:center;padding:40px;color:#888">Caricamento fase finale...</div>`;
    loadFinalStage();
  } else {
    renderStandings(window.APP_CACHE.standings || {});
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
  
  document.querySelectorAll(".standings-tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".standings-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const type = tab.dataset.tab;
      window.APP_STATE._activeStandingsTab = type;
      if (type === "gironi") {
        renderStandings(window.APP_CACHE.standings || {});
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
      else if (type === "fasefinale") {
        if (!window.APP_STATE._finalStageLoaded) {
          loadFinalStage();
          window.APP_STATE._finalStageLoaded = true;
        } else {
          renderFinalStage(window.APP_CACHE.finalStage || []);
        }
        
        startStandingsLiveRefresh();
      }
    };
  });
  
  if (!isFinalStage) {
    startStandingsLiveRefresh();
  }
}

function renderStandings(data) {
  const container = document.getElementById("standingsContent"); 
  if (!container) return;
  const A = data?.A || [], B = data?.B || []; 
  let html = renderGironeTable("GIRONE A", A) + renderGironeTable("GIRONE B", B); 
  container.innerHTML = html;
}

function renderGironeTable(title, teams) {
  const finalStageStarted = window.APP_CACHE.meta?.finalStageStarted || false;
  let html = `<div class="girone-block"><div class="girone-title">${Sanitizer.html(title)}</div><table class="standings-table"><thead><tr><th></th><th class="team-col">SQUADRA</th><th>PT</th><th>PG</th><th>V</th><th>P</th><th>S</th><th>GF</th><th>GS</th><th>DR</th></tr></thead><tbody>`;
  (teams||[]).forEach((t, idx) => {
    const logoHtml = t.logo ? `<img src="${getCachedImage(t.logo, 48)}" class="standings-logo" alt="${t.nome}" onerror="this.style.display='none'">` : `<div style="font-size:1.2rem">⚽</div>`;
    const showLive = t.live && !finalStageStarted;
    html += `<tr class="${idx<2?"qualified":""} ${showLive?"live-team-row":""}"><td class="pos-col">${idx+1}</td><td class="team-col"><div class="standings-team" onclick="openTeamEditor('${Sanitizer.attr(t.id)}')"><div class="standings-logo-wrap">${logoHtml}</div><div class="standings-team-name ${showLive?"live-team-name":""}">${Sanitizer.html(t.nome)}</div>${showLive?`<div class="live-dot"></div>`:""}</div></td><td class="pts ${showLive?"live-pts":""}">${t.pt}</td><td>${t.pg}</td><td>${t.v}</td><td>${t.p}</td><td>${t.s}</td><td>${t.gf}</td><td>${t.gs}</td><td>${t.dr}</td></tr>`;
  });
  html += `</tbody></table></div>`; 
  return html;
}

function loadFinalStage() {
  const cached = window.APP_CACHE.finalStage || []; 
  renderFinalStage(cached);
  ApiClient.getFinalStageMatches().then(data => { 
    window.APP_CACHE.finalStage = data || []; 
    CacheManager.save(window.APP_CACHE); 
    if (window.APP_STATE._activeStandingsTab === "fasefinale") 
      renderFinalStage(data); 
  }).catch(() => {});
}

function renderFinalBracket(matches) {
  const container = document.getElementById("finalBracketContainer");
  if (!container) return;
  const matchMap = {};
  (matches || []).forEach(m => {
    const key = m.matchKey || m.TURNO || m.turno;
    if (key) {
      matchMap[key] = m;
    }
  });
  const sf1Match = matchMap["SF1"];
  const sf2Match = matchMap["SF2"];
  const finalMatch = matchMap["F"];
  const thirdPlaceMatch = matchMap["TP"];
  container.innerHTML = `
    <div class="tournament-wrapper">
      ${renderBracketMatch(matchMap["Q1"], "qf1")}
      ${renderBracketMatch(matchMap["Q2"], "qf2")}
      ${renderBracketMatch(matchMap["Q3"], "qf3")}
      ${renderBracketMatch(matchMap["Q4"], "qf4")}
      ${sf1Match ? renderBracketMatch(sf1Match, "sf1") : renderPlaceholderCard("SF1", "sf1")}
      ${sf2Match ? renderBracketMatch(sf2Match, "sf2") : renderPlaceholderCard("SF2", "sf2")}
      ${finalMatch ? renderBracketMatch(finalMatch, "final-match") : renderPlaceholderCard("FINALE 1°-2°", "final-match")}
      ${thirdPlaceMatch ? renderBracketMatch(thirdPlaceMatch, "third-place") : renderPlaceholderCard("FINALE 3°-4°", "third-place")}
    </div>
  `;
}

function renderNextPhaseButton() {
    if (!document.querySelector('.final-stage-page') &&
        !(document.querySelector('.standings-page') && window.APP_STATE._activeStandingsTab === "fasefinale")) {
        return;
    }
    const oldBtn = document.getElementById("next-phase-action-btn");
    if (oldBtn) oldBtn.remove();
    const container = document.getElementById("finalBracketContainer");
    if (!container) return;
    const finalStageData = window.APP_CACHE.finalStage || [];
    
    const quarti = finalStageData.filter(m => m.turno === "QUARTI");
    const quartiFiniti = quarti.filter(m => m.stato === "FINITA").length;
    const semi = finalStageData.filter(m => m.turno === "SEMIFINALE");
    const semiFiniti = semi.filter(m => m.stato === "FINITA").length;
    const finali = finalStageData.filter(m => 
        m.turno === "FINALE 1-2" || m.turno === "FINALE 3-4" ||
        m.matchKey === "F" || m.matchKey === "TP"
    );
    const finaliFiniti = finali.filter(m => m.stato === "FINITA").length;
    const finaliCreate = finali.length >= 2;
    const sf1Exists = finalStageData.some(m => m.matchKey === "SF1");
    const sf2Exists = finalStageData.some(m => m.matchKey === "SF2");
    const semiCreate = sf1Exists && sf2Exists;
    const final1Exists = finalStageData.some(m => m.matchKey === "F");
    const final3Exists = finalStageData.some(m => m.matchKey === "TP");
    const finaliCreate2 = final1Exists && final3Exists;
    
    // ✅ Controlla se il podio è già stato attivato
    const podioActivated = localStorage.getItem('podioActivated') === 'true';
    
    let action = null;
    
    if (quartiFiniti === 4 && !semiCreate) {
        action = "SEMIFINALI";
    }
    else if (quartiFiniti === 4 && semiFiniti === 2 && !finaliCreate2) {
        action = "FINALI";
    }
    else if (finaliCreate2 && finaliFiniti === 2) {
        // ✅ Mostra "VEDI PODIO" solo se NON è ancora stato attivato
        if (!podioActivated) {
            action = "PODIO";
        }
    }
    
    // ✅ Se non c'è azione pronta, esci
    if (!action) return;
    
    const btnWrapper = document.createElement("div");
    btnWrapper.className = "next-phase-button";
    if (action === "PODIO") {
        btnWrapper.classList.add("podio-ready");
    }
    btnWrapper.id = "next-phase-action-btn";
    
    const btn = document.createElement("button");
    btn.className = "next-phase-btn";
    btn.textContent = action === "PODIO" ? "🏆 VEDI PODIO" : "PROSSIMA FASE";
    
    btn.onclick = () => {
        if (action === "PODIO") {
            localStorage.setItem('podioActivated', 'true');
            showTournamentPodium(finalStageData, false);
            btnWrapper.remove();
        } else {
            openNextPhasePopup(action);
        }
    };
    
    btnWrapper.appendChild(btn);
    const pageContainer = document.querySelector('.final-stage-page');
    if (pageContainer) {
        pageContainer.appendChild(btnWrapper);
    }
}

function renderFinalStage(data) {
    const container = document.getElementById("standingsContent");
    if (!container) return;
    if (!data?.length) {
        container.innerHTML = `<div class="final-empty"><div class="final-empty-icon"></div><div class="final-empty-title">FASE FINALE</div><div class="final-empty-line"></div><div class="final-empty-text">Crea la fase finale per visualizzare il tabellone del torneo.</div><div class="phase-btn" onclick="createFinalStage()">CREA FASE FINALE</div></div>`;
        return;
    }
    container.innerHTML = `<div class="final-stage-page"><div id="finalBracketContainer"></div></div>`;
    renderFinalBracket(data);
    renderNextPhaseButton();
    
    const finali = (data || []).filter(m =>
        m.turno === "FINALE 1-2" || m.turno === "FINALE 3-4" ||
        m.matchKey === "F" || m.matchKey === "TP"
    );
    const finaliFiniti = finali.filter(m => m.stato === "FINITA").length;
    const finaliCreate = finali.length >= 2;
    
    const podioActivated = localStorage.getItem('podioActivated') === 'true';
    if (podioActivated && finaliCreate && finaliFiniti === 2) {
        setTimeout(() => {
            if (!document.getElementById('podiumPopupOverlay')) {
                showTournamentPodium(data);
            }
        }, 500);
    }
    
    // ✅ CONTROLLO MULTI-LIVELLO PER EVITARE DOPPIE VISUALIZZAZIONI
    if (finaliCreate && finaliFiniti === 2 && !window.APP_STATE._podiumShownThisSession) {
        const existingPodium = document.getElementById('podiumPopupOverlay');
        const podiumAlreadyActivated = localStorage.getItem('podioActivated') === 'true';
        
        if (!existingPodium && !podiumAlreadyActivated) {
            window.APP_STATE._podiumShownThisSession = true;
            setTimeout(() => {
                // Doppio controllo prima di mostrare
                if (!document.getElementById('podiumPopupOverlay') && 
                    localStorage.getItem('podioActivated') !== 'true') {
                    showTournamentPodium(data);
                }
            }, 500);
        }
    }
}

function openNextPhasePopup(phase) {
  const modal = document.createElement("div"); 
  modal.className = "modalOverlay";
  const title = phase === "SEMIFINALI" ? "CREA SEMIFINALI" : "CREA FINALI";
  const match1Label = phase === "SEMIFINALI" ? "SEMIFINALE 1" : "FINALE 1°-2°";
  const match2Label = phase === "SEMIFINALI" ? "SEMIFINALE 2" : "FINALE 3°-4°";
  modal.innerHTML = `<div class="modalBox" style="max-width:500px;"><div class="modalTitle">${title}</div><div class="match-form"><div style="margin-bottom:20px;"><div style="font-weight:700;margin-bottom:8px;">${match1Label}</div><input type="date" id="date1" class="match-input" style="margin-right:10px;"><input type="time" id="time1" class="match-input"></div><div><div style="font-weight:700;margin-bottom:8px;">${match2Label}</div><input type="date" id="date2" class="match-input" style="margin-right:10px;"><input type="time" id="time2" class="match-input"></div><div class="modalActions" style="margin-top:20px;"><div class="phase-btn" onclick="saveNextPhase('${phase}')">CREA PARTITE</div><div class="phase-btn secondary" onclick="this.closest('.modalOverlay').remove()">ANNULLA</div></div></div></div>`;
  document.body.appendChild(modal); 
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); }; 
  modal.querySelector(".modalBox").onclick = (e) => e.stopPropagation();
}

function showTournamentPodium(finalStageData) {
  // ✅ VERIFICA DI ESSERE NELLA PAGINA FASE FINALE
    if (!document.querySelector('.final-stage-page') &&
        !(document.querySelector('.standings-page') && window.APP_STATE._activeStandingsTab === "fasefinale")) {
        console.warn('⚠️ showTournamentPodium chiamato fuori dalla pagina corretta');
        return;
    }
    
    // ✅ EVITA DOPPIE CREAZIONI DEL POPUP
    const existing = document.getElementById("podiumPopupOverlay");
    if (existing) {
        console.log('🛑 Popup podio già esistente, non creo duplicato');
        return;
    }
    
    // ✅ MARCA SUBITO COME ATTIVATO PER EVITATE CHIAMATE MULTIPLE
    localStorage.setItem('podioActivated', 'true');
  
  const finale1 = finalStageData.find(m => m.matchKey === "F");
  const finale3 = finalStageData.find(m => m.matchKey === "TP");
  if (!finale1 || !finale3) return;
  
  // 🔥 Determina vincitori CON RIGORI
  let primo, secondo, terzo;
  
  // ✅ FINALE 1°-2°: controlla prima i rigori
  const rigoriCasaFinale = finale1.rigoriCasa ?? finale1.RIGORE_CASA ?? finale1.RIGORI_CASA ?? null;
  const rigoriTrasfFinale = finale1.rigoriTrasferta ?? finale1.RIGORE_TRASFERTA ?? finale1.RIGORI_TRASFERTA ?? null;
  const hasValidRigoriFinale = (
    rigoriCasaFinale !== null && rigoriCasaFinale !== undefined && rigoriCasaFinale !== "" &&
    rigoriTrasfFinale !== null && rigoriTrasfFinale !== undefined && rigoriTrasfFinale !== ""
  );
  
  if (hasValidRigoriFinale) {
    if (Number(rigoriCasaFinale) > Number(rigoriTrasfFinale)) {
      primo = finale1.casa;
      secondo = finale1.trasferta;
    } else {
      primo = finale1.trasferta;
      secondo = finale1.casa;
    }
  } else {
    if (finale1.golCasa > finale1.golTrasferta) {
      primo = finale1.casa;
      secondo = finale1.trasferta;
    } else {
      primo = finale1.trasferta;
      secondo = finale1.casa;
    }
  }
  
  // ✅ FINALE 3°-4°: stessa logica
  const rigoriCasa3 = finale3.rigoriCasa ?? finale3.RIGORE_CASA ?? finale3.RIGORI_CASA ?? null;
  const rigoriTrasf3 = finale3.rigoriTrasferta ?? finale3.RIGORE_TRASFERTA ?? finale3.RIGORI_TRASFERTA ?? null;
  const hasValidRigori3 = (
    rigoriCasa3 !== null && rigoriCasa3 !== undefined && rigoriCasa3 !== "" &&
    rigoriTrasf3 !== null && rigoriTrasf3 !== undefined && rigoriTrasf3 !== ""
  );
  
  if (hasValidRigori3) {
    if (Number(rigoriCasa3) > Number(rigoriTrasf3)) {
      terzo = finale3.casa;
    } else {
      terzo = finale3.trasferta;
    }
  } else {
    if (finale3.golCasa > finale3.golTrasferta) {
      terzo = finale3.casa;
    } else {
      terzo = finale3.trasferta;
    }
  }
  
  const popup = document.createElement("div");
  popup.className = "podium-popup-overlay";
  popup.id = "podiumPopupOverlay";
  popup.onclick = (e) => {
    if (e.target === popup) popup.remove();
  };
  
  popup.innerHTML = `
    <div class="podium-container" onclick="event.stopPropagation()">
      <div class="podium-header">
        <h2>TORNEO CONCLUSO</h2>
        <div class="podium-subtitle">Classifica Finale</div>
      </div>
      <div class="podium-wrapper">
        <div class="podium-position second-place">
          <div class="position-number">2°</div>
          <div class="team-info">
            ${secondo.logo ? `<img src="${getCachedImage(secondo.logo, 80)}" class="podium-logo" alt="${secondo.nome}">` : '<div class="podium-logo-placeholder">⚽</div>'}
            <div class="team-name">${(secondo.nome || "").toUpperCase()}</div>
          </div>
          <div class="podium-step step-2"></div>
        </div>
        <div class="podium-position first-place">
          <div class="crown">👑</div>
          <div class="position-number">1°</div>
          <div class="team-info">
            ${primo.logo ? `<img src="${getCachedImage(primo.logo, 100)}" class="podium-logo winner" alt="${primo.nome}">` : '<div class="podium-logo-placeholder winner">⚽</div>'}
            <div class="team-name winner">${(primo.nome || "").toUpperCase()}</div>
          </div>
          <div class="podium-step step-1"></div>
        </div>
        <div class="podium-position third-place">
          <div class="position-number">3°</div>
          <div class="team-info">
            ${terzo.logo ? `<img src="${getCachedImage(terzo.logo, 80)}" class="podium-logo" alt="${terzo.nome}">` : '<div class="podium-logo-placeholder">⚽</div>'}
            <div class="team-name">${(terzo.nome || "").toUpperCase()}</div>
          </div>
          <div class="podium-step step-3"></div>
        </div>
      </div>
      <div class="podium-footer">
        <div class="phase-btn" onclick="document.getElementById('podiumPopupOverlay')?.remove()">CHIUDI</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);
}

function closeTournamentPodium() {
  const popup = document.getElementById('podiumPopupOverlay');
  if (popup) {
    popup.remove();
    podiumDismissed = true;
    localStorage.setItem('podiumDismissed', 'true');
  }
}

function closePodium() {
  const modal = document.getElementById("podiumModal");
  if (modal) {
    modal.remove();
  }
}

async function saveNextPhase(phase) {
    const date1 = document.getElementById("date1")?.value;
    const time1 = document.getElementById("time1")?.value;
    const date2 = document.getElementById("date2")?.value;
    const time2 = document.getElementById("time2")?.value;
    if (!date1 || !time1 || !date2 || !time2) { alert("Compila tutte le date e gli orari"); return; }
    try {
        if (phase === "SEMIFINALI") {
            await ApiClient.createSemiFinals(date1, time1, date2, time2);
        } else {
            await ApiClient.createFinals(date1, time1, date2, time2);
        }
        document.querySelector(".modalOverlay")?.remove();
        
        // 🔥 MODIFICA QUESTA RIGA
        await invalidateCacheAndRefresh('finalStage');
        await invalidateCacheAndRefresh('matches');
        
        if (document.querySelector(".final-stage-page")) {
            loadFinalStage();
        }
        alert("Partite create con successo!");
    } catch (error) {
        console.error('Error creating next phase:', error);
        alert('Errore: ' + error.message);
    }
}

// 🔥 FUNZIONE PER AGGIORNARE TUTTI I DATI (ESTESA)
async function refreshAllData() {
    try {
        console.log('🔄 Refresh completo dati in corso...');
        
        const [matches, standings, initialData] = await Promise.all([
            ApiClient.getMatches(),
            ApiClient.getStandings(),
            ApiClient.getInitialData()
        ]);
        
        if (initialData) {
            window.APP_CACHE.teams = initialData.teams || window.APP_CACHE.teams;
            window.APP_CACHE.fullTeams = initialData.fullTeams || window.APP_CACHE.fullTeams;
            window.APP_CACHE.playersMap = initialData.playersMap || window.APP_CACHE.playersMap;
        }
        
        if (matches) {
            window.APP_CACHE.matches = matches;
            hydrateMatches(matches);
        }
        
        if (standings) {
            window.APP_CACHE.standings = standings;
        }
        
        CacheManager.save(window.APP_CACHE);
        
        // Aggiorna UI attiva
        if (document.querySelector(".home-container")) {
          const nextMatchCard = getNextMatchCard();
          const existingCard = document.querySelector(".home-next-match");
          if (existingCard && nextMatchCard) {
            // ✅ USA outerHTML INVECE DI replaceWith
            existingCard.outerHTML = nextMatchCard;
          }
        }
        if (document.querySelector(".matches-page")) renderMatches();
        if (document.querySelector(".standings-page")) {
            if (window.APP_STATE._activeStandingsTab === "fasefinale") {
                loadFinalStage();
            } else {
                renderStandings(window.APP_CACHE.standings);
            }
        }
        if (document.querySelector(".teams-page")) renderTeams();
        
        console.log('✅ Refresh completo completato');
    } catch (error) {
        console.error('❌ Errore refresh completo:', error);
    }
}

// 🔥 INVALIDAZIONE CACHE E REFRESH DATI
async function invalidateCacheAndRefresh(type) {
    console.log(`🔄 Invalidazione cache e refresh: ${type}`);
    
    try {
        switch(type) {
            case 'all':
                await refreshAllData();
                break;
                
            case 'teams':
                // Ricarica squadre e giocatori
                const teamsData = await ApiClient.getInitialData();
                if (teamsData?.teams) {
                    window.APP_CACHE.teams = teamsData.teams;
                    if (teamsData?.fullTeams) window.APP_CACHE.fullTeams = teamsData.fullTeams;
                    if (teamsData?.playersMap) window.APP_CACHE.playersMap = teamsData.playersMap;
                    CacheManager.save(window.APP_CACHE);
                }
                // Aggiorna UI se siamo nella pagina squadre
                if (document.querySelector(".teams-page")) renderTeams();
                if (document.querySelector(".team-editor")) {
                    const currentTeamId = window.APP_STATE.currentTeamId;
                    if (currentTeamId) loadTeamData(currentTeamId);
                }
                break;
                
            case 'matches':
                // Ricarica partite
                const matches = await ApiClient.getMatches();
                if (matches) {
                    window.APP_CACHE.matches = matches;
                    hydrateMatches(matches);
                    CacheManager.save(window.APP_CACHE);
                }
                // Aggiorna UI
              if (document.querySelector(".matches-page")) renderMatches();
              if (document.querySelector(".home-container")) {
                const nextCard = getNextMatchCard();
                const existing = document.querySelector(".home-next-match");
                if (existing && nextCard) {
                  // ✅ USA outerHTML INVECE DI replaceWith
                  existing.outerHTML = nextCard;
                }
              }
              break;
                
            case 'standings':
                // Ricarica classifiche
                const standings = await ApiClient.getStandings();
                if (standings) {
                    window.APP_CACHE.standings = standings;
                    CacheManager.save(window.APP_CACHE);
                }
                if (document.querySelector(".standings-page")) {
                    if (window.APP_STATE._activeStandingsTab === "fasefinale") {
                        loadFinalStage();
                    } else {
                        renderStandings(standings);
                    }
                }
                break;
                
            case 'finalStage':
                console.log('🔄 Refresh finalStage...');
                const finalData = await ApiClient.getFinalStageMatches();
                if (finalData) {
                    window.APP_CACHE.finalStage = finalData;
                    CacheManager.save(window.APP_CACHE);
                }
                if (document.querySelector(".final-stage-page")) {
                    renderFinalStage(finalData || window.APP_CACHE.finalStage);
                    renderNextPhaseButton(); // 🔥 Importante: aggiorna anche il pulsante!
                }
                // Se siamo nella pagina standings con tab fasefinale
                if (document.querySelector(".standings-page") && window.APP_STATE._activeStandingsTab === "fasefinale") {
                    renderFinalStage(finalData || window.APP_CACHE.finalStage);
                    renderNextPhaseButton();
                }
                break;
        }
    } catch (error) {
        console.error(`❌ Errore refresh ${type}:`, error);
    }
}

function renderPlaceholderCard(label, cls="") { return `<div class="bracket-match bracket-placeholder ${cls}"><div style="text-align:center; width:100%; display:flex; align-items:center; justify-content:center; height:100%;"><div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#666;">${Sanitizer.html(label)}</div></div></div>`; }

function renderBracketMatch(match, cls="") {
if (!match || !match.casa?.nome) { 
return `<div class="bracket-placeholder ${cls}"><div class="bracket-placeholder-title"></div></div>`; 
}

const logoCasa = match.casa?.logo ? `<img src="${getCachedImage(match.casa.logo, 24)}" alt="${match.casa.nome}" onerror="this.style.display='none'">` : `<div style="width:24px;height:24px;border-radius:50%;background:#f0f0f0"></div>`;
const logoTrasf = match.trasferta?.logo ? `<img src="${getCachedImage(match.trasferta.logo, 24)}" alt="${match.trasferta.nome}" onerror="this.style.display='none'">` : `<div style="width:24px;height:24px;border-radius:50%;background:#f0f0f0"></div>`;

const isLive = ["LIVE", "SUPP", "RIGORI"].includes(match.stato);
const isSupp = match.stato === "SUPP";
const isFinished = match.stato === "FINITA";

let scoreCasa = "0"; 
let scoreTrasf = "0";
if (isLive || isFinished) { 
scoreCasa = match.golCasa || 0; 
scoreTrasf = match.golTrasferta || 0; 
}

const scoreClass = isLive ? "bracket-score live" : "bracket-score scheduled";

// 🔥 FIX: Determina il vincitore considerando PRIMA i rigori
let casaClass = "", trasfClass = "";

if (isFinished) {
// ✅ Controlla se ci sono i rigori (supporta tutte le varianti)
const rigoriCasa = match.rigoriCasa ?? match.RIGORE_CASA ?? match.RIGORI_CASA ?? null;
const rigoriTrasf = match.rigoriTrasferta ?? match.RIGORE_TRASFERTA ?? match.RIGORI_TRASFERTA ?? null;

// ✅ Verifica che entrambi i valori siano validi
const hasValidRigori = (
rigoriCasa !== null && rigoriCasa !== undefined && rigoriCasa !== "" &&
rigoriTrasf !== null && rigoriTrasf !== undefined && rigoriTrasf !== ""
);

if (hasValidRigori) {
// ✅ La partita è decisa ai rigori - usa SEMPRE i rigori
if (Number(rigoriCasa) > Number(rigoriTrasf)) {
casaClass = "winner";
trasfClass = "loser";
} else {
casaClass = "loser";
trasfClass = "winner";
}
} else {
// Partita decisa nei tempi regolamentari/supplementari
if (scoreCasa > scoreTrasf) {
casaClass = "winner";
trasfClass = "loser";
} else {
casaClass = "loser";
trasfClass = "winner";
}
}
}

// 🔥 Indicatore compatto: S = Supplementari, R = Rigori
let statusIndicator = '';
if (isSupp) {
  statusIndicator = '<span class="bracket-status-indicator supp">S</span>';
} else if (isLive && match.stato === "RIGORI") {
  statusIndicator = '<span class="bracket-status-indicator rigori">R</span>';
}

let liveClass = "";
if (isLive) {
if (cls === 'final-match') liveClass = "live-gold";
else if (cls === 'third-place') liveClass = "live-bronze";
else liveClass = "live-match";
}

return `<div class="bracket-match ${cls} ${isFinished ? 'concluded' : ''} ${liveClass}" onclick="openMatch('${match.matchId}')">
<div class="bracket-team ${casaClass}">${logoCasa}<span>${(match.casa?.nome || "TBD").toUpperCase()}</span><span class="${scoreClass}">${scoreCasa}${statusIndicator}</span></div>
<div class="bracket-team ${trasfClass}">${logoTrasf}<span>${(match.trasferta?.nome || "TBD").toUpperCase()}</span><span class="${scoreClass}">${scoreTrasf}${statusIndicator}</span></div>
</div>`;
}

function recoverMatchFromCache(matchId) {
    if (!matchId) return null;
    const sources = [() => window.APP_STATE.matchesById?.[matchId], () => window.APP_CACHE.matches?.find(m => String(m.MATCH_ID) === String(matchId)), () => { return null; }];
    for (const source of sources) { const match = source(); if (match?.CASA_ID && match?.TRASFERTA_ID) { console.log('✅ Match recuperato da cache'); return { ...match }; } }
    return null;
}

function createFinalStage() { if (!confirm("Confermi il passaggio alla FASE FINALE?")) return; alert("Demo: fase finale creata! (backend non configurato)"); }

// ============================================================================
// ⚙️ UTILS & BOOT
// ============================================================================
// ✅ Card di caricamento elegante (mostrata quando la cache è vuota)
function renderLoadingNextMatch() {
  return `<div class="home-next-match" style="
    opacity: 0.85;
    pointer-events: none;
    cursor: default;
    border: 1px solid rgba(122, 30, 44, 0.15);
    background: rgba(255,255,255,0.98);
    padding: 18px 15px;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
  ">
    <div style="display:flex; align-items:center; gap:12px; width:100%; justify-content:center;">
      <div style="width:22px; height:22px; border:2.5px solid #e5e5e5; border-top-color:#7a1e2c; border-radius:50%; animation: spinLoader 0.8s linear infinite;"></div>
      <div style="color:#666; font-size:13px; letter-spacing:2px; font-weight:600; text-transform:uppercase;">
        Caricamento partite...
      </div>
    </div>
  </div>`;
}

// ✅ Keyframe per spinner (aggiungi se non esiste)
if (!document.getElementById('spinLoaderStyle')) {
  const style = document.createElement('style');
  style.id = 'spinLoaderStyle';
  style.textContent = `@keyframes spinLoader { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}

function bootAdminApp() {
  // 🔒 Protegge lastMatch da valori incompleti
  Object.defineProperty(window.APP_STATE, 'lastMatch', {
    set(value) {
      if (value && (!value.CASA_ID || !value.TRASFERTA_ID)) {
        console.error('⚠️ TENTATIVO DI SALVARE lastMatch INCOMPLETO:', value);
      }
      this._lastMatch = value;
    },
    get() { return this._lastMatch; }
  });
  
  // 1. Carica cache istantaneamente
  window.APP_CACHE = CacheManager.load();
  
  // ✅ Flag: i dati sono pronti? (false finché non arriva la prima risposta API)
  window.APP_STATE._dataReady = (window.APP_CACHE.teams?.length > 0 || window.APP_CACHE.matches?.length > 0);
  
  const loader = document.getElementById("startupLoader");
  const LOADER_MIN_TIME = 400; // ✅ Loader breve ma percettibile
  const loaderStartTime = Date.now();
  
  if (loader) loader.style.display = "flex";
  
  let dataLoaded = false;
  let initialRouteHandled = false;
  
  // Timeout di sicurezza
  const maxTimeout = setTimeout(() => {
    if (!dataLoaded) {
      console.warn('⏱️ Timeout caricamento dati - mostro UI con dati parziali');
      hideLoader();
      if (!initialRouteHandled) {
        showHome();
        initialRouteHandled = true;
      }
    }
  }, 5000);
  
  function hideLoader() {
    clearTimeout(maxTimeout);
    const elapsed = Date.now() - loaderStartTime;
    const remaining = Math.max(0, LOADER_MIN_TIME - elapsed);
    setTimeout(() => {
      if (loader) {
        loader.classList.add("hide");
        setTimeout(() => { loader.style.display = "none"; }, 300);
      }
    }, remaining);
  }
  
  // ✅ MOSTRA HOME SUBITO dopo loader breve (anche se cache vuota)
  setTimeout(() => {
    hideLoader();
    if (!initialRouteHandled) {
      initialRouteHandled = true;
      showHome(); // Mostra home: con dati cache OPPURE card "Caricamento..."
    }
  }, 100);
  
  // Fetch dati dal backend (in background, non blocca la UI)
  Promise.all([
    ApiClient.getInitialData(),
    ApiClient.isFinalStageStarted().catch(() => false)
  ])
  .then(async ([initialData, finalStageStarted]) => {
    dataLoaded = true;
    
    // ✅ Aggiorna cache
    window.APP_CACHE = {
      ...window.APP_CACHE,
      teams: initialData.teams || window.APP_CACHE.teams,
      matches: initialData.matches || window.APP_CACHE.matches,
      standings: initialData.standings || window.APP_CACHE.standings,
      fullTeams: initialData.fullTeams || window.APP_CACHE.fullTeams,
      playersMap: initialData.playersMap || window.APP_CACHE.playersMap,
      meta: {
        ...window.APP_CACHE.meta,
        initialized: true,
        finalStageStarted: finalStageStarted
      }
    };
    
    hydrateMatches(window.APP_CACHE.matches || []);
    preloadRecentEvents();
    CacheManager.save(window.APP_CACHE);
    
    // ✅ Segnala che i dati sono pronti
    window.APP_STATE._dataReady = true;
    
    // 🔥 Carica fase finale se attiva
    if (finalStageStarted) {
      ApiClient.getFinalStageMatches().then(finalData => {
        if (finalData) {
          window.APP_CACHE.finalStage = finalData;
          if (window.APP_CACHE.matches) {
            finalData.forEach(fm => {
              const idx = window.APP_CACHE.matches.findIndex(m =>
                String(m.MATCH_ID) === String(fm.matchId)
              );
              if (idx >= 0) {
                window.APP_CACHE.matches[idx] = {
                  ...window.APP_CACHE.matches[idx],
                  RIGORE_CASA: fm.rigoriCasa,
                  RIGORE_TRASFERTA: fm.rigoriTrasferta,
                  RIGORI_CASA: fm.rigoriCasa,
                  RIGORI_TRASFERTA: fm.rigoriTrasferta
                };
              }
            });
          }
          CacheManager.save(window.APP_CACHE);
        }
      }).catch(err => console.error('Errore caricamento fase finale:', err));
    }
    
    const hasLiveMatch = (window.APP_CACHE.matches || []).some(m =>
      m.STATO_PARTITA === "LIVE" || m.STATO_PARTITA === "SUPP" || m.STATO_PARTITA === "RIGORI"
    );
    if (hasLiveMatch) startMatchLiveRefresh();
    
    // ✅ Aggiorna UI se siamo su home (sostituisci card "Caricamento..." con dati reali)
    if (document.querySelector(".home-container")) {
      const nextCard = getNextMatchCard();
      const existing = document.querySelector(".home-next-match");
      if (existing && nextCard) {
        existing.outerHTML = nextCard;
      }
    }
    
    // Aggiorna altre pagine se aperte
    if (document.querySelector(".matches-page")) renderMatches();
    if (document.querySelector(".standings-page")) {
      if (window.APP_STATE._activeStandingsTab === "fasefinale") {
        loadFinalStage();
      } else {
        renderStandings(window.APP_CACHE.standings);
      }
    }
    
    if (!initialRouteHandled) {
      initialRouteHandled = true;
      showHome();
      if (finalStageStarted) {
        window.APP_STATE._activeStandingsTab = "fasefinale";
        window.APP_STATE._finalStageLoaded = false;
      }
    }
    
    if (localStorage.getItem('podiumDismissed') === 'true') {
      podiumDismissed = true;
    }
    
    window.APP_STATE._initialLoadComplete = true;
    const queue = window.APP_STATE._apiCallQueue || [];
    queue.forEach(item => {
      if (Date.now() - item.timestamp < 5000) item.fn();
    });
    window.APP_STATE._apiCallQueue = [];
  })
  .catch(error => {
    console.error('❌ Errore caricamento:', error);
    dataLoaded = true;
    window.APP_STATE._dataReady = true; // ✅ Anche in errore, sblocca la UI
    hideLoader();
    if (!initialRouteHandled) {
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

// ✅ NUOVA FUNZIONE: Aggiorna dati app
function updateAppData(initialData, finalStageStarted) {
  window.APP_CACHE = {
    ...window.APP_CACHE,
    teams: initialData.teams || window.APP_CACHE.teams,
    matches: initialData.matches || window.APP_CACHE.matches,
    standings: initialData.standings || window.APP_CACHE.standings,
    fullTeams: initialData.fullTeams || window.APP_CACHE.fullTeams,
    playersMap: initialData.playersMap || window.APP_CACHE.playersMap,
    meta: {
      ...window.APP_CACHE.meta,
      initialized: true,
      finalStageStarted: finalStageStarted
    }
  };
  
  hydrateMatches(window.APP_CACHE.matches || []);
  preloadRecentEvents();
  CacheManager.save(window.APP_CACHE);
  
  // 🔥 Carica fase finale se attiva
  if (finalStageStarted) {
    ApiClient.getFinalStageMatches().then(finalData => {
      if (finalData) {
        window.APP_CACHE.finalStage = finalData;
        // Sincronizza rigori
        if (window.APP_CACHE.matches) {
          finalData.forEach(fm => {
            const idx = window.APP_CACHE.matches.findIndex(m =>
              String(m.MATCH_ID) === String(fm.matchId)
            );
            if (idx >= 0) {
              window.APP_CACHE.matches[idx] = {
                ...window.APP_CACHE.matches[idx],
                RIGORE_CASA: fm.rigoriCasa,
                RIGORE_TRASFERTA: fm.rigoriTrasferta,
                RIGORI_CASA: fm.rigoriCasa,
                RIGORI_TRASFERTA: fm.rigoriTrasferta
              };
            }
          });
        }
        CacheManager.save(window.APP_CACHE);
      }
    }).catch(err => console.error('Errore caricamento fase finale:', err));
  }
  
  const hasLiveMatch = (window.APP_CACHE.matches || []).some(m =>
    m.STATO_PARTITA === "LIVE" || m.STATO_PARTITA === "SUPP" || m.STATO_PARTITA === "RIGORI"
  );
  
  if (hasLiveMatch) {
    startMatchLiveRefresh();
  }
}

// ✅ NUOVA FUNZIONE: Carica dati freschi in background DOPO aver mostrato la UI
function loadFreshDataInBackground() {
  console.log('🔄 Caricamento dati in background...');
  
  Promise.all([
    ApiClient.getInitialData().catch(err => {
      console.warn('⚠️ Errore refresh dati:', err);
      return null;
    }),
    ApiClient.isFinalStageStarted().catch(() => false)
  ])
  .then(([freshData, finalStageStarted]) => {
    if (freshData) {
      updateAppData(freshData, finalStageStarted);
      
      // Aggiorna UI se necessario
      if (document.querySelector(".home-container")) {
        const nextCard = getNextMatchCard();
        const existing = document.querySelector(".home-next-match");
        if (existing && nextCard) {
          existing.outerHTML = nextCard;
        }
      }
      
      if (document.querySelector(".matches-page")) {
        renderMatches();
      }
    }
  })
  .catch(err => console.error('❌ Errore background load:', err));
}

function preloadRecentEvents() {
    const matches = window.APP_CACHE.matches || []; const now = new Date();
    const recentMatches = matches.filter(m => { if (m.STATO_PARTITA === "LIVE") return true; if (m.DATA) { const matchDate = parseLocalDate(m.DATA); if (matchDate) { const diffHours = (now - matchDate) / (1000 * 60 * 60); return diffHours < 24; } } return false; });
    recentMatches.forEach(m => {
        if (!window.APP_CACHE.eventsByMatch) window.APP_CACHE.eventsByMatch = {};
        if (!window.APP_CACHE.eventsByMatch[m.MATCH_ID]) { ApiClient.getEventsAdmin(m.MATCH_ID).then(events => { window.APP_CACHE.eventsByMatch[m.MATCH_ID] = events; CacheManager.save(window.APP_CACHE); }).catch(err => console.error(`❌ Errore eventi ${m.MATCH_ID}:`, err)); }
        ApiClient.getMatchFull(m.MATCH_ID).then(data => { if (data?.match && data.match.CASA_ID && data.match.TRASFERTA_ID) { window.APP_STATE.matchesById[m.MATCH_ID] = data.match; } }).catch(err => console.error(`❌ Errore precaricamento match ${m.MATCH_ID}:`, err));
    });
}

function preloadAssets() {
    ApiClient.getInitialData().then(data => { if (data) { Object.assign(window.APP_CACHE, { ...CacheManager.createEmpty(), ...(data||{}) }); hydrateMatches(window.APP_CACHE.matches || []); CacheManager.save(window.APP_CACHE); window.APP_CACHE.meta.initialized = true; } }).catch(console.error);
}

function renderAppFromCache() { renderToolbar("home"); const path = window.location.hash || "#home"; if (path.includes("matches")) showMatches(); else if (path.includes("teams")) showTeams(); else if (path.includes("standings")) showStandings(); }

// ============================================================================
// 🎯 GLOBAL EVENT LISTENERS
// ============================================================================

document.addEventListener("click", function(e) {
  // Ignora click su elementi con stopPropagation
  if (e.target.closest('.player-row') || e.target.closest('.mvp-vote-row')) {
    return;
  }
  
  // ✅ USA closest() per gestire click su elementi figli del pulsante
  const tabBtn = e.target.closest('.mt-btn');
  if (tabBtn) {
    if (tabBtn.classList.contains("disabled")) return;
    
    const tab = tabBtn.dataset.tab;
    
    // Salva lo stato del tab attivo
    window.APP_STATE.activeMatchTab = tab;
    
    // Aggiorna classi active
    document.querySelectorAll(".mt-btn").forEach(b => b.classList.remove("active"));
    tabBtn.classList.add("active");
    
    // Mostra il tab selezionato
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    document.getElementById("tab-" + tab)?.classList.add("active");
  }
});

async function resetTournament() {
  // ✅ Triplo controllo di sicurezza
  const conferma1 = confirm(
    "⚠️ ATTENZIONE - RESET TORNEO\n\n" +
    "Questa azione ELIMINERÀ:\n" +
    "• Tutte le partite (gironi e fase finale)\n" +
    "• Tutte le classifiche\n" +
    "• Tutte le statistiche giocatori (gol, assist, MVP...)\n\n" +
    "VERRANNO MANTENUTI:\n" +
    "• Squadre\n" +
    "• Giocatori (con statistiche azzerate)\n\n" +
    "Sei sicuro di voler procedere?"
  );
  if (!conferma1) return;

  const conferma2 = confirm(
    " SECONDA CONFERMA\n\n" +
    "Stai per azzerare COMPLETAMENTE il torneo.\n" +
    "Questa azione è IRREVERSIBILE.\n\n" +
    "Confermi?"
  );
  if (!conferma2) return;

  const conferma3 = prompt(
    " CONFERMA FINALE\n\n" +
    "Per confermare, digita: RESET\n\n" +
    "(Scrivi esattamente RESET in maiuscolo)"
  );
  if (conferma3 !== 'RESET') {
    alert("❌ Reset annullato. Digita RESET per confermare.");
    return;
  }

  // ✅ Mostra loader
  const loader = document.createElement('div');
  loader.id = 'resetLoader';
  loader.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.85); 
    z-index: 999999; display: flex; flex-direction: column;
    align-items: center; justify-content: center; color: white;
    font-family: 'Oswald', sans-serif; backdrop-filter: blur(4px);
  `;
  loader.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 20px;">🗑️</div>
    <div style="font-size: 24px; letter-spacing: 3px; margin-bottom: 10px;">RESET IN CORSO...</div>
    <div style="font-size: 14px; opacity: 0.7;">Eliminazione partite e statistiche</div>
    <div style="width: 200px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; margin-top: 20px; overflow: hidden;">
      <div id="resetProgress" style="width: 0%; height: 100%; background: #7a1e2c; transition: width 0.3s;"></div>
    </div>
  `;
  document.body.appendChild(loader);

  try {
    // Aggiorna progresso
    const progress = document.getElementById('resetProgress');
    if (progress) progress.style.width = '30%';

    // Chiama il backend
    await ApiClient.resetTournament();

    if (progress) progress.style.width = '80%';

    // Svuota cache locale
    CacheManager.clear();
      // ✅ Resetta anche il flag del podio attivato
    localStorage.removeItem('podioActivated');
    window.APP_CACHE = CacheManager.load();
    window.APP_STATE.matchesById = {};
    window.APP_STATE.lastMatch = null;
    window.APP_STATE._podiumShownThisSession = false;
    localStorage.removeItem('podiumDismissed');

    if (progress) progress.style.width = '100%';

    // Ricarica dati
    const freshData = await ApiClient.getInitialData();
    if (freshData) {
      window.APP_CACHE = {
        ...window.APP_CACHE,
        teams: freshData.teams || [],
        matches: freshData.matches || [],
        standings: freshData.standings || {},
        fullTeams: freshData.fullTeams || {},
        playersMap: freshData.playersMap || {},
        meta: { ...window.APP_CACHE.meta, initialized: true }
      };
      CacheManager.save(window.APP_CACHE);
    }

    await new Promise(res => setTimeout(res, 500));
    loader.remove();

    alert("✅ TORNEO AZZERATO CON SUCCESSO!\n\nOra puoi iniziare il nuovo torneo.");
    showHome();

  } catch (error) {
    loader.remove();
    console.error('❌ Errore reset torneo:', error);
    alert("❌ Errore durante il reset: " + (error.message || "Sconosciuto"));
  }
}

// ============================================================================
// 🏁 START
// ============================================================================
if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", bootAdminApp); } else { bootAdminApp(); }

function loadPlayersForMatch(match) {
    const casaId = match?.CASA_ID; const trasfId = match?.TRASFERTA_ID;
    const casaData = window.APP_CACHE.fullTeams?.[casaId]; const trasfData = window.APP_CACHE.fullTeams?.[trasfId];
    if (casaData && trasfData) { renderPlayersTab(casaData, trasfData, match); renderMVPTab(casaData, trasfData, match); return; }
    Promise.all([ApiClient.getTeamFull(casaId).catch(() => null), ApiClient.getTeamFull(trasfId).catch(() => null)]).then(([casaRes, trasfRes]) => {
        if (casaRes) { if (!window.APP_CACHE.fullTeams) window.APP_CACHE.fullTeams = {}; window.APP_CACHE.fullTeams[casaId] = casaRes; }
        if (trasfRes) { if (!window.APP_CACHE.fullTeams) window.APP_CACHE.fullTeams = {}; window.APP_CACHE.fullTeams[trasfId] = trasfRes; }
        renderPlayersTab(casaRes, trasfRes, match); renderMVPTab(casaRes, trasfRes, match);
    }).catch(err => console.error('Error loading players:', err));
}

// ✅ AGGIUNGI QUESTA FUNZIONE HELPER PRIMA DI renderPlayersTab
function formatPlayerName(fullName, forceBreak = false) {
  const name = (fullName || "").toUpperCase().trim();
  const parts = name.split(/\s+/);
  
  if (parts.length >= 2) {
    const nome = parts[0];
    const cognome = parts.slice(1).join(" ");
    
    // ✅ Vai a capo SOLO se:
    // 1. forceBreak è true (MVP che ha poco spazio)
    // 2. OPPURE il nome completo è troppo lungo (> 18 caratteri)
    if (forceBreak || name.length > 18) {
      return `<span class="player-name-split">${nome}<br>${cognome}</span>`;
    }
    // Altrimenti mostra su una riga sola
    return `<span class="player-name-full">${name}</span>`;
  }
  return `<span class="player-name-full">${name}</span>`;
}

function renderPlayersTab(casaData, trasfData, match) {
  const container = document.getElementById("playersColumns");
  if (!container) return;
  const casaPlayers = casaData?.players || [];
  const trasfPlayers = trasfData?.players || [];
  const isFinished = match.STATO_PARTITA === "FINITA";
  const mvpName = match.MVP;
  const events = window.APP_CACHE.eventsByMatch?.[match.MATCH_ID] || [];
  const eventMap = {};
  events.forEach(e => {
    if (e.PLAYER_ID) {
      if (!eventMap[e.PLAYER_ID]) eventMap[e.PLAYER_ID] = [];
      eventMap[e.PLAYER_ID].push(e.TIPO);
    }
  });

  // ✅ FUNZIONE HELPER: raggruppa eventi e crea badge compatti
  const renderCompactBadges = (playerEvents) => {
    if (!playerEvents.length) return "";
    
    const counts = { GOAL: 0, AMMONIZIONE: 0, ESPULSIONE: 0 };
    playerEvents.forEach(t => {
      if (counts[t] !== undefined) counts[t]++;
    });
    
    let html = "";
    
    // ✅ Gol con conteggio (es: ⚽x5)
    if (counts.GOAL > 0) {
      const goalText = counts.GOAL > 1 ? `⚽x${counts.GOAL}` : "⚽";
      html += `<span class="player-badges">${goalText}</span>`;
    }
    
    // ✅ Ammonizioni/Espulsioni - le mostriamo subito dopo i gol
    const cards = [];
    if (counts.AMMONIZIONE > 0) {
      cards.push(counts.AMMONIZIONE > 1 ? `🟨x${counts.AMMONIZIONE}` : "🟨");
    }
    if (counts.ESPULSIONE > 0) {
      cards.push(counts.ESPULSIONE > 1 ? `🟥x${counts.ESPULSIONE}` : "🟥");
    }
    
    if (cards.length > 0) {
      html += `<span class="player-badges" style="margin-left:2px;">${cards.join("")}</span>`;
    }
    
    return html;
  };

  const renderPlayerList = (players, teamName) => {
    if (!players.length) return `<div style="text-align:center;padding:20px;color:#888">Nessun giocatore</div>`;
    let html = "<div class='players-list'>";
    players.forEach(p => {
      const playerEvents = eventMap[p.PLAYER_ID] || [];
      const badgesHtml = renderCompactBadges(playerEvents);
      const isMVP = isFinished && p.NOME === mvpName;
      const mvpClass = isMVP ? "mvp-player-row" : "";
      const crownHtml = isMVP ? '<div class="mvp-crown">👑</div>' : '';
      const photoHtml = p.FOTO_ID ? `<img src="${getCachedImage(p.FOTO_ID, 40)}" alt="${p.NOME}" class="${isMVP ? 'mvp-player-photo' : ''}" onerror="this.style.display='none'">` : `<div class="player-avatar-fallback ${isMVP ? 'mvp-player-avatar' : ''}">👤</div>`;
      
      // ✅ NOME GIOCATORE: text-overflow gestito dal CSS
      html += `<div class="player-row ${mvpClass}" onclick="openPlayerPopup('${p.PLAYER_ID}'); event.stopPropagation();" style="cursor:pointer;">
        <div class="player-avatar ${isMVP ? 'mvp-player-avatar-wrapper' : ''}">${photoHtml}${crownHtml}</div>
        <div class="player-name">${(p.NOME || "").toUpperCase()}</div>
        ${badgesHtml ? `<div style="flex-shrink:0; display:flex; align-items:center;">${badgesHtml}</div>` : ''}
      </div>`;
    });
    html += "</div>";
    return html;
  };
  container.innerHTML = `<div class="players-col"><div class="players-team">${(casaData?.team?.NOME_SQUADRA || match.SQUADRA_CASA || "").toUpperCase()}</div>${renderPlayerList(casaPlayers, match.SQUADRA_CASA)}</div><div class="players-col"><div class="players-team">${(trasfData?.team?.NOME_SQUADRA || match.SQUADRA_TRASFERTA || "").toUpperCase()}</div>${renderPlayerList(trasfPlayers, match.SQUADRA_TRASFERTA)}</div>`;
}
function renderMVPTab(casaData, trasfData, match) {
  const container = document.getElementById("mvpColumns"); if (!container) return;
  const casaPlayers = casaData?.players || []; const trasfPlayers = trasfData?.players || [];
  const isLive = ["LIVE", "SUPP", "RIGORI"].includes(match.STATO_PARTITA);
  const isFinished = match.STATO_PARTITA === "FINITA";
  const currentMVP = match.MVP;
  if (!isLive && !isFinished) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#888;grid-column:1/-1"><div style="font-size:3rem;margin-bottom:16px">🎫</div><div>La votazione MVP sarà disponibile durante la partita</div></div>`;
    return;
  }
  if (isFinished && currentMVP) {
    const renderMVPWinner = (players, teamName) => {
      const mvpPlayer = players.find(p => String(p.NOME || "").toUpperCase() === String(currentMVP).toUpperCase());
      if (!mvpPlayer) return "";
      const photoHtml = mvpPlayer.FOTO_ID ? `<img src="${getCachedImage(mvpPlayer.FOTO_ID, 80)}" alt="${mvpPlayer.NOME}" class="mvp-winner-photo">` : `<div class="player-avatar-fallback mvp-winner-avatar">👑</div>`;
      // ✅ USA formatPlayerName CON forceBreak=true (MVP ha meno spazio)
      return `<div class="mvp-winner-card"><div class="mvp-winner-badge">🏆 MVP DEL MATCH</div>${photoHtml}<div class="mvp-winner-name">${formatPlayerName(mvpPlayer.NOME, true)}</div><div class="mvp-winner-team">${(teamName || "").toUpperCase()}</div></div>`;
    };
    const casaHasMVP = casaPlayers.some(p => String(p.NOME || "").toUpperCase() === String(currentMVP).toUpperCase());
    const trasfHasMVP = trasfPlayers.some(p => String(p.NOME || "").toUpperCase() === String(currentMVP).toUpperCase());
    container.innerHTML = `<div class="players-col"><div class="players-team">${(casaData?.team?.NOME_SQUADRA || match.SQUADRA_CASA || "").toUpperCase()}</div>${casaHasMVP ? renderMVPWinner(casaPlayers, match.SQUADRA_CASA) : ''}</div><div class="players-col"><div class="players-team">${(trasfData?.team?.NOME_SQUADRA || match.SQUADRA_TRASFERTA || "").toUpperCase()}</div>${trasfHasMVP ? renderMVPWinner(trasfPlayers, match.SQUADRA_TRASFERTA) : ''}</div>`;
    return;
  }
  if (isFinished && !currentMVP) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#888;grid-column:1/-1"><div style="font-size:3rem;margin-bottom:16px">⏳</div><div>Calcolo MVP in corso...</div><div style="font-size:12px;margin-top:8px;opacity:0.7">Attendere prego</div></div>`;
    return;
  }
  const renderMVPVoteList = (players, teamId) => {
  if (!players.length) return `<div style="text-align:center;padding:20px;color:#888">Nessun giocatore</div>`;
  const savedVote = localStorage.getItem(`mvp_vote_${match.MATCH_ID}`); let selectedPlayerId = null;
  if (savedVote) { try { const voteData = JSON.parse(savedVote); if (voteData.playerId) { selectedPlayerId = voteData.playerId; } } catch(e) {} }
  let html = "<div class='players-list'>";
  players.forEach(p => {
    const photoHtml = p.FOTO_ID ? `<img src="${getCachedImage(p.FOTO_ID, 40)}" alt="${p.NOME}">` : `<div class="player-avatar-fallback">👤</div>`;
    const isSelected = String(p.PLAYER_ID) === String(selectedPlayerId); 
    const bgStyle = isSelected ? 'background:#fef3c7;opacity:1;' : 'background:transparent;opacity:0.6;';
    // ✅ RIMOSSA la spunta verde - ora c'è solo il highlight giallo
    html += `<div class="player-row mvp-vote-row" onclick="voteMVP('${p.PLAYER_ID}', '${p.NOME.replace(/'/g, "\\'")}', event); event.stopPropagation();" style="cursor:pointer;transition:all 0.3s;${bgStyle}"><div class="player-avatar">${photoHtml}</div><div class="player-name">${formatPlayerName(p.NOME)}</div></div>`;
  });
  html += "</div>"; return html;
};
container.innerHTML = `<div class="players-col"><div class="players-team">${(casaData?.team?.NOME_SQUADRA || match.SQUADRA_CASA || "").toUpperCase()}</div>${renderMVPVoteList(casaPlayers, match.CASA_ID)}</div><div class="players-col"><div class="players-team">${(trasfData?.team?.NOME_SQUADRA || match.SQUADRA_TRASFERTA || "").toUpperCase()}</div>${renderMVPVoteList(trasfPlayers, match.TRASFERTA_ID)}</div>`;
setTimeout(() => loadExistingMVPVote(match.MATCH_ID), 50);

async function selectMVP(playerId, playerName) {
    const match = window.APP_STATE.lastMatch; if (!match) return;
    try { await ApiClient.saveMVPFinal(match.MATCH_ID, playerId); match.MVP = playerName; window.APP_STATE.lastMatch = match; updateMVPBanner(match); renderMVPTab(window.APP_CACHE.fullTeams?.[match.CASA_ID], window.APP_CACHE.fullTeams?.[match.TRASFERTA_ID], match); console.log('✅ MVP salvato:', playerName); } catch (error) { console.error('Error saving MVP:', error); alert('Errore salvataggio MVP: ' + error.message); }
}

function updateLocalMVPCounter() {
    const votes = window.APP_STATE.localMVPVotes || {}; const matchId = window.APP_STATE.currentMatchId;
    const matchVotes = Object.values(votes).filter(v => v.matchId === matchId); const counts = {};
    matchVotes.forEach(v => { counts[v.playerId] = (counts[v.playerId] || 0) + 1; });
    console.log('📊 Voti locali:', counts);
}

function pollForMVPUpdate(matchId) {
    let attempts = 0; const maxAttempts = 20;
    const check = async () => { attempts++; try { const data = await ApiClient.getMatchFull(matchId); if (data?.match?.MVP) { console.log('🏆 MVP trovato:', data.match.MVP); window.APP_STATE.lastMatch = data.match; updateMVPBanner(data.match); loadPlayersForMatch(data.match); refreshStandingsDebounced(500); } else if (attempts < maxAttempts) { setTimeout(check, 1000); } } catch (e) { console.error('Errore polling MVP', e); } };
    setTimeout(check, 1000);
}
}

function getDeviceFingerprint() {
    const params = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 'unknown',
        navigator.platform || 'unknown'
    ];
    const str = params.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return 'fp_' + Math.abs(hash).toString(36);
}

async function voteMVP(playerId, playerName, event) {
    const match = window.APP_STATE.lastMatch;
    if (!match) return;
    
    // ✅ PERMETTI VOTO ANCHE DURANTE RIGORI E SUPPLEMENTARI
    const canVote = ["LIVE", "SUPP", "RIGORI"].includes(match.STATO_PARTITA);
    if (!canVote) {
        return;
    }
    
    const fingerprint = getDeviceFingerprint();
    let voterId = localStorage.getItem('mvp_voter_id');
    const savedFingerprint = localStorage.getItem('mvp_fingerprint');
    
    if (voterId && savedFingerprint !== fingerprint) {
        alert('⚠️ Hai già votato da un altro dispositivo');
        return;
    }
    
    if (!voterId) {
        voterId = fingerprint + '_' + Date.now();
        localStorage.setItem('mvp_voter_id', voterId);
        localStorage.setItem('mvp_fingerprint', fingerprint);
    }
    
    const voteData = {
        matchId: match.MATCH_ID,
        playerId: playerId,
        playerName: playerName,
        voterId: voterId,
        timestamp: Date.now(),
        sent: false
    };
    
    localStorage.setItem(`mvp_vote_${match.MATCH_ID}`, JSON.stringify(voteData));
    updateMVPVoteUI(playerId);
    
    await sendVoteWithRetry(voteData, 3);
}

async function sendVoteWithRetry(voteData, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await ApiClient.saveMVPVote(
                voteData.matchId,
                voteData.voterId,
                voteData.playerId
            );
            voteData.sent = true;
            localStorage.setItem(`mvp_vote_${voteData.matchId}`, JSON.stringify(voteData));
            console.log(`✅ Voto inviato al tentativo ${attempt}`);
            return true;
        } catch (error) {
            console.warn(`⚠️ Tentativo ${attempt} fallito:`, error.message);
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    console.error('❌ Voto non inviato dopo', maxRetries, 'tentativi');
    alert('⚠️ Voto salvato localmente. Riproveremo automaticamente.');
    setTimeout(() => sendVoteWithRetry(voteData, 2), 30000);
    return false;
}

function updateMVPVoteUI(selectedPlayerId) {
    document.querySelectorAll('.mvp-vote-row').forEach(row => {
        row.style.background = '';
        row.style.opacity = '0.6';
        const check = row.querySelector('.vote-check');
        if (check) check.style.opacity = '0';
    });
    
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
            updateMVPVoteUI(voteData.playerId);
        } catch (e) {
            console.error('Errore lettura voto:', e);
        }
    }
}

async function submitAllMVPVotes(matchId) {
    const votes = window.APP_STATE.localMVPVotes || {};
    const matchVotes = Object.values(votes).filter(v => v.matchId === matchId);
    if (matchVotes.length === 0) {
        console.log('📭 Nessun voto da inviare');
        return;
    }
    console.log(`📤 Invio ${matchVotes.length} voti al backend...`);
    const promises = matchVotes.map(vote => {
        return ApiClient.saveMVPVote(matchId, vote.voterId || vote.timestamp, vote.playerId)
            .catch(err => console.error('❌ Errore invio voto:', err));
    });
    await Promise.all(promises);
    console.log(`✅ ${matchVotes.length} voti inviati con successo!`);
    delete window.APP_STATE.localMVPVotes;
}
// ============================================================================
// 📤 MODALE UPLOAD MEDIA
// ============================================================================

function openMediaUploadModal(matchId, linkDrive) {
  // ✅ VALIDA L'URL PRIMA DI USARLO
  if (!linkDrive || typeof linkDrive !== 'string') {
    alert('Errore: Link Drive non valido');
    return;
  }
  
  // ✅ ASSICURATI CHE L'URL SIA CORRETTO
  let validLink = linkDrive.trim();
  if (!validLink.startsWith('http://') && !validLink.startsWith('https://')) {
    validLink = 'https://' + validLink;
  }
  
  // Rimuovi modale esistente se presente
  const existing = document.getElementById('mediaUploadModal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'mediaUploadModal';
  modal.className = 'modalOverlay';
  modal.innerHTML = `
    <div class="modalBox" style="max-width:500px; padding:30px;">
      <div class="modalTitle" style="font-size:22px; margin-bottom:20px;">📤 CARICA MEDIA</div>
      <div id="mediaDropZone" style="
        border: 2px dashed #7a1e2c;
        border-radius: 12px;
        padding: 40px 20px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s;
        background: #fafafa;
        margin-bottom: 15px;
      ">
        <div style="font-size:48px; margin-bottom:10px;">📁</div>
        <div style="font-size:14px; color:#333; font-weight:600; letter-spacing:1px;">
          Clicca o trascina qui i file
        </div>
        <div style="font-size:11px; color:#888; margin-top:8px;">
          Foto e video (max 50MB per file)
        </div>
      </div>
      <input type="file" id="mediaFileInput" multiple accept="image/*,video/*" 
             style="position:absolute; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;">
      <div id="mediaFileList" style="max-height:150px; overflow-y:auto; margin-bottom:15px;"></div>
      <div id="mediaProgress" style="display:none; margin-bottom:15px;">
        <div style="font-size:12px; color:#666; margin-bottom:5px;">
          Caricamento... <span id="mediaProgressText">0/0</span>
        </div>
        <div style="width:100%; height:6px; background:#e0e0e0; border-radius:3px; overflow:hidden;">
          <div id="mediaProgressBar" style="width:0%; height:100%; background:#7a1e2c; transition:width 0.3s;"></div>
        </div>
      </div>
      <div class="modalActions" style="gap:10px;">
        <button id="mediaUploadBtn" class="phase-btn" disabled style="
          opacity:0.5; cursor:not-allowed; padding:10px 20px;
          font-family:'Oswald',sans-serif; letter-spacing:2px;
        ">CARICA FILE</button>
        <a href="${validLink}" target="_blank" rel="noopener noreferrer" class="phase-btn" style="
          padding:10px 20px; background:white; color:#7a1e2c;
          border:2px solid #7a1e2c; text-decoration:none;
        ">VEDI</a>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) closeMediaUploadModal(); };
  setupMediaUploadModal(matchId);
}

function setupMediaUploadModal(matchId) {
  const dropZone = document.getElementById('mediaDropZone');
  const fileInput = document.getElementById('mediaFileInput');
  const fileList = document.getElementById('mediaFileList');
  const uploadBtn = document.getElementById('mediaUploadBtn');
  let selectedFiles = [];
  
  dropZone.onclick = () => fileInput.click();
  
  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.style.background = '#fff5f7';
    dropZone.style.borderColor = '#9f2c3d';
  };
  dropZone.ondragleave = () => {
    dropZone.style.background = '#fafafa';
    dropZone.style.borderColor = '#7a1e2c';
  };
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.style.background = '#fafafa';
    dropZone.style.borderColor = '#7a1e2c';
    handleFiles(e.dataTransfer.files);
  };
  
  fileInput.onchange = () => handleFiles(fileInput.files);
  
  function handleFiles(files) {
    selectedFiles = Array.from(files);
    renderFileList();
    uploadBtn.disabled = selectedFiles.length === 0;
    uploadBtn.style.opacity = selectedFiles.length === 0 ? '0.5' : '1';
    uploadBtn.style.cursor = selectedFiles.length === 0 ? 'not-allowed' : 'pointer';
  }
  
  function renderFileList() {
    fileList.innerHTML = selectedFiles.map((f, i) => `
      <div style="
        display:flex; align-items:center; gap:10px; padding:8px 12px;
        background:#f5f5f5; border-radius:6px; margin-bottom:6px; font-size:12px;
      ">
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${f.type.startsWith('image/') ? '🖼️' : '🎬'} ${f.name}
        </span>
        <span style="color:#888; font-size:10px;">
          ${(f.size / 1024 / 1024).toFixed(2)} MB
        </span>
      </div>
    `).join('');
  }
  
  uploadBtn.onclick = async () => {
      if (selectedFiles.length === 0) return;
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'CARICAMENTO...';
      
      // ✅ Mostra il progress bar aggiungendo la classe 'active'
      const progressEl = document.getElementById('mediaProgress');
      progressEl.classList.add('active');
      progressEl.style.display = 'block';
      
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        document.getElementById('mediaProgressText').textContent = `${i+1}/${selectedFiles.length}`;
        document.getElementById('mediaProgressBar').style.width = `${((i+1)/selectedFiles.length)*100}%`;
        
        try {
          const base64 = await fileToBase64(file);
          const result = await ApiClient.uploadMediaFile(
            matchId,
            file.name,
            file.type,
            base64
          );
          
          if (result?.success) {
            successCount++;
            console.log(`✅ Caricato: ${file.name}`);
          } else {
            errorCount++;
            console.error(`❌ Errore ${file.name}:`, result?.error);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Errore upload ${file.name}:`, error);
        }
        
        await new Promise(r => setTimeout(r, 200));
      }
      
      let message = '';
      if (errorCount === 0) {
        message = `✅ ${successCount} file caricati con successo!`;
      } else {
        message = `⚠️ ${successCount} caricati, ${errorCount} errori`;
      }
      
      alert(message);
      closeMediaUploadModal();
    };
}

function closeMediaUploadModal() {
  const modal = document.getElementById('mediaUploadModal');
  if (modal) modal.remove();
}

// ============================================================================
// 📱 PWA INSTALL - Prompt nativo browser (elegante e discreto)
// ============================================================================
(function() {
    let deferredPrompt = null;
    const STORAGE_KEY = 'pwa_install_dismissed';
    
    // Intercetta l'evento beforeinstallprompt del browser
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Mostra il mini-banner solo se non è stato già rifiutato
        if (!localStorage.getItem(STORAGE_KEY)) {
            setTimeout(() => showInstallMiniBanner(), 2000);
        }
    });
    
    function showInstallMiniBanner() {
        // Rimuovi banner esistente se presente
        const existing = document.getElementById('pwa-mini-banner');
        if (existing) existing.remove();
        
        const banner = document.createElement('div');
        banner.id = 'pwa-mini-banner';
        banner.innerHTML = `
            <div class="pwa-mini-content">
                <div class="pwa-mini-icon">📱</div>
                <div class="pwa-mini-text">
                    <strong>Installa l'app</strong>
                    <span>Accesso rapido dalla home</span>
                </div>
                <button class="pwa-mini-btn" id="pwa-install-btn">Installa</button>
                <button class="pwa-mini-close" id="pwa-close-btn">×</button>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Animazione di entrata
        requestAnimationFrame(() => {
            banner.classList.add('show');
        });
        
        // Pulsante Installa - attiva il prompt NATIVO del browser
        document.getElementById('pwa-install-btn').addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`📱 Install prompt: ${outcome}`);
                deferredPrompt = null;
            }
            hideBanner();
            localStorage.setItem(STORAGE_KEY, 'true');
        });
        
        // Pulsante Chiudi
        document.getElementById('pwa-close-btn').addEventListener('click', () => {
            hideBanner();
            localStorage.setItem(STORAGE_KEY, 'true');
        });
        
        // Auto-hide dopo 12 secondi
        setTimeout(() => {
            if (document.getElementById('pwa-mini-banner')) {
                hideBanner();
            }
        }, 12000);
    }
    
    function hideBanner() {
        const banner = document.getElementById('pwa-mini-banner');
        if (banner) {
            banner.classList.remove('show');
            setTimeout(() => banner.remove(), 300);
        }
    }
    
    // Se l'utente installa l'app, nascondi il banner
    window.addEventListener('appinstalled', () => {
        hideBanner();
        localStorage.setItem(STORAGE_KEY, 'true');
        deferredPrompt = null;
        console.log('✅ PWA installed!');
    });
})();
