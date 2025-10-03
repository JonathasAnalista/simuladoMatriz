import { auth, db as firebaseDb, firebase as firebaseCompat, setPersistence, browserLocalPersistence, markPersistenceConfigured } from '../js/firebase.js';

// ===============================================================
// ===============================================================
// LEGMASTER • script.js
// Cadastro com Nome do CFC + Cidade do CFC (agrupamento por CFC),
// salvando no Firestore, índice cfc_index e painel admin.
// Exporta CSV e TXT (colunas alinhadas) no Admin.
// ===============================================================

/*************************************************
 * ESTADO DO USUÁRIO
 *************************************************/
window.currentUser = {};
try {
  const usuarioLogadoStr = localStorage.getItem("usuarioLogado") || "{}";
  const usuarioSalvo = JSON.parse(usuarioLogadoStr);
  if (usuarioSalvo && usuarioSalvo.email) window.currentUser.email = usuarioSalvo.email;
  if (usuarioSalvo && usuarioSalvo.nome)  window.currentUser.nome  = usuarioSalvo.nome;
  console.log("✅ Usuário carregado:", window.currentUser);
} catch (erro) {
  console.warn("⚠️ Erro ao carregar o usuário:", erro);
}

/**
 * FIREBASE (centralizado via window.LEGMASTER_CONFIG.FIREBASE_CONFIG)
 * - Evita duplicacao de config e reuso da inicializacao feita em js/firebase.js
 */
const firebaseConfig = (window.LEGMASTER_CONFIG && window.LEGMASTER_CONFIG.FIREBASE_CONFIG) || null;
// Versao para bust de cache de assets estaticos (ex.: icones)
const ASSET_VERSION = (typeof VERSAO_ATUAL !== 'undefined' ? VERSAO_ATUAL : '1');
const RESET_SENDER_HINT = firebaseConfig && firebaseConfig.authDomain
  ? `no-reply@${firebaseConfig.authDomain}`
  : 'no-reply@legmaster.app';

const firebase = firebaseCompat;
let db = firebaseDb;

try {
  if (auth) {
    setPersistence(auth, browserLocalPersistence)
      .then(() => markPersistenceConfigured())
      .catch(() => {});
  }
} catch (err) {
  console.warn('[script.js] Falha ao configurar persistencia do auth:', err);
}

window.fb = window.fb || {};
window.fb.auth = auth;
window.fb.db = db;

// Integração opcional com o back-end Node (ver assets/js/api.js).
// Mantemos a autenticação Firebase existente, mas expomos hooks comentados
// para ligar o fluxo JWT quando o servidor estiver ativo.

// Enter no login
document.addEventListener("keydown", (e) => {
  if (localStorage.getItem("telaAtual") === "login" && e.key === "Enter") {
    document.getElementById("botaoLogin")?.click();
  }
});

/*************************************************
 * HELPERS
 *************************************************/
const normalizeEmail = (s) => (s || "").trim().toLowerCase();
const toTitleCase = (s) =>
  String(s || "").toLowerCase().split(" ").filter(Boolean).map(w => w[0].toUpperCase()+w.slice(1)).join(" ");
const slugify = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const buildCfcSlug = (nome, cidade) =>
  `${slugify(toTitleCase(nome))}__${slugify(toTitleCase(cidade))}`;

const emailDocId       = (email) => normalizeEmail(email).replace(/[.@]/g, "_");
const emailDocIdLegacy = (email) => String(email).replace(/[.@]/g, "_");

async function ensureDb() { if (!db) db = firebaseDb; return db; }
function getUserEmail() {
  try {
    const e = (window.currentUser && window.currentUser.email)
      || JSON.parse(localStorage.getItem('usuarioLogado') || '{}').email || null;
    return e ? normalizeEmail(e) : null;
  } catch { return null; }
}

/*************************************************
 * NAVEGAÇÃO (histórico / botão voltar do dispositivo)
 *************************************************/
function _routeHash(screen, params){
  try {
    if (screen === 'provas' && params && params.slug) return `#provas/${params.slug}`;
    if (screen) return `#${screen}`;
  } catch {}
  return location.hash || '';
}
function pushRoute(screen, params, replace){
  try {
    if (window.__navigatingBack || window.__disablePush) return; // evita loop em popstate/inicializacao
    const state = { screen, params: params || null };
    const urlHash = _routeHash(screen, params);
    if (replace) history.replaceState(state, '', urlHash); else history.pushState(state, '', urlHash);
    saveLastRouteState(state);
  } catch {}
}

const LAST_ROUTE_STORAGE_KEY = '__app_last_route_v1';
const FORCED_ROUTE_STORAGE_KEY = '__app_forced_route_v1';
const VALID_ROUTE_SCREENS = new Set([
  'intro',
  'login',
  'menu',
  'aulas',
  'simulados',
  'provas',
  'desempenho',
  'cadastro',
  'admin-liberacoes',
  'admin-alunosCFC',
  'admin-desempenho',
  'admin-desempenho-aluno'
]);

function normalizeRouteState(state) {
  if (!state || !state.screen) return null;
  const screen = String(state.screen).trim();
  if (!VALID_ROUTE_SCREENS.has(screen)) {
    if (screen === 'home') return { screen: 'simulados', params: null };
    return null;
  }
  if (screen === 'provas') {
    const slug =
      (state.params && typeof state.params.slug === 'string' && state.params.slug.trim()) ||
      (typeof state.slug === 'string' && state.slug.trim()) ||
      null;
    if (slug) return { screen, params: { slug: slug.trim() } };
    return { screen: 'simulados', params: null };
  }
  const params = (state.params && typeof state.params === 'object') ? state.params : null;
  return { screen, params };
}

function saveLastRouteState(state) {
  try {
    const normalized = normalizeRouteState(state);
    if (!normalized) return;
    localStorage.setItem(LAST_ROUTE_STORAGE_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.warn('warning saveLastRouteState:', err);
  }
}

function loadLastRouteState() {
  try {
    const raw = localStorage.getItem(LAST_ROUTE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeRouteState(JSON.parse(raw));
  } catch (err) {
    console.warn('warning loadLastRouteState:', err);
    return null;
  }
}

function consumeForcedRouteState() {
  try {
    const raw = localStorage.getItem(FORCED_ROUTE_STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(FORCED_ROUTE_STORAGE_KEY);
    return normalizeRouteState(JSON.parse(raw));
  } catch (err) {
    console.warn('warning consumeForcedRouteState:', err);
    try { localStorage.removeItem(FORCED_ROUTE_STORAGE_KEY); } catch {}
    return null;
  }
}

function parseRouteFromHash() {
  try {
    const raw = (location.hash || '').replace(/^#/, '').trim();
    if (!raw) return null;
    if (raw.startsWith('provas/')) {
      const slug = raw.slice('provas/'.length);
      return normalizeRouteState({ screen: 'provas', params: { slug } });
    }
    return normalizeRouteState({ screen: raw });
  } catch (err) {
    console.warn('warning parseRouteFromHash:', err);
    return null;
  }
}

function renderFromState(state){
  const s = state && state.screen; const p = (state && state.params) || {};
  switch (s) {
    case 'intro': return renderIntro();
    case 'login': return renderLogin();
    case 'menu': return renderMenuPrincipal();
    case 'aulas': return renderAulas();
    case 'simulados': return renderSimulados();
    case 'provas': return (p.slug ? _renderProvasBySlug(p.slug) : renderSimulados());
    case 'desempenho': return renderDesempenho();
    case 'cadastro': return renderCadastro();
    case 'admin-liberacoes': return renderAdminLiberacoes();
    case 'admin-alunosCFC': return renderAdminAlunosCFC();
    case 'admin-desempenho': return renderAdminDesempenho();
    case 'admin-desempenho-aluno': return renderAdminDesempenhoAluno(p.email || '');
    default: return renderMenuPrincipal();
  }
}
window.addEventListener('popstate', (e) => {

  const state = normalizeRouteState(e.state || { screen: 'menu', params: null }) || { screen: 'menu', params: null };

  try {

    window.__navigatingBack = true;

    renderFromState(state);

  } finally {

    window.__navigatingBack = false;

    window.__backNavigationInFlight = false;

    saveLastRouteState(state);

  }

});



const DEFAULT_BACK_ROUTE = { screen: 'menu', params: null };

const BACK_FAILSAFE_DELAY = 400;



function ensureBackRoute(route) {

  const normalized = normalizeRouteState(route || null);

  if (normalized && normalized.screen) return normalized;

  return { screen: DEFAULT_BACK_ROUTE.screen, params: DEFAULT_BACK_ROUTE.params };

}



function applyRouteImmediately(route, replaceState = true) {

  if (!route || !route.screen) return;

  try {

    window.__navigatingBack = true;

    renderFromState(route);

  } finally {

    window.__navigatingBack = false;

  }

  if (replaceState) {

    pushRoute(route.screen, route.params || null, true);

  }

}



function readBackRouteFromElement(el) {

  if (!el) return null;

  const ds = el.dataset || {};

  if (ds.backRoute) {

    try { return ensureBackRoute(JSON.parse(ds.backRoute)); }

    catch (err) { console.warn('warning parse data-back-route:', err); }

  }

  const screen = ds.backScreen || ds.back || '';

  if (!screen) return null;

  const params = {};

  if (ds.backSlug) params.slug = ds.backSlug;

  return ensureBackRoute({ screen, params: Object.keys(params).length ? params : null });

}



function shouldHandleBack(el) {

  if (!el) return false;

  const ds = el.dataset || {};

  if (ds.back !== undefined || ds.backScreen || ds.backRoute) return true;

  if (el.classList && (el.classList.contains('auth-link') || el.classList.contains('back-btn'))) {

    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();

    if (text && text.includes('voltar')) return true;

    const aria = (el.getAttribute && (el.getAttribute('aria-label') || '').toLowerCase()) || '';

    if (aria.includes('voltar')) return true;

  }

  return false;

}



window.appBack = function(fallbackRoute) {

  const safeRoute = ensureBackRoute(fallbackRoute);

  try { localStorage.setItem(FORCED_ROUTE_STORAGE_KEY, JSON.stringify(safeRoute)); } catch {}

  // Se um destino explícito foi informado, aplica diretamente
  if (safeRoute && safeRoute.screen) {
    applyRouteImmediately(safeRoute, true);
    return;
  }

  const previousHref = location.href;

  let usedHistory = false;



  try {

    if (history.length > 1) {

      window.__backNavigationInFlight = true;

      history.back();

      usedHistory = true;

      setTimeout(() => {

        if (window.__backNavigationInFlight && location.href === previousHref) {

          window.__backNavigationInFlight = false;

          applyRouteImmediately(safeRoute, true);

        }

      }, BACK_FAILSAFE_DELAY);

    }

  } catch (err) {

    console.warn('warning appBack history:', err);

  }



  if (!usedHistory) {

    window.__backNavigationInFlight = false;

    applyRouteImmediately(safeRoute, true);

  }

};



// Intercepta cliques em botões/links "Voltar" para usar o histórico

document.addEventListener('click', (ev) => {

  try {

    const el = ev.target && ev.target.closest ? ev.target.closest('[data-back], .auth-link, .back-btn') : null;

    if (!el || !shouldHandleBack(el)) return;

    ev.preventDefault();

    ev.stopPropagation();

    ev.stopImmediatePropagation();

    const route = readBackRouteFromElement(el);

    window.appBack(route);

  } catch (err) {

    console.warn('warning handle back click:', err);

  }

}, true);

/*************************************************
 * RESPONSIVIDADE (modo desktop em dispositivos moveis)
 *************************************************/
const TOUCH_DESKTOP_MIN_RATIO = 1.18;
const TOUCH_DESKTOP_MAX_SCALE = 2.4;
let __touchDesktopScale = 1;

function hasCoarsePointer() {
  try {
    if (window.matchMedia) return window.matchMedia('(pointer: coarse)').matches;
  } catch {}
  try {
    return ('ontouchstart' in window) || (navigator && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0);
  } catch { return false; }
}

function computeTouchDesktopScale() {
  const layoutWidth = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0, 1);
  const vv = window.visualViewport;
  const visualWidth = vv && vv.width ? vv.width : layoutWidth;
  if (!visualWidth) return 1;
  const ratio = layoutWidth / visualWidth;
  if (!Number.isFinite(ratio) || ratio <= TOUCH_DESKTOP_MIN_RATIO) return 1;
  const scaled = Number((ratio * 0.96).toFixed(2));
  return Math.min(TOUCH_DESKTOP_MAX_SCALE, Math.max(1.2, scaled));
}

function updateTouchDesktopExperience() {
  try {
    const body = document.body;
    if (!body) return;
    if (!hasCoarsePointer()) {
      if (body.classList.contains('lm-touch-desktop')) {
        body.classList.remove('lm-touch-desktop');
        document.documentElement.style.removeProperty('--touch-desktop-scale');
        __touchDesktopScale = 1;
      }
      return;
    }
    const scale = computeTouchDesktopScale();
    const active = scale > 1.05;
    if (!active) {
      if (body.classList.contains('lm-touch-desktop')) {
        body.classList.remove('lm-touch-desktop');
        document.documentElement.style.removeProperty('--touch-desktop-scale');
        __touchDesktopScale = 1;
      }
      return;
    }
    if (!body.classList.contains('lm-touch-desktop')) body.classList.add('lm-touch-desktop');
    if (Math.abs(scale - __touchDesktopScale) > 0.01) {
      document.documentElement.style.setProperty('--touch-desktop-scale', String(scale));
      __touchDesktopScale = scale;
    }
  } catch (err) {
    console.warn('warning updateTouchDesktopExperience:', err);
  }
}

window.__updateTouchDesktopExperience = updateTouchDesktopExperience;

window.addEventListener('resize', updateTouchDesktopExperience);
window.addEventListener('orientationchange', updateTouchDesktopExperience);

if (window.visualViewport) {
  try {
    window.visualViewport.addEventListener('resize', updateTouchDesktopExperience);
    window.visualViewport.addEventListener('scroll', updateTouchDesktopExperience);
  } catch {}
}

/*************************************************
 * ADMIN (quem pode liberar PRO)
 *************************************************/
const ADMIN_EMAILS = ["legmasterpreparatoria@gmail.com","adm@adm.com","jonas@gmail.com", "cfcalianca@gmail.com"];
function isAdmin() { const e = getUserEmail(); return !!e && ADMIN_EMAILS.includes(e); }

/*************************************************
 * PLANO (FREE vs PRO) + WhatsApp
 *************************************************/
const WHATS_APP = "5535998475349";
const FREE_UNLOCK_INDEX = 1;

async function getPlanoAtual(force=false) {
  const email = getUserEmail();
  if (!email) { window.currentUser.plano = "free"; return "free"; }
  let cached=null, ts=0;
  try {
    cached = localStorage.getItem(`plano:${email}`) || null;
    ts = parseInt(localStorage.getItem(`plano_ts:${email}`) || "0", 10);
  } catch {}
  const STALE_MS = 15*1000;
  const isStale = (Date.now()-ts) > STALE_MS;
  if (!force && cached && !isStale && cached!=="free") { window.currentUser.plano=cached; return cached; }
  try {
    await ensureDb();
    if (db) {
      const idNew = emailDocId(email);
      const idLegacy = emailDocIdLegacy(email);
      let snap = await db.collection("liberacoes").doc(idNew).get();
      if (!snap.exists && idLegacy!==idNew) snap = await db.collection("liberacoes").doc(idLegacy).get();
      let plano = "free";
      if (snap.exists) {
        const data = snap.data() || {};
        plano = (data.plano || (data.ativo ? "pro" : "free") || "free").toLowerCase();
        if (plano==="pro" && data.ate?.toDate) {
          const exp = data.ate.toDate();
          if (exp < new Date()) plano = "free";
        }
      }
      window.currentUser.plano = plano;
      try {
        localStorage.setItem(`plano:${email}`, plano);
        localStorage.setItem(`plano_ts:${email}`, String(Date.now()));
      } catch {}
      return plano;
    }
  } catch (e) { console.warn("⚠️ getPlanoAtual:", e); }
  const out = cached || "free";
  window.currentUser.plano = out;
  return out;
}

function openWhatsPro() {
  const url = `https://wa.me/${WHATS_APP}?text=${encodeURIComponent(
    "Olá! Quero assinar o Plano PRO da Legmaster para liberar todas as provas de todas as matérias. Pode me enviar a chave PIX e o valor?"
  )}`;
  window.open(url, "_blank", "noopener");
}

/*************************************************
 * TELA PIX
 *************************************************/
// const PIX_INFO = {
//   chave: "11447748611",
//   valorCentavos: 3000, // R$ 30,00
//   whatsTexto: "(35) 99847-5349",
//   titular: "Jonathas Guilherme de Paula",
//   banco: "Caixa Econômica Federal"
// };
// function _brl(cents){ return (cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
// function _buildWhatsLink(email){
//   const msg = [
//     "Olá! Fiz o PIX da versão completa por (1 ano).",
//     `No valor de: ${_brl(PIX_INFO.valorCentavos)}`,
//     `Na chave PIX: ${PIX_INFO.chave}`,
//     `E-mail cadastrado: ${email || "(informar)"}`,
//     "Segue o comprovante em anexo."
//   ].join("\n");
//   return `https://wa.me/${WHATS_APP}?text=${encodeURIComponent(msg)}`;
// }
// window.openPixOrientacoes = function openPixOrientacoes() {
//   const email = (window.currentUser && window.currentUser.email) || "";
//   document.getElementById("pixm-overlay")?.remove();
//   document.getElementById("pixm-style")?.remove();
//   const style = document.createElement("style");
//   style.id = "pixm-style";
//   style.textContent = `
// #pixm-overlay {
//   position: fixed; inset: 0; z-index: 999999;
//   background: rgba(2,12,8,.55); backdrop-filter: blur(2px);
//   display: flex; align-items: center; justify-content: center;
// }
// .pixm-box {
//   position: relative; width: min(560px,94vw); max-height: 92vh; overflow: hidden;
//   background: linear-gradient(180deg,#ffffff,#fbfbfb);
//   border: 1px solid #e6e9ef; border-radius: 16px;
//   box-shadow: 0 24px 60px rgba(0,0,0,.25), 0 2px 8px rgba(0,0,0,.05);
//   display: flex; flex-direction: column;
// }
// .pixm-header { display: flex; gap: 14px; align-items: center; padding: 20px 20px 10px; }
// .pixm-icon {
//   width: 40px; height: 40px; flex: 0 0 auto;
//   border-radius: 12px; display:flex; align-items:center; justify-content:center;
//   background: linear-gradient(135deg,#e8f5e9,#d7f0dc); box-shadow: inset 0 1px 0 #ffffff;
// }
// .pixm-title { margin: 0; color: #0f5132; font-size: 22px; line-height: 1.25; font-weight: 900; letter-spacing: -0.01em; }
// .pixm-subtitle { margin: 0; color: #0f5132; font-size: 16px; line-height: 1.3; font-weight: 800; }
// .pixm-body { padding: 10px 20px 18px; overflow:auto; text-align: center; }
// .pixm-message { font-size: 18px; color: #0f5132; font-weight: 600; line-height: 1.5; }
// .pixm-close {
//   position:absolute; right:12px; top:10px; border:none; cursor:pointer;
//   width: 36px; height: 36px; border-radius: 12px;
//   display:flex; align-items:center; justify-content:center;
//   background: #fee2e2; color:#b91c1c; font-size:20px;
//   box-shadow: 0 10px 24px rgba(220,38,38,.20), 0 1px 2px rgba(0,0,0,.04);
//   transition: transform .15s ease, box-shadow .2s ease, background-color .2s ease, color .2s ease;
// }
// .pixm-close:hover { transform: translateY(-1px); background:#fecaca; color:#991b1b; box-shadow: 0 14px 28px rgba(220,38,38,.28), 0 2px 4px rgba(0,0,0,.06); }
// .pixm-close:focus-visible { outline: 3px solid rgba(239,68,68,.45); outline-offset: 2px; }
// `;
//   document.head.appendChild(style);

//   const overlay = document.createElement("div"); overlay.id = "pixm-overlay";
//   const box = document.createElement("div"); box.className = "pixm-box";
//   const closeBtn = document.createElement("button");
//   closeBtn.className = "pixm-close"; closeBtn.setAttribute("aria-label","Fechar"); closeBtn.innerHTML = "&times;";

//   const header = document.createElement("div");
//   header.className = "pixm-header";

//   const body = document.createElement("div"); body.className = "pixm-body";
//   const message = document.createElement("div"); message.className = "pixm-message";
//   message.innerHTML = "Entre em contato com seu CFC para adquirir a versão completa do simulado.";

//   body.appendChild(message);
//   box.appendChild(closeBtn); box.appendChild(header); box.appendChild(body);
//   overlay.appendChild(box); document.body.appendChild(overlay); document.body.style.overflow = "hidden";

//   const close = () => { overlay.remove(); document.body.style.overflow = ""; document.getElementById("pixm-style")?.remove(); };
//   closeBtn.onclick = close;
//   overlay.addEventListener("click", (e)=>{ if (e.target===overlay) close(); });
//   document.addEventListener("keydown", (e)=>{ if (e.key==="Escape") close(); }, { once:true });
// };

// ======== Checkout Pro (cartão/PIX sem parcelar) ========
// function _apiBase(){
//   return (window.LEGMASTER_CONFIG && window.LEGMASTER_CONFIG.API_BASE) || '';
// }
// window.openCheckoutPro = async function(){
//   try {
//     const email = getUserEmail();
//     if (!email) { mostrarAlerta('Faça login para assinar.'); return; }
//     let uid = null;
//     try { uid = firebase?.auth?.().currentUser?.uid || email.replace(/[.@]/g,'_'); } catch {}
//     const url = (_apiBase() || '') + '/api/mp/create-preference';
//     const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ uid, email }) });
//     const data = await r.json();
//     if (!r.ok || !data?.init_point){ throw new Error(data?.error || 'Falha ao iniciar pagamento'); }
//     window.open(data.init_point, '_blank');
//   } catch (e) {
//     console.warn('[checkout] erro:', e);
//     mostrarAlerta('Não foi possível abrir o pagamento agora. Tente novamente.');
//   }
// };


/*************************************************
 * FIRESTORE: Desempenho
 *************************************************/
window.salvarDesempenhoFirestore = async function(email, prova, acertos, totalQuestoes) {
  email = normalizeEmail(email);
  await ensureDb();
  if (!db) { console.warn("⚠️ Firestore indisponível; salvando apenas localmente."); return; }
  if (!email) { console.warn("⚠️ salvarDesempenhoFirestore: sem e-mail."); return; }
  const emailDoc = email.replace(/[.@]/g, "_");
  const data = new Date().toLocaleString("pt-BR");
  try {
    const payload = { email, prova, acertos, data, docId: emailDoc };
    if (typeof totalQuestoes === 'number') payload.total = totalQuestoes;
    await db.collection("desempenhos").add(payload);
    console.log("✅ Desempenho salvo no Firestore.");
  } catch (err) { console.error("❌ Erro ao salvar desempenho:", err); }
};
async function buscarDesempenhoFirestore(email) {
  email = normalizeEmail(email);
  await ensureDb();
  const resultados = [];
  try {
    if (!db) return resultados;
    const id = emailDocId(email);
    // 1) Campo 'email'
    try { const s = await db.collection("desempenhos").where("email","==",email).get(); s.forEach(d=>resultados.push(d.data())); } catch {}
    // 2) Campo 'docId'
    if (resultados.length===0) { try { const s = await db.collection("desempenhos").where("docId","==",id).get(); s.forEach(d=>resultados.push(d.data())); } catch {} }
    // 3) Campos alternativos que podem ter sido usados
    if (resultados.length===0) { try { const s = await db.collection("desempenhos").where("usuario","==",email).get(); s.forEach(d=>resultados.push(d.data())); } catch {} }
    if (resultados.length===0) { try { const s = await db.collection("desempenhos").where("user","==",email).get(); s.forEach(d=>resultados.push(d.data())); } catch {} }
    // 4) Documento agregado por email (docId == emailDocId) com array interno
    if (resultados.length===0) {
      try {
        const doc = await db.collection('desempenhos').doc(id).get();
        if (doc.exists) {
          const data = doc.data() || {};
          const arrays = ['registros','itens','historico','hist','lista'];
          arrays.forEach(k=>{ const arr = Array.isArray(data[k]) ? data[k] : []; arr.forEach(x=> resultados.push(x)); });
        }
      } catch {}
    }
    // 5) Coleções alternativas comuns
    if (resultados.length===0) { try { const s = await db.collection("desempenho").where("email","==",email).get(); s.forEach(d=>resultados.push(d.data())); } catch {} }
    if (resultados.length===0) { try { const s = await db.collection("resultados").where("email","==",email).get(); s.forEach(d=>resultados.push(d.data())); } catch {} }
    if (resultados.length===0) { try { const s = await db.collection("acessos").where("email","==",email).get(); s.forEach(d=>{ const x=d.data(); resultados.push({ email:x.email, prova:x.prova, acertos:x.acertos, total:x.totalQuestoes||x.total||null, data:x.data || (x.quando && x.quando.toDate ? x.quando.toDate().toLocaleString('pt-BR') : '') }); }); } catch {} }
    // 6) Subcoleção dentro do doc
    if (resultados.length===0) {
      try {
        const sub = await db.collection('desempenhos').doc(id).collection('itens').get();
        sub.forEach(doc=> resultados.push(doc.data()));
      } catch {}
    }
  } catch (err) { console.error("Erro ao buscar desempenho:", err); }
  // Ordena por data (string) desc como fallback
  try { resultados.sort((a,b)=> String(b.data||'').localeCompare(String(a.data||''))); } catch {}
  return resultados;
}

/*************************************************
 * BACKUP LOCAL
 *************************************************/
function salvarDesempenhoLocal(email, prova, acertos, totalQuestoes) {
  try {
    const key = 'desempenho';
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    const arr = store[email] || [];
    const rec = { prova, acertos, data: new Date().toLocaleString('pt-BR') };
    if (typeof totalQuestoes === 'number') rec.total = totalQuestoes;
    arr.push(rec);
    store[email] = arr;
    localStorage.setItem(key, JSON.stringify(store));
  } catch (e) { console.warn('⚠️ Falha no backup local do desempenho:', e); }
}
window.salvarDesempenho = function (prova, acertos, totalQuestoes) {
  const email = getUserEmail();
  const nomeProva = prova || localStorage.getItem('provaAtual') || 'Simulado';
  const api = getApiClient();
  if (hasApiSession() && api && typeof api.postResultado === 'function') {
    api.postResultado({
      alunoId: email,
      provaId: nomeProva,
      acertos,
      total: totalQuestoes
    }).catch((err) => console.warn('[api] sincronizar resultado falhou', err));
  }
  window.salvarDesempenhoFirestore(email, nomeProva, acertos, totalQuestoes);
  if (email) salvarDesempenhoLocal(email, nomeProva, acertos, totalQuestoes);
};
window.registrarDesempenho = window.salvarDesempenho;
window.registrarDesempenhoFimProva = function (acertos, totalQuestoes) {
  const nomeProva = localStorage.getItem('provaAtual') || 'Simulado';
  window.salvarDesempenho(nomeProva, acertos, totalQuestoes);
};

/* ================== AJUDA NO WHATSAPP ================== */
const WA_NUMBER = "5535998475349";
window.openLoginHelp = function () {
  const email = (document.getElementById("email")?.value || "").trim();
  const msg = `Olá! Tive dificuldade para entrar na plataforma. Meu e-mail: ${email || "(não preenchi)"} Pode me ajudar?`;
  const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  try { const win = window.open(url, "_blank", "noopener"); if (!win) window.location.href = url; }
  catch { window.location.href = url; }
};

/*************************************************
 * LOGIN
 *************************************************/
function renderLogin() {
  if (!window.__navigatingBack) pushRoute('login');
  localStorage.setItem("telaAtual", "login");
  const box = document.getElementById("form-box");
  if (!box) return;
  box.innerHTML = `
    <img src="./icons/logo_nova.png" alt="Simulados DETRAN" class="intro-logo login-logo" />
    <h2 class="auth-title">Login</h2>
    <!-- Integração com LegmasterApi: manter comentários enquanto validamos fluxo híbrido. -->
    <div id="login-error" class="auth-error" role="alert" aria-live="assertive"></div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="email" autocapitalize="none" autocorrect="off" spellcheck="false"/>
      <div id="erro-email" style="color:#d32f2f;font-size:12px;margin-top:4px;"></div>
    </div>
    <div class="form-group">
      <label>Senha</label>
      <input type="password" id="senha" autocapitalize="none" autocorrect="off" spellcheck="false"/>
      <div id="erro-senha" style="color:#d32f2f;font-size:12px;margin-top:4px;"></div>
    </div>
    <button type="button" class="auth-btn" id="botaoLogin">Entrar</button>
    <button type="button" class="auth-btn" data-noback="1" style="margin-top:16px;" onclick="logout()">Voltar</button>
    <a class="support-link" style="margin-top:10px;display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:#128C7E;font-weight:800;" target="_blank" rel="noopener" href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Olá! Preciso de suporte técnico para acessar o app.')}"><img src="./icons/zap.png?v=${ASSET_VERSION}" alt="" class="wa-icon-img"/> Clique aqui para suporte técnico</a>
    
    `;
  document.getElementById("botaoLogin").addEventListener("click", login);
  document.getElementById("email").focus();
  animateCard();
}

function showLoginBanner(msg) {
  const box = document.getElementById("login-error");
  if (box) {
    box.classList.remove("is-visible");
    // Force reflow to restart animation when showing the same message twice
    void box.offsetWidth;
    box.textContent = msg;
    box.classList.add("is-visible");
    return;
  }
  if (typeof mostrarAlertaLogin==="function") mostrarAlertaLogin(msg); else alert(msg);
 }
function setFieldError(inputId, errorBoxId, message) {
  const inp = document.getElementById(inputId);
  const box = document.getElementById(errorBoxId || `erro-${inputId}`);
  if (inp) { inp.style.borderColor = message ? "#d32f2f" : "#ccc"; inp.style.outline = message ? "1px solid #d32f2f" : "none"; }
  if (box) box.textContent = message || "";
}
function clearFieldErrors(){ setFieldError("email","erro-email",""); setFieldError("senha","erro-senha",""); const box = document.getElementById("login-error"); if (box) { box.classList.remove("is-visible"); box.textContent = ""; } }
async function resetSenha() {
  const email = normalizeEmail((document.getElementById("email")?.value || ""));
  const show = (m)=>{ if (typeof mostrarAlertaLogin==="function") mostrarAlertaLogin(m); else alert(m); };
  if (!email) { show("Digite seu e-mail no campo acima e clique em 'Esqueci minha senha'."); document.getElementById("email")?.focus(); return; }
  const btn = document.getElementById("btn-reset");
  const a = getAuthSafe();
  if (!a || typeof a.sendPasswordResetEmail !== "function") { show("Serviço de login indisponível no momento. Atualize a página e tente novamente."); if (btn) btn.disabled = false; return; }
  if (btn) btn.disabled = true;
  try { await a.sendPasswordResetEmail(email); show(`Enviamos um e-mail para redefinir sua senha. Remetente: ${RESET_SENDER_HINT} ✅`); }
  catch (e) {
    console.error("resetSenha erro:", e);
    const map = {"auth/user-not-found":"Não encontramos esse e-mail.","auth/invalid-email":"E-mail inválido.","auth/missing-email":"Digite seu e-mail."};
    show(map[e.code] || "Não foi possível enviar agora. Tente novamente.");
  } finally { setTimeout(()=>{ if (btn) btn.disabled=false; },3000); }
}
function login() {
  clearFieldErrors();
  const email = normalizeEmail((document.getElementById("email")?.value || ""));
  const senha = (document.getElementById("senha")?.value || "");
  const btn = document.getElementById("botaoLogin");
  const a = getAuthSafe();
  if (!a || typeof a.signInWithEmailAndPassword !== "function") { showLoginBanner("Serviço de login indisponível no momento. Atualize a página e tente novamente."); return; }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!email || !senha || !emailOk) { showLoginBanner("Verifique e-mail e senha e tente novamente."); return; }
  if (btn) btn.disabled = true;
  const api = getApiClient();
  if (api && typeof api.login === 'function') {
    api.login({ email, senha }).then((dados) => {
      console.log('[api] login ok', dados);
    }).catch((erro)=>{
      console.warn('[api] login falhou', erro);
    });
  }
  a.signInWithEmailAndPassword(email, senha)
    .then(() => {
      const salvo = JSON.parse(localStorage.getItem("usuarioLogado") || "{}");
      const nomeSalvo = salvo.nome || email.split("@")[0];
      window.currentUser = { email, nome: nomeSalvo || "Aluno" };
      localStorage.setItem("usuarioLogado", JSON.stringify(window.currentUser));
      renderMenuPrincipal();
    })
    .catch(() => { showLoginBanner("E-mail ou senha incorretos."); document.getElementById("senha")?.focus(); })
    .finally(()=>{ if (btn) btn.disabled=false; });
}
document.getElementById("senha")?.addEventListener("keydown",(e)=>{
  const on = e.getModifierState && e.getModifierState("CapsLock");
  const box = document.getElementById("erro-senha");
  if (box) box.textContent = on ? "Caps Lock ligado pode causar erro na senha." : "";
});

/*************************************************
 * ALERTAS
 *************************************************/
function mostrarAlerta(mensagem) {
  const box = document.getElementById("custom-alert");
  const msg  = document.getElementById("alert-message");
  if (box && msg) { msg.innerText = mensagem; box.style.display = "flex"; }
}
function fecharAlerta(){ const box = document.getElementById("custom-alert"); if (box) box.style.display = "none"; }
function mostrarAlertaLogin(msg) {
  const alerta = document.getElementById("alerta-login");
  const texto  = document.getElementById("mensagem-alerta-login");
  if (alerta && texto) { texto.textContent = msg; alerta.style.display="block"; setTimeout(()=> alerta.style.display="none", 5000); }
}

/*************************************************
 * MENU PRINCIPAL
 *************************************************/
function renderMenuPrincipal() {

  if (!window.__navigatingBack) pushRoute('menu');

  localStorage.setItem("telaAtual", "menu");

  // Exemplo de uso: carregar configurações do CFC ao entrar no menu principal.
  const api = getApiClient();
  if (api && typeof api.getStoredToken === 'function' && api.getStoredToken()) {
    // Nota: chamada em background, sem alterar fluxo atual.
    api.getConfigCfc().then((config) => {
      console.log('[api] config CFC', config);
    }).catch((err) => console.warn('[api] config falhou', err));
  }

  const nomeBase = window.currentUser?.nome || (window.currentUser?.email ? window.currentUser.email.split("@")[0] : "Aluno");

  const primeiroNome = (nomeBase.split(/[.\d_]/)[0] || "Aluno");

  const nomeFmt = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();

  document.getElementById("form-box").innerHTML = `

    <div class="screen-centered menu-screen">

      <h2 class="menu-title">${nomeFmt}, Bem vindo ao Simulado Agente Oficial!</h2>
      <p class="intro-tagline">Praticar todos os simulados!<br><br>Entender cada pergunta respondida!</p>

      <div class="menu-actions">

        <button class="auth-btn" type="button" onclick="renderHome()">&#128221;&nbsp;Fazer Simulados</button>

        <button class="auth-btn" type="button" onclick="renderAulas()">&#127909;&nbsp;Assistir Aulas</button>

        <button class="auth-btn" type="button" onclick="renderDesempenho()">&#128202;&nbsp;Ver Desempenho</button>

        ${isAdmin() ? `

          <button class="auth-btn" type="button" onclick="renderAdminLiberacoes()">&#9881;&#65039;&nbsp;Admin Libera&ccedil;&otilde;es</button>

          <button class="auth-btn" type="button" onclick="renderAdminAlunosCFC()">&#128203;&nbsp;Admin Alunos por CFC</button>

        ` : ""}

        <button class="auth-btn auth-link" type="button" onclick="logout()">Sair</button>

      </div>

    </div>`;

  animateCard();

}


function logout() {
  const finalizar = () => {
    try {
      localStorage.removeItem("usuarioLogado");
      try { localStorage.removeItem(LAST_ROUTE_STORAGE_KEY); } catch {}
      try { localStorage.removeItem(FORCED_ROUTE_STORAGE_KEY); } catch {}
    } catch {}
    window.currentUser = {};
    try { window.__disablePush = true; renderIntro(); window.__disablePush = false; pushRoute('intro', null, true); } catch { renderIntro(); }
  };
  const a = getAuthSafe();
  if (a && typeof a.signOut === "function") {
    a.signOut().then(finalizar).catch((erro) => { console.warn("Erro ao sair da conta:", erro); finalizar(); });
  } else {
    finalizar();
  }
}

/*************************************************
 * AULAS
 *************************************************/
function renderAulas() {
  if (!window.__navigatingBack) pushRoute('aulas');
  localStorage.setItem("telaAtual", "aulas");
  const materias = ["Legislação","Direção Defensiva","Primeiros Socorros","Meio Ambiente","Mecânica","Infrações","Sinalização","Normas de Circulação"];
  document.getElementById("form-box").innerHTML = `
    <div style="text-align: center;">
      <h2 style="color:#2E7D32; font-size: 22px; margin-bottom: 20px;">Selecione uma matéria para começar:</h2>
      <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:20px; justify-content:center;">
        ${materias.map(mat => `
          <button class="auth-btn" onclick="abrirAulas('${mat}')" style="min-width:110px;height:60px;display:flex;align-items:center;justify-content:center;text-align:center;white-space:normal;word-break:break-word;font-weight:bold;padding:10px;">
            ${mat}
          </button>`).join("")}
      </div>
      <button class="auth-btn auth-link" style="margin-top: 40px;" data-back="menu">Voltar</button>
      <p style='margin-top: 25px; font-size: 14px; color: #555;'>"Estude com foco, conquiste seu sonho!"</p>
    </div>`;
  animateCard();
}
function abrirAulas(materia) {
  const videos = {
    "Legislação": ["https://www.youtube.com/embed/49P5mDyJFzs","https://www.youtube.com/embed/fRU-1WHuVps"],
    "Direção Defensiva": ["https://www.youtube.com/embed/drXT33GSwgE","https://www.youtube.com/embed/ux_jUCkSjK8"],
    "Sinalização": ["https://www.youtube.com/embed/zBEoQ2xlFcA","https://www.youtube.com/embed/HqFi_ZzCMic"],
    "Normas de Circulação": ["https://www.youtube.com/embed/0EV9-3y6KxA"],
    "Mecânica": ["https://www.youtube.com/embed/365JOhGOC6s","https://www.youtube.com/embed/lPIpah3PZRg"],
    "Meio Ambiente": ["https://www.youtube.com/embed/NMcJrgc48B0"],
    "Infrações": ["https://www.youtube.com/embed/jxwJeG31q0Y","https://www.youtube.com/embed/gOtBIfBLwT4"],
    "Primeiros Socorros": ["https://www.youtube.com/embed/X-jt2ffPCQw"]
  };
  const lista = videos[materia] || [];
  document.getElementById("form-box").innerHTML = `
    <div style="text-align: center;">
      <h2 style="color:#2E7D32; font-size: 22px; margin-bottom: 15px;">${materia}</h2>
      <div style="display: flex; flex-direction: column; gap: 20px;">
        ${lista.map(link => `<iframe width="100%" height="215" src="${link}" frameborder="0" allowfullscreen></iframe>`).join("")}
      </div>
      <button class="auth-btn auth-link" style="margin-top: 25px;" data-back="aulas">Voltar às Matérias</button>
    </div>`;
  animateCard();
}

/*************************************************
 * SIMULADOS (Home)
 *************************************************/
function renderHome() { localStorage.setItem("telaAtual","home"); renderSimulados(); }
function renderSimulados() {
  if (!window.__navigatingBack) pushRoute('simulados');
  localStorage.setItem("telaAtual", "simulados");
  document.getElementById("form-box").innerHTML = `
    <div style="text-align: center;">
        <p style="font-size: 18px; color: #444;">Selecione uma matéria e comece a praticar!</p>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 15px; margin-top: 25px;">
        <button class="auth-btn" onclick="renderProvas('Sinalização')">Sinalização</button>
        <button class="auth-btn" onclick="renderProvas('Normas de Circulação')">Normas de Circulação</button>
        <button class="auth-btn" onclick="renderProvas('Direção Defensiva')">Direção Defensiva</button>
        <button class="auth-btn" onclick="renderProvas('Legislação')">Legislação</button>
        <button class="auth-btn" onclick="renderProvas('Primeiros Socorros')">Primeiros Socorros</button>
        <button class="auth-btn" onclick="renderProvas('Mecânica')">Mecânica</button>
        <button class="auth-btn" onclick="renderProvas('Meio Ambiente')">Meio Ambiente</button>
        <button class="auth-btn" onclick="renderProvas('Infrações')">Infrações</button>
        <button class="auth-btn" onclick="renderProvas('Provas gerais')">Provas gerais</button>
      </div>
      <button class="auth-btn auth-link" style="margin-top: 40px;" data-back="menu">Voltar</button>
      <p style="margin-top: 25px; font-size: 14px; color: #555;">"Estude com foco, conquiste seu sonho!"</p>
    </div>`;
}

/*************************************************
 * LISTA DE PROVAS
 *************************************************/
const MATERIAS = {
  "Sinalização":"sinalizacao","Normas de Circulação":"normas_circulacao","Legislação":"legislacao",
  "Infrações":"infracoes","Direção Defensiva":"direcao_defensiva","Primeiros Socorros":"primeiros_socorros",
  "Meio Ambiente":"meio_ambiente","Mecânica":"mecanica","Provas gerais":"provas_gerais"
};
const FIXED_COUNTS = {
  sinalizacao: 5,
  normas_circulacao: 5,
  legislacao: 5,
  infracoes: 5,
  direcao_defensiva: 5,
  primeiros_socorros: 5,
  meio_ambiente: 5,
  mecanica: 5,
  // Evita varredura por HEAD requests ao entrar em "Provas gerais".
  // Atualize este valor se adicionar/remover pastas simulados/provas_gerais-*/
  provas_gerais: 10
};
async function getTotalByMateria(slug, basePath="simulados"){
  // Usa contagem fixa definida em FIXED_COUNTS (inclui provas_gerais:10).
  const fixed = FIXED_COUNTS[slug];
  if (fixed) return fixed;
  return 4;
}
async function _renderProvasImpl(materia) {
  localStorage.setItem("telaAtual", "provas");
  const basePath="simulados"; const prefixo=MATERIAS[materia]||""; const total=await getTotalByMateria(prefixo, basePath);
  try {
    localStorage.setItem('__ultimaProvaSlug', prefixo || '');
  } catch {}

  if (!window.__navigatingBack) pushRoute('provas', { slug: prefixo||null });
  const urls = Array.from({length: total}, (_,i)=> `${basePath}/${prefixo}-${i+1}/index.html`);
  const plano = await getPlanoAtual(); const isPro = (plano==="pro");
  const cardsHtml = urls.map((url,i)=>{
    const idx=i+1; const liberada=isPro || (idx===FREE_UNLOCK_INDEX);
    if (liberada) return `
      <div style="width:100%;max-width:360px;">
        <button class="auth-btn" onclick="abrirProva('${materia} - Prova ${idx}', '${url}')">
          Prova ${idx} ${isPro ? "" : (idx===FREE_UNLOCK_INDEX ? " (GRÁTIS)" : "")}
        </button>
      </div>`;
    return `
      <div style="width:100%;max-width:360px;">
        <div style="background:#f7f7f7;border:1px solid #e0e0e0;border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;">
          <div style="text-align:left;">
            <div style="font-weight:bold;color:#333;">Prova ${idx}</div>
            <div style="font-size:13px;color:#777;display:flex;align-items:center;gap:6px;">
              <span aria-hidden="true">🔒</span> <span>Libere o acesso</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
  document.getElementById("form-box").innerHTML = `
    <div style="text-align: center;">
      
      <h2 style="color:#2E7D32; font-size: 24px; margin-bottom: 10px;">${materia}</h2>
      <div style="display: flex; flex-direction: column; align-items: center; margin: 30px 0; gap: 15px;">
        ${cardsHtml}
      </div>
      <div style="display:flex;justify-content:center;margin-top:30px;">
        <button type="button" class="auth-btn auth-link" style="width:100%;max-width:360px;" data-back="simulados" data-back-screen="simulados">Voltar</button>
      </div>
      ${!isPro ? `
        <div style="margin-top:24px;display:flex;justify-content:center;">
          <div style="background:linear-gradient(135deg,#2ecc71 0%,#1e8a3d 100%);color:#fff;padding:20px 26px;border-radius:18px;box-shadow:0 20px 38px rgba(0,0,0,0.28);max-width:440px;width:100%;text-align:left;border:1px solid rgba(255,255,255,0.4);">
            <strong style="display:block;font-size:18px;margin-bottom:8px;">💡 Libere o acesso total</strong>
            <span style="display:block;font-size:15px;line-height:1.5;">Fale com seu instrutor ou responsável no CFC e solicite a liberação completa dos simulados para estudar sem limites.</span>
          </div>
        </div>` : ""}
    </div>`;
  animateCard();
}
// Normalização de nomes e roteamento por slug (compatível com GitHub Pages)
const LABEL_BY_SLUG = {
  sinalizacao: 'Sinaliza\u00E7\u00E3o',
  normas_circulacao: 'Normas de Circula\u00E7\u00E3o',
  legislacao: 'Legisla\u00E7\u00E3o',
  infracoes: 'Infra\u00E7\u00F5es',
  direcao_defensiva: 'Dire\u00E7\u00E3o Defensiva',
  primeiros_socorros: 'Primeiros Socorros',
  meio_ambiente: 'Meio Ambiente',
  mecanica: 'Mec\u00E2nica',
  provas_gerais: 'Provas gerais'
};
function materiaToSlug(m){
  const s = String(m||'').toLowerCase();
  if (s.includes('dire')) return 'direcao_defensiva';
  if (s.includes('infra')) return 'infracoes';
  if (s.includes('legis')) return 'legislacao';
  if (s.includes('mec')) return 'mecanica';
  if (s.includes('meio')) return 'meio_ambiente';
  if (s.includes('normas')) return 'normas_circulacao';
  if (s.includes('primeiros')) return 'primeiros_socorros';
  if (s.includes('sinal')) return 'sinalizacao';
  if (s.includes('provas')) return 'provas_gerais';
  return null;
}
async function _renderProvasBySlug(slug){
  localStorage.setItem('telaAtual','provas');
  const basePath='simulados';
  const prefixo = slug || '';
  const total = await getTotalByMateria(prefixo, basePath);
  try { localStorage.setItem('__ultimaProvaSlug', prefixo || ''); } catch {}
  if (!window.__navigatingBack) pushRoute('provas', { slug: prefixo||null });
  const urls = Array.from({length: total}, (_,i)=> `${basePath}/${prefixo}-${i+1}/index.html`);
  const plano = await getPlanoAtual();
  const isPro = (plano==='pro');
  const label = LABEL_BY_SLUG[prefixo] || prefixo;
  const cardsHtml = urls.map((url,i)=>{ const idx=i+1; const liberada=isPro || (idx===FREE_UNLOCK_INDEX);
    if (liberada) return `<div style="width:100%;max-width:360px;">
      <button class="auth-btn" onclick="abrirProva('${label} - Prova ${idx}', '${url}')">
        Prova ${idx} ${isPro ? '' : (idx===FREE_UNLOCK_INDEX ? ' (GR\u00C1TIS)' : '')}
      </button>
    </div>`;
    return `<div style="width:100%;max-width:360px;">
      <div style="background:#f7f7f7;border:1px solid #e0e0e0;border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;">
        <div style="text-align:left;">
          <div style="font-weight:bold;color:#333;">Prova ${idx}</div>
          <div style="font-size:13px;color:#777;display:flex;align-items:center;gap:6px;">
            <span aria-hidden="true">🔒</span> <span>Libere o acesso</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('form-box').innerHTML = `
    <div style="text-align: center;">
      
      <h2 style="color:#2E7D32; font-size: 24px; margin-bottom: 10px;">${label}</h2>
      <div style="display: flex; flex-direction: column; align-items: center; margin: 30px 0; gap: 15px;">
        ${cardsHtml}
      </div>
      <div style="display:flex;justify-content:center;margin-top:30px;">
        <button type="button" class="auth-btn auth-link" style="width:100%;max-width:360px;" data-back="simulados" data-back-screen="simulados">Voltar</button>
      </div>
      ${!isPro ? `
        <div style="margin-top:24px;display:flex;justify-content:center;">
          <div style="background:linear-gradient(135deg,#2ecc71 0%,#1e8a3d 100%);color:#fff;padding:20px 26px;border-radius:18px;box-shadow:0 20px 38px rgba(0,0,0,0.28);max-width:440px;width:100%;text-align:left;border:1px solid rgba(255,255,255,0.4);">
            <strong style="display:block;font-size:18px;margin-bottom:8px;">💡 Libere o acesso total</strong>
            <span style="display:block;font-size:15px;line-height:1.5;">Fale com seu instrutor ou responsável no CFC e solicite a liberação completa dos simulados para estudar sem limites.</span>
          </div>
        </div>` : ''}
    </div>`;
  animateCard();
}
window.renderProvas = function(materia){ const slug=materiaToSlug(materia); return slug ? _renderProvasBySlug(slug) : _renderProvasImpl(materia); };
window.abrirProva = function(nomeProva, url) {
  localStorage.setItem("provaAtual", nomeProva);
  try {
    const match = /simulados\/([a-z0-9_\-]+)-\d+\//i.exec(url || '');
    if (match && match[1]) localStorage.setItem('__ultimaProvaSlug', match[1]);
  } catch {}
  try { localStorage.setItem('__ultimaProvaUrl', url || ''); } catch {}
  window.open(url, "_blank");
};

/*************************************************
 * DESEMPENHO
 *************************************************/
async function renderDesempenho() {
  if (!window.__navigatingBack) pushRoute('desempenho');
  localStorage.setItem("telaAtual", "desempenho");
  const email = getUserEmail(); if (!email) { mostrarAlerta("⚠️ Faça login para ver o desempenho."); return; }
  let dados = [];
  let origemApi = false;
  if (hasApiSession()) {
    const viaApi = await fetchResultadosViaApi(email);
    if (viaApi && viaApi.length) {
      dados = viaApi.map((d) => ({
        prova: d.prova,
        acertos: d.acertos,
        total: d.total,
        data: d.data
      }));
      origemApi = true;
    }
  }
  try {
    if (!dados.length) {
      dados = await buscarDesempenhoFirestore(email);
    }
  } catch (e) {
    console.warn('⚠️ Falha ao buscar no Firestore, usando backup local.', e);
  }
  if ((!Array.isArray(dados) || dados.length===0) && !origemApi) {
    const store = JSON.parse(localStorage.getItem('desempenho') || '{}'); dados = store[email] || [];
  }
  document.getElementById("form-box").innerHTML = `
    <div style="text-align:center;">
      <h2 style="color:#2E7D32; font-size: 24px;">📊 Desempenho</h2><br>
      ${dados.length===0 ? "<p class='desempenho-vazio'>Nenhuma prova realizada ainda.</p>" : `
        <div class="table-wrap">
          <table class="table-desempenho" role="table">
            <thead>
              <tr>
                <th scope="col">Prova</th>
                <th scope="col">Acertos</th>
                <th scope="col">Data</th>
              </tr>
            </thead>
            <tbody>
              ${dados.map(d => `
                <tr>
                  <td class="td-prova">${d.prova || ''}</td>
                  <td class="td-acertos"><span class="score-pill">${(d.acertos ?? '').toString()}</span></td>
                  <td class="td-data">${d.data || ''}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
      <button class="auth-btn auth-link" style="margin-top: 30px;" data-back="menu">Voltar</button>
    </div>`;
  animateCard();
}

/*************************************************
 * INTRO
 *************************************************/
function renderIntro() {
  if (!window.__navigatingBack) pushRoute('intro');
  localStorage.setItem("telaAtual", "intro");
  const el = document.getElementById("form-box");
  if (!el) return;
  el.innerHTML = `
    <div class="screen-centered intro-screen">
      <div class="intro-hero">
        <img src="./icons/logo_nova.png" alt="Simulados DETRAN" class="intro-logo" />
      </div>
      <div class="intro-buttons">
        <button class="auth-btn" id="btn-acessar">Acessar</button>
        <button class="auth-btn" id="btn-cadastrar">Cadastrar</button>
      </div>
      <p class="intro-tagline">Simulados com questões reais para o seu exame do Detran!</p>
    </div>`;
  document.getElementById("btn-acessar").addEventListener("click", renderLogin);
  document.getElementById("btn-cadastrar").addEventListener("click", renderCadastro);
  animateCard();
}

/*************************************************
 * CADASTRO (somente Nome do CFC + Cidade do CFC)
 *************************************************/
function renderCadastro() {
  if (!window.__navigatingBack) pushRoute('cadastro');
  localStorage.setItem("telaAtual", "cadastro");
  const fb = document.getElementById("form-box");
  if (!fb) return;
  fb.innerHTML = `
    <img src="./icons/logo_nova.png" alt="Simulados DETRAN" class="intro-logo login-logo" />
    <h2 class="auth-title">Criar conta</h2>

    <div class="form-group"><label>Nome</label><input type="text" id="cad_nome" placeholder="Seu primeiro nome" />
      <small style="color:#666;">Digite apenas o primeiro nome</small>
    </div>
    <div class="form-group"><label>Email</label><input type="email" id="cad_email" required placeholder="Digite um email válido" autocapitalize="none" autocorrect="off" spellcheck="false" /></div>
    <div class="form-group"><label>Senha</label><input type="password" id="cad_senha" required autocapitalize="none" autocorrect="off" spellcheck="false" /><small style="color:#666;">Mínimo de 6 caracteres</small></div>
    <div class="form-group"><label>Confirmar senha</label><input type="password" id="cad_confirma" required autocapitalize="none" autocorrect="off" spellcheck="false" /></div>

    <hr style="margin:14px 0;opacity:.35">

    <div class="form-group">
      <label>Nome do CFC (obrigatório)</label>
      <input type="text" id="cad_cfc_nome" placeholder="Ex.: CFC São José" />
      <small style="color:#666;">Usamos para agrupar alunos por CFC.</small>
    </div>
    <div class="form-group">
      <label>Cidade do CFC (obrigatório)</label>
      <input type="text" id="cad_cfc_cidade" placeholder="Ex.: Ouro Fino - MG" />
    </div>

    <div id="cadastro-msg" style="display:none;margin-top:10px;font-size:14px;"></div>
    <button type="button" class="auth-btn" id="botaoCadastrar" style="margin-top:14px">Cadastrar</button>
    <button type="button" class="auth-btn" data-noback="1" style="margin-top:14px" onclick="logout()">Voltar</button>
    <button class="auth-btn auth-link" style="margin-top:12px" onclick="renderLogin()">Já tenho conta</button>`;
  document.getElementById("botaoCadastrar")?.addEventListener("click",(e)=>{ e.preventDefault(); cadastrar(); });
  animateCard();
}

window.cadastrar = async function () {
  const nome    = (document.getElementById("cad_nome")?.value || "").trim();
  const email   = normalizeEmail((document.getElementById("cad_email")?.value || ""));
  const senha   = (document.getElementById("cad_senha")?.value || "").trim();
  const conf    = (document.getElementById("cad_confirma")?.value || "").trim();
  const cfcNomeR= (document.getElementById("cad_cfc_nome")?.value || "");
  const cfcCidR = (document.getElementById("cad_cfc_cidade")?.value || "");

  const cfcNome    = toTitleCase(cfcNomeR);
  const cfcCidade  = toTitleCase(cfcCidR);
  const nomeSlug   = slugify(cfcNome);
  const cidadeSlug = slugify(cfcCidade);
  const cfcSlug    = buildCfcSlug(cfcNome, cfcCidade);

  const msgBox = document.getElementById("cadastro-msg");
  const showMsg = (txt, ok=false) => {
    if (!msgBox) { console.log(txt); return; }
    msgBox.style.display = "block"; msgBox.style.padding = "10px 12px"; msgBox.style.borderRadius = "8px";
    msgBox.style.background = ok ? "#E8F5E9" : "#FFEBEE"; msgBox.style.color = ok ? "#2E7D32" : "#C62828";
    msgBox.textContent = txt;
  };

  if (!email || !senha || !conf) return showMsg("Preencha todos os campos obrigatórios.");
  if (senha.length < 6)         return showMsg("A senha deve ter pelo menos 6 caracteres.");
  if (senha !== conf)           return showMsg("As senhas não coincidem.");
  if (!cfcNome)                 return showMsg("Informe o NOME do CFC.");
  if (!cfcCidade)               return showMsg("Informe a CIDADE do CFC.");

  const a = getAuthSafe(); if (!a || typeof a.createUserWithEmailAndPassword !== "function") {
    console.warn("[Cadastro] Firebase Auth indisponível.");
    return showMsg("Falha ao iniciar o Firebase Auth. Recarregue a página (Ctrl+F5).");
  }

  try {
    showMsg("Criando sua conta...", true);
    await a.createUserWithEmailAndPassword(email, senha);

    const nomeFinal = nome || email.split("@")[0];
    window.currentUser = { email, nome: nomeFinal };
    localStorage.setItem("usuarioLogado", JSON.stringify(window.currentUser));

    try {
      await ensureDb();
      if (db) {
        const idNew    = emailDocId(email);
        const idLegacy = emailDocIdLegacy(email);

        // Liberação padrão FREE
        const payloadLib = {
          email, plano: "free", ativo: true,
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection("liberacoes").doc(idNew).set(payloadLib, { merge: true });
        if (idLegacy !== idNew) await db.collection("liberacoes").doc(idLegacy).set({ ...payloadLib, _migrado: true }, { merge: true });
        try { localStorage.setItem(`plano:${email}`, "free"); } catch {}

        // Perfil com CFC por NOME + CIDADE
        const perfil = {
          nome: nomeFinal, email, plano: "free",
          cfcNome, cfcCidade, nomeSlug, cidadeSlug, cfcSlug,
          criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection("usuarios").doc(idNew).set(perfil, { merge: true });
        if (idLegacy !== idNew) await db.collection("usuarios").doc(idLegacy).set({ ...perfil, _migrado: true }, { merge: true });

        // Índice por CFC (agregador)
        const idxRef = db.collection("cfc_index").doc(cfcSlug);
        await idxRef.set({
          cfcNome, cfcCidade, nomeSlug, cidadeSlug,
          alunos: firebase.firestore.FieldValue.increment(1),
          lastAlunoEmail: email, lastAlunoNome: nomeFinal,
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (e) { console.warn("⚠️ Falha ao gravar dados no Firestore:", e); }

    showMsg("Cadastro concluído com sucesso! Versão teste liberada. ✔️", true);
    setTimeout(() => renderMenuPrincipal(), 1000);
  } catch (error) {
    console.error("Erro no cadastro:", error);
    const map = {
      "auth/email-already-in-use": "Este e-mail já está cadastrado.",
      "auth/invalid-email": "E-mail inválido.",
      "auth/weak-password": "Senha fraca (mínimo 6 caracteres).",
      "auth/operation-not-allowed":"Ative 'Email/Password' no Firebase Authentication."
    };
    showMsg(map[error.code] || "Erro ao criar conta. Tente novamente.");
  }
};

/*************************************************
 * ADMIN LIBERAÇÕES
 *************************************************/
async function renderAdminLiberacoes() {
  if (!window.__navigatingBack) pushRoute('admin-liberacoes');
  localStorage.setItem("telaAtual", "admin_liberacoes");
  if (!isAdmin()) { mostrarAlerta("Acesso negado."); return; }
  const el = document.getElementById("form-box"); if (!el) return;
  el.innerHTML = `
    <div style="text-align:center">
      <h2 style="color:#2E7D32;">🔑 Admin – Liberações</h2>
      <p style="color:#555;font-size:14px;margin-top:6px">Use a <b>Busca rápida</b> para encontrar os alunos por CFC e cidade.</p>
      <div class="form-group" style="max-width:420px;margin:18px auto 10px">
        <label>Email do aluno</label>
        <input type="email" id="adm_email" placeholder="aluno@exemplo.com" autocapitalize="none" autocorrect="off" spellcheck="false" />
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:260px;margin:14px auto 0;">
        <button class="auth-btn" id="adm_buscar">Buscar</button>
        <button class="auth-btn auth-link" data-back="menu">Voltar</button>
      </div>
      <div id="adm_result" style="max-width:520px;margin:22px auto 0;text-align:left"></div>
    </div>`;
  document.getElementById("adm_buscar")?.addEventListener("click", async () => {
    const email = normalizeEmail((document.getElementById("adm_email")?.value || ""));
    if (!email) return;
    const box = document.getElementById("adm_result");
    box.innerHTML = `<p style="color:#2E7D32">Carregando...</p>`;
    const info = await buscarLiberacao(email);
    const plano = info?.plano || "free";
    const ate = info?.ate?.toDate ? info.ate.toDate() : null;
    const venc = ate ? ate.toLocaleDateString("pt-BR") : "—";
    box.innerHTML = `
      <div style="background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:14px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
        <div style="margin-bottom:10px"><strong>Aluno:</strong> ${email}</div>
        <div style="margin-bottom:10px"><strong>Plano atual:</strong> ${plano.toUpperCase()} ${plano==="pro" ? `(até ${venc})` : ""}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="auth-btn" onclick="liberarPro('${email}', 365)">✅ Liberar PRO por 1 ano</button>
          <button class="auth-btn" onclick="liberarPro('${email}', 30)">PRO por 30 dias</button>
          <button class="auth-btn" onclick="voltarFree('${email}')">⬅️ Voltar para FREE</button>
        </div>
        <div id="adm_msg" style="margin-top:12px;font-size:14px;"></div>
      </div>`;
  });
}
async function buscarLiberacao(email) {
  email = normalizeEmail(email);
  await ensureDb();
  if (!db) return null;
  const docNew = await db.collection("liberacoes").doc(emailDocId(email)).get();
  if (docNew.exists) return docNew.data();
  const docOld = await db.collection("liberacoes").doc(emailDocIdLegacy(email)).get();
  return docOld.exists ? docOld.data() : null;
}
async function liberarPro(email, dias=365) {
  await ensureDb();
  const msg = document.getElementById("adm_msg");
  if (!db) { if (msg) msg.textContent="Firestore indisponível"; return; }
  email = normalizeEmail(email);
  const now = new Date(); const ate = new Date(now.getTime()+dias*86400000);
  const idNew = emailDocId(email); const idLegacy = emailDocIdLegacy(email);
  const payloadLib = {
    email, plano:"pro", ativo:true,
    ate: firebase.firestore.Timestamp.fromDate(ate),
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    liberadoPor: getUserEmail(), metodo:"pix"
  };
  await db.collection("liberacoes").doc(idNew).set(payloadLib, { merge:true });
  if (idLegacy!==idNew) await db.collection("liberacoes").doc(idLegacy).set({ ...payloadLib, _migrado:true }, { merge:true });
  const payloadUser = { plano:"pro", ate: firebase.firestore.Timestamp.fromDate(ate), atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() };
  await db.collection("usuarios").doc(idNew).set(payloadUser, { merge:true });
  if (idLegacy!==idNew) await db.collection("usuarios").doc(idLegacy).set({ ...payloadUser, _migrado:true }, { merge:true });
  await db.collection("assinaturas").add({ email, plano:"pro", dias, quando: firebase.firestore.FieldValue.serverTimestamp(), por: getUserEmail(), metodo:"pix" });
  if (msg) { msg.style.color="#2E7D32"; msg.textContent = `PRO liberado até ${ate.toLocaleDateString("pt-BR")} ✅`; }
}
async function voltarFree(email) {
  await ensureDb();
  const msg = document.getElementById("adm_msg");
  if (!db) { if (msg) msg.textContent="Firestore indisponível"; return; }
  email = normalizeEmail(email);
  const idNew = emailDocId(email); const idLegacy = emailDocIdLegacy(email);
  const payloadLib = { email, plano:"free", ativo:true, ate:null, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(), alteradoPor: getUserEmail() };
  await db.collection("liberacoes").doc(idNew).set(payloadLib, { merge:true });
  if (idLegacy!==idNew) await db.collection("liberacoes").doc(idLegacy).set({ ...payloadLib, _migrado:true }, { merge:true });
  const payloadUser = { plano:"free", ate:null, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() };
  await db.collection("usuarios").doc(idNew).set(payloadUser, { merge:true });
  if (idLegacy!==idNew) await db.collection("usuarios").doc(idLegacy).set({ ...payloadUser, _migrado:true }, { merge:true });
  if (msg) { msg.style.color="#2E7D32"; msg.textContent = "Plano alterado para FREE. ✔️"; }
}

/*************************************************
 * ADMIN – LISTA DE ALUNOS POR CFC (NOME + CIDADE) + EXPORT
 *************************************************/
async function renderAdminAlunosCFC() {
  if (!window.__navigatingBack) pushRoute('admin-alunosCFC');
  localStorage.setItem('telaAtual','admin_alunos_cfc');
  if (!isAdmin()) { mostrarAlerta('Acesso negado.'); return; }
  const el = document.getElementById('form-box'); if (!el) return;
  el.innerHTML = `
    <div style="text-align:center">
      <h2 style="color:#2E7D32;">Admin - Alunos por CFC</h2>
      <p style="color:#555;font-size:14px;margin-top:6px">Use a <b>Busca rápida</b> para encontrar os alunos por CFC e cidade.</p>
      <div style="max-width:680px;margin:12px auto 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;">
        <input id="adm_busca" class="admin-input" placeholder="Busca rápida: digite parte do nome do CFC ou da cidade" style="flex:1;min-width:240px"/>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#334155">
          <input type="checkbox" id="adm_busca_uf" /> Considerar UF (ex.: MG)
        </label>
        <button class="auth-btn" id="adm_busca_limpar">Limpar</button>
      </div>
      <div id="adm_busca_result" style="max-width:820px;margin:12px auto 0;text-align:left"></div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:10px;">
        <button class="auth-btn auth-link" data-back="menu">Voltar</button>
      </div>
    </div>`;
  (function(){
    const debounce = (fn,ms=350)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms);} };
    const buscaInput = document.getElementById('adm_busca');
    const buscaBox = document.getElementById('adm_busca_result');
    const limparBtn = document.getElementById('adm_busca_limpar');
    // Remover checkbox UF e ajustar layout para coluna + botão Buscar
    try { const lab = document.getElementById('adm_busca_uf')?.parentElement; if (lab) lab.remove(); } catch {}
    try {
      const cont = buscaInput ? buscaInput.parentElement : null;
      if (cont) { cont.style.display='flex'; cont.style.flexDirection='column'; cont.style.gap='8px'; cont.style.alignItems='center'; cont.style.maxWidth='900px'; cont.style.margin='12px auto 0'; }
      if (buscaInput) { buscaInput.style.width='100%'; buscaInput.style.maxWidth='900px'; buscaInput.style.padding='14px 18px'; buscaInput.style.borderRadius='12px'; buscaInput.style.fontSize='16px'; buscaInput.placeholder='Buscar por CFC ou cidade'; }
      if (limparBtn && !document.getElementById('adm_busca_buscar')) {
        const btn = document.createElement('button');
        btn.className = 'auth-btn';
        btn.id = 'adm_busca_buscar';
        btn.textContent = 'Buscar';
        cont && cont.insertBefore(btn, limparBtn);
        btn.addEventListener('click', ()=> doBusca());
      }
    } catch {}
    if (limparBtn) limparBtn.onclick = ()=>{ if (buscaInput) buscaInput.value=''; if (buscaBox) buscaBox.innerHTML=''; };
    const renderBusca = (alunos, termo)=>{
      if (!buscaBox) return;
      if (!alunos.length) { buscaBox.innerHTML = `<p style="color:#555">Nenhum aluno encontrado para "<b>${termo}</b>".</p>`; return; }
      const total = alunos.length;
      const pro = alunos.filter(a => (a.plano||'free').toLowerCase()==='pro').length;
      const free = total - pro;
      const linhas = alunos.map(a=>{
        const pill = (String(a.plano||'').toLowerCase()==='pro') ? '<span class="pill pro">PRO</span>' : '<span class="pill free">FREE</span>';
        return `<tr>
          <td>${a.nome || '-'}</td>
          <td>${a.email || '-'}</td>
          <td>${pill}</td>
          <td>${a.cfcNome || '-'}</td>
          <td>${a.cfcCidade || '-'}</td>
          <td>${a.criadoEmFmt || '-'}</td>
        </tr>`;
      }).join('');
      buscaBox.innerHTML = `
        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:14px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
            <div>
              <div style="font-weight:700;color:#1f2937">Resultados da Busca rápida</div>
              <div style="color:#475569;font-size:13px;margin-top:4px">Termo: <b>${termo}</b> • Total: <b>${total}</b> • PRO: <b>${pro}</b> • FREE: <b>${free}</b></div>
            </div>
          </div>
          <div style="overflow:auto;margin-top:12px;max-height:60vh;border:1px solid #eee;border-radius:10px">
            <table class="table-desempenho">
              <thead><tr><th>Nome</th><th>Email</th><th>Plano</th><th>CFC</th><th>Cidade</th><th>Criado em</th></tr></thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>
        </div>`;
    };
    const doBusca = debounce(async ()=>{
      const termo = (buscaInput?.value || '').trim();
      if (!buscaBox) return;
      if (!termo) { buscaBox.innerHTML=''; return; }
      buscaBox.innerHTML = `<p style="color:#2E7D32">Buscando por "<b>${termo}</b>"...</p>`;
      try {
        const alunos = await buscarAlunosPorTermoCfc(termo, 120);
        renderBusca(alunos, termo);
      } catch (e) {
        console.warn('Busca rápida falhou:', e);
        buscaBox.innerHTML = `<p style="color:#C62828">Não foi possível buscar agora. Tente novamente.</p>`;
      }
    }, 350);
    if (buscaInput) buscaInput.addEventListener('input', doBusca);
  })();
}

async function fetchAllDesempenho(limit = 800) {
  await ensureDb();
  const itens = [];
  if (!db) return itens;
  try {
    let snap;
    try {
      snap = await db.collection('desempenhos').orderBy('data', 'desc').limit(limit).get();
    } catch (e) {
      snap = await db.collection('desempenhos').limit(limit).get();
    }
    snap.forEach(doc => itens.push(doc.data()));
    // Complementa com registros da coleção 'acessos' (histórico antigo)
    try {
      let snapA;
      try { snapA = await db.collection('acessos').orderBy('data','desc').limit(limit).get(); }
      catch { snapA = await db.collection('acessos').limit(limit).get(); }
      snapA.forEach(doc => {
        const d = doc.data() || {};
        itens.push({
          email: (d.email||'').toLowerCase(),
          prova: d.prova || d.simulado || '',
          acertos: Number(d.acertos||0),
          total: Number(d.totalQuestoes || d.total || 0),
          data: d.data || (d.quando && d.quando.toDate ? d.quando.toDate().toLocaleString('pt-BR') : '')
        });
      });
    } catch {}
  } catch {}
  // Ordena por data (string) desc como fallback
  try { itens.sort((a,b)=> String(b.data||'').localeCompare(String(a.data||''))); } catch {}
  return itens;
}

async function fetchAllUsuarios(limit = 1000){
  await ensureDb();
  const itens = [];
  if (!db) return itens;
  try {
    let snap = await db.collection('usuarios').limit(limit).get();
    snap.forEach(doc => {
      const d = doc.data() || {};
      itens.push({
        email: (d.email||'').toLowerCase(),
        nome: d.nome || '',
        plano: (d.plano||'').toLowerCase(),
        cfcNome: d.cfcNome || '',
        cfcCidade: d.cfcCidade || '',
        atualizadoEm: d.atualizadoEm || d.criadoEm || null
      });
    });
  } catch(e){ console.warn('[admin] falha ao buscar usuarios:', e); }
  itens.sort((a,b)=> String((b.atualizadoEm&&b.atualizadoEm.toDate?.()||b.atualizadoEm)||'').localeCompare(String((a.atualizadoEm&&a.atualizadoEm.toDate?.()||a.atualizadoEm)||'')) || a.email.localeCompare(b.email));
  return itens;
}

async function buscarUsuarioPorEmail(email){
  await ensureDb();
  if (!db) return null;
  email = normalizeEmail(email||'');
  const id = emailDocId(email);
  try {
    const doc = await db.collection('usuarios').doc(id).get();
    if (doc.exists) return doc.data();
  } catch {}
  try {
    const snap = await db.collection('usuarios').where('email','==',email).limit(1).get();
    let out=null; snap.forEach(d=> out=d.data()); return out;
  } catch {}
  return null;
}

function exportCsv(filename, rows, headers, opts) {
  try {
    const delim = (opts && opts.delim) || ';'; // Excel pt-BR costuma usar ;
    const lf = '\r\n'; // CRLF para compatibilidade com Windows/Excel
    const esc = v => '"' + String(v ?? '').replace(/"/g,'""') + '"';
    const fmtNum = v => {
      if (typeof v === 'number' && isFinite(v)) {
        const s = String(v);
        return delim === ';' ? s.replace('.', ',') : s; // vírgula decimal em BR
      }
      return null;
    };
    const lines = [];
    lines.push(headers.join(delim));
    for (const r of (rows || [])) {
      const cols = headers.map(h => {
        const v = r[h];
        const num = fmtNum(v);
        if (num !== null) return num; // sem aspas para manter número
        return esc(v);
      });
      lines.push(cols.join(delim));
    }
    const bom = '\ufeff'; // BOM para Excel reconhecer UTF-8
    const blob = new Blob([bom + lines.join(lf)], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) { console.warn('CSV export falhou:', e); }
}

function renderTableRaw(rows){
  const tbl = [`<table class=\"table-desempenho\">`,
    `<thead><tr><th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Data</th><th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Email</th><th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Prova</th><th style='text-align:right;padding:8px;border-bottom:1px solid #ddd'>Acertos</th></tr></thead>`,
    '<tbody>'];
  rows.forEach(r=>{
    tbl.push(`<tr>
      <td style='padding:8px;border-bottom:1px solid #f0f0f0'>${r.data||''}</td>
      <td style='padding:8px;border-bottom:1px solid #f0f0f0'>${r.email||''}</td>
      <td style='padding:8px;border-bottom:1px solid #f0f0f0'>${r.prova||''}</td>
      <td style='padding:8px;border-bottom:1px solid #f0f0f0;text-align:right'>${r.acertos??''}</td>
    </tr>`);
  });
  tbl.push('</tbody></table>');
  const el = document.getElementById('adTable'); if (el) el.innerHTML = tbl.join('');
}

function renderTableAgg(rows){
  const tbl = [`<table class=\"table-desempenho\">`,
    `<thead><tr><th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Email</th><th style='text-align:right;padding:8px;border-bottom:1px solid #ddd'>Qtd provas</th><th style='text-align:right;padding:8px;border-bottom:1px solid #ddd'>Média acertos</th><th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Última atividade</th></tr></thead>`,
    '<tbody>'];
  rows.forEach(r=>{
    tbl.push(`<tr>
      <td style='padding:8px;border-bottom:1px solid #f0f0f0'>${r.email||''}</td>
      <td style='padding:8px;border-bottom:1px solid #f0f0f0;text-align:right'>${r.total||0}</td>
      <td style='padding:8px;border-bottom:1px solid #f0f0f0;text-align:right'>${r.acertosMedio||''}</td>
      <td style='padding:8px;border-bottom:1px solid #f0f0f0'>${r.ultima||''}</td>
    </tr>`);
  });
  tbl.push('</tbody></table>');
  const el = document.getElementById('adTable'); if (el) el.innerHTML = tbl.join('');
}

async function renderAdminDesempenho(){
  if (!window.__navigatingBack) pushRoute('admin-desempenho');
  localStorage.setItem('telaAtual','admin_desempenho');
  if (!isAdmin()) { mostrarAlerta('Acesso negado.'); return; }
  const box = document.getElementById('form-box');
  if (!box) return;
  box.innerHTML = `
    <div style="text-align:center;">
      <h2 style="color:#2E7D32;">📊 Admin - Desempenho</h2>
      <div style="margin:14px 0;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <input id="adFilter" class="admin-input" placeholder="Filtrar por email" style="width:100%; max-width:900px; padding:14px 18px; border:1px solid #ddd; border-radius:12px; font-size:16px;" />
        
        <button class="auth-btn" id="adReload">Atualizar</button>
        <button class="auth-btn" id="adExport">Exportar CSV</button>
        <button class="auth-btn" id="adExportTxt">Exportar TXT</button>
        <button class="auth-btn auth-link" data-back="menu">Voltar</button>
      </div>
      <div id="adTable" style="overflow:auto; max-height:60vh; padding:0 8px; text-align:left;"></div>
    </div>`;
  animateCard();
  let cache = await fetchAllDesempenho(800);
  let alunosCache = await fetchAllUsuarios(1000);
  const TOTAL_PADRAO = (window.LEGMASTER_CONFIG && window.LEGMASTER_CONFIG.QUESTOES_TOTAL) || 30;
  function apply(){
    const ft = (document.getElementById('adFilter').value||'').toLowerCase();
    const mode = 'alunos';
    // Nova visão: em "Alunos" dividir em >=70% e <70% de assertividade
    if (mode === 'alunos') {
      const byEmail = new Map();
      (cache||[]).forEach(r=>{ const em=(r.email||'').toLowerCase(); if(!em) return; const list=byEmail.get(em)||[]; list.push(r); byEmail.set(em,list); });
      const aluByEmail = new Map((alunosCache||[]).map(a=> [String(a.email||'').toLowerCase(), a]));
      const rowsAll = Array.from(byEmail.entries()).map(([email,list])=>{
        const a = aluByEmail.get(email) || {};
        let sumRatio=0; const n=list.length;
        list.forEach(x=>{ const denom = Number(x.total||0) || TOTAL_PADRAO; const ac = Number(x.acertos)||0; sumRatio += ac/Math.max(1,denom); });
        const mediaPct = n ? Number(((sumRatio/n)*100).toFixed(1)) : 0;
        return {
          email,
          nome: a.nome || email.split('@')[0],
          plano: (a.plano||'').toLowerCase(),
          cfc: [a.cfcNome,a.cfcCidade].filter(Boolean).join(' / '),
          total: n,
          mediaPct,
          ultima: (list[0]?.data || '')
        };
      }).filter(r=> (r.email+' '+r.nome+' '+r.cfc+' '+r.plano).toLowerCase().includes(ft));

      const aprov = rowsAll.filter(r=> r.mediaPct >= 70).sort((a,b)=> b.mediaPct-a.mediaPct);
      const abaixo = rowsAll.filter(r=> r.mediaPct < 70).sort((a,b)=> b.mediaPct-a.mediaPct);

      function makeTable(rows, title){
        const head = `<div style=\"font-weight:700;margin:6px 0\">${title}</div>`+
          `<table class=\"table-desempenho\"><thead><tr>`+
          `<th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Email</th>`+
          `<th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Nome</th>`+
          `<th style='text-align:right;padding:8px;border-bottom:1px solid #ddd'>Media %</th>`+
          `<th style='text-align:right;padding:8px;border-bottom:1px solid #ddd'>Qtd</th>`+
          `<th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Ultima</th>`+
          `</tr></thead><tbody>`;
        const body = rows.map(r=>`<tr>`+
          `<td style='padding:8px;border-bottom:1px solid #f0f0f0'><a href='#' class='ad-email' data-email='${r.email}'>${r.email}</a></td>`+
          `<td style='padding:8px;border-bottom:1px solid #f0f0f0'>${r.nome}</td>`+
          `<td style='padding:8px;border-bottom:1px solid #f0f0f0;text-align:right'>${r.mediaPct}%</td>`+
          `<td style='padding:8px;border-bottom:1px solid #f0f0f0;text-align:right'>${r.total}</td>`+
          `<td style='padding:8px;border-bottom:1px solid #f0f0f0'>${r.ultima}</td>`+
          `</tr>`).join('');
        return head + body + '</tbody></table>';
      }

      const html = `<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:16px\">`+
        `<div>${makeTable(aprov,'Alunos com \u2265 70%')}</div>`+
        `<div>${makeTable(abaixo,'Alunos com < 70%')}</div>`+
        `</div>`;
      const el = document.getElementById('adTable'); if (el) el.innerHTML = html;

      // Exportação concisa (nome, email, qtd_provas, média) + TXT
      const concise = aprov.concat(abaixo).map(r=>({ nome: r.nome, email: r.email, qtd_provas: r.total, media: r.mediaPct }));
      const btn = document.getElementById('adExport'); if (btn) btn.onclick = () => exportCsv('alunos_resumo.csv', concise, ['nome','email','qtd_provas','media']);
      const btnT = document.getElementById('adExportTxt'); if (btnT) {
        const cols = [
          { key:'nome',  title:'Aluno',   w:24 },
          { key:'email', title:'Email',   w:28 },
          { key:'qtd_provas', title:'qtd_provas', w:12,  align:'right' },
          { key:'media', title:'Média %', w:9,  align:'right' }
        ];
        btnT.onclick = () => exportTxt('alunos_resumo.txt', concise, cols);
      }

      // clique para abrir detalhe
      document.querySelectorAll('.ad-email').forEach(a=>{ a.addEventListener('click', (ev)=>{ ev.preventDefault(); const em=a.getAttribute('data-email'); if (em) renderAdminDesempenhoAluno(em); }); });
      return;
    }
    if (mode === 'alunos'){
      // Apenas alunos com atividade (presentes nos registros)
      const byEmail = new Map();
      (cache||[]).forEach(r=>{ const em=(r.email||'').toLowerCase(); if(!em) return; const list=byEmail.get(em)||[]; list.push(r); byEmail.set(em,list); });
      const aluByEmail = new Map((alunosCache||[]).map(a=> [String(a.email||'').toLowerCase(), a]));
      const rowsAll = Array.from(byEmail.entries()).map(([email,list])=>{
        const a = aluByEmail.get(email) || {};
        const totalRegs = list.length;
        const somaAcertos = list.reduce((s,x)=> s + (Number(x.acertos)||0), 0);
        const mediaAcertos = (somaAcertos/Math.max(1,totalRegs)).toFixed(2);
        const ultima = list[0]?.data || '';
        return {
          email,
          nome: a.nome || email.split('@')[0],
          plano: (a.plano||'').toLowerCase(),
          cfc: [a.cfcNome,a.cfcCidade].filter(Boolean).join(' / '),
          total: totalRegs,
          acertosMedio: mediaAcertos,
          ultima
        };
      });
      const rows = rowsAll.filter(r=> (r.email+' '+r.nome+' '+r.cfc+' '+r.plano).toLowerCase().includes(ft))
        .sort((a,b)=> String(b.ultima||'').localeCompare(String(a.ultima||'')) || a.email.localeCompare(b.email));

      const tbl = [`<table class=\"table-pro\">`,
        `<thead><tr>
          <th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Email</th>
          <th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Nome</th>
          <th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Plano</th>
          <th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>CFC</th>
          <th style='text-align:right;padding:8px;border-bottom:1px solid #ddd'>Qtd provas</th>
          <th style='text-align:right;padding:8px;border-bottom:1px solid #ddd'>Média acertos</th>
          <th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Última</th>
        </tr></thead>`, '<tbody>'];
      rows.forEach(r=>{
        const pill = (String(r.plano||'').toLowerCase()==='pro') ? '<span class="pill pro">PRO</span>' : '<span class="pill free">FREE</span>';
        tbl.push(`<tr>
          <td><a href='#' class='ad-email' data-email='${r.email}'>${r.email}</a></td>
          <td>${r.nome}</td>
          <td>${pill}</td>
          <td>${r.cfc}</td>
          <td style='text-align:right'>${r.total}</td>
          <td style='text-align:right'>${r.acertosMedio}</td>
          <td>${r.ultima}</td>
        </tr>`);
      });
      tbl.push('</tbody></table>');
      const el = document.getElementById('adTable'); if (el) el.innerHTML = tbl.join('');
      // export
      const headers=['email','nome','plano','cfc','total','acertosMedio','ultima'];
      const btn = document.getElementById('adExport'); if (btn) btn.onclick = () => exportCsv('alunos_com_atividade.csv', rows, headers);
      // clicks
      document.querySelectorAll('.ad-email').forEach(a=>{
        a.addEventListener('click', (ev)=>{ ev.preventDefault(); const em = a.getAttribute('data-email'); if (em) renderAdminDesempenhoAluno(em); });
      });
    }
    else if (mode === 'agg'){
      const map = new Map();
      cache.forEach(r=>{ const email=(r.email||'').toLowerCase(); const list=map.get(email)||[]; list.push(r); map.set(email,list); });
      const arr = Array.from(map.entries()).map(([email,list])=>{
        const total = list.length;
        const soma = list.reduce((s,x)=> s + (Number(x.acertos)||0), 0);
        const ultima = list[0]?.data || '';
        return { email, total, acertosMedio: (soma/Math.max(1,total)).toFixed(2), ultima };
      }).filter(r=> r.email.includes(ft) || String(r.ultima).toLowerCase().includes(ft));
      renderTableAgg(arr);
      const headers = ['email','total','acertosMedio','ultima'];
      const btn = document.getElementById('adExport'); if (btn) btn.onclick = () => exportCsv('desempenho_agrupado.csv', arr, headers);
      const btnT = document.getElementById('adExportTxt'); if (btnT) {
        const cols = [
          { key:'email',       title:'Email',        w:28 },
          { key:'total',       title:'Qtd provas',   w:10, align:'right' },
          { key:'acertosMedio',title:'Média acertos',w:14, align:'right' },
          { key:'ultima',      title:'Última',       w:19 }
        ];
        btnT.onclick = () => exportTxt('desempenho_agrupado.txt', arr, cols);
      }
    } else {
      const rows = cache.map(r=>({ data: r.data||'', email: r.email||'', prova: r.prova||'', acertos: r.acertos })).filter(r=> (r.data+' '+r.email+' '+r.prova).toLowerCase().includes(ft));
      renderTableRaw(rows);
      const headers = ['data','email','prova','acertos'];
      const btn = document.getElementById('adExport'); if (btn) btn.onclick = () => exportCsv('desempenho_registros.csv', rows, headers);
      const btnT = document.getElementById('adExportTxt'); if (btnT) {
        const cols = [
          { key:'data',    title:'Data',    w:19 },
          { key:'email',   title:'Email',   w:28 },
          { key:'prova',   title:'Prova',   w:36 },
          { key:'acertos', title:'Acertos', w:8, align:'right' }
        ];
        btnT.onclick = () => exportTxt('desempenho_registros.txt', rows, cols);
      }
    }
  }
  const r = document.getElementById('adReload'); if (r) r.onclick = async ()=>{ cache = await fetchAllDesempenho(800); alunosCache = await fetchAllUsuarios(1000); apply(); };
  // Apenas um filtro por email; sem seletor de modo
  const f = document.getElementById('adFilter'); if (f) f.oninput = apply;
  apply();
}

async function renderAdminDesempenhoAluno(email){
  if (!window.__navigatingBack) pushRoute('admin-desempenho-aluno', { email: normalizeEmail(email||'') });
  localStorage.setItem('telaAtual','admin_desempenho_aluno');
  if (!isAdmin()) { mostrarAlerta('Acesso negado.'); return; }
  email = normalizeEmail(email||'');
  const box = document.getElementById('form-box'); if (!box) return;
  const perfil = await buscarUsuarioPorEmail(email);
  const nomeAluno = (perfil && (perfil.nome || perfil.nomeCompleto)) || (email.split('@')[0]) || '';
  const dados = await buscarDesempenhoFirestore(email);
  const TOTAL_PADRAO = (window.LEGMASTER_CONFIG && window.LEGMASTER_CONFIG.QUESTOES_TOTAL) || 30;
  const rows = (dados||[]).map(d=>{
    const total = Number(d.total || TOTAL_PADRAO) || TOTAL_PADRAO;
    const ac = Number(d.acertos)||0;
    const pct = ((ac/Math.max(1,total))*100).toFixed(0)+'%';
    return { nome: nomeAluno, email, data:d.data||'', prova:d.prova||'', acertos: ac, total, pct };
  });
  const media = rows.length ? (rows.reduce((s,x)=> s + (x.acertos/x.total), 0)/rows.length*100).toFixed(1)+'%' : '—';
  box.innerHTML = `
    <div style="text-align:center;">
      <h2 style="color:#2E7D32;">📈 Desempenho do aluno</h2>
      <p style="margin:4px 0 12px 0;color:#333"><b>${nomeAluno}</b> • <span>${email}</span> • Média: <b>${media}</b></p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:8px">
        <button class="auth-btn" id="adExportAluno">Exportar CSV</button>
        <button class="auth-btn" id="adExportAlunoTxt">Exportar TXT</button>
        <button class="auth-btn auth-link" data-back="admin-desempenho">Voltar</button>
      </div>
      <div style="overflow:auto; max-height:60vh; padding:0 8px; text-align:left;">
        <table class="table-desempenho">
          <thead><tr>
            <th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Aluno</th>
            <th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Email</th>
            <th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Data</th>
            <th style='text-align:left;padding:8px;border-bottom:1px solid #ddd'>Prova</th>
            <th style='text-align:right;padding:8px;border-bottom:1px solid #ddd'>Acertos</th>
            <th style='text-align:right;padding:8px;border-bottom:1px solid #ddd'>Total</th>
            <th style='text-align:right;padding:8px;border-bottom:1px solid #ddd'>Assertividade</th>
          </tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>`<tr>
              <td style='padding:8px;border-bottom:1px solid #f0f0f0'>${r.nome}</td>
              <td style='padding:8px;border-bottom:1px solid #f0f0f0'>${r.email}</td>
              <td style='padding:8px;border-bottom:1px solid #f0f0f0'>${r.data}</td>
              <td style='padding:8px;border-bottom:1px solid #f0f0f0'>${r.prova}</td>
              <td style='padding:8px;border-bottom:1px solid #f0f0f0;text-align:right'>${r.acertos}</td>
              <td style='padding:8px;border-bottom:1px solid #f0f0f0;text-align:right'>${r.total}</td>
              <td style='padding:8px;border-bottom:1px solid #f0f0f0;text-align:right'>${r.pct}</td>
            </tr>`).join('') : `<tr><td colspan="5" style='padding:12px;color:#666;text-align:center'>Nenhum registro encontrado para este aluno.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  animateCard();
  const headers=['nome','email','data','prova','acertos','total','pct'];
  const btn = document.getElementById('adExportAluno'); if (btn) btn.onclick = () => exportCsv(`desempenho_${email.replace(/[@.]/g,'_')}.csv`, rows, headers);
  const cols = [
    { key:'nome', title:'Aluno', w:24 },
    { key:'email', title:'Email', w:28 },
    { key:'data', title:'Data', w:19 },
    { key:'prova', title:'Prova', w:40 },
    { key:'acertos', title:'Acertos', w:8, align:'right' },
    { key:'total', title:'Total', w:6, align:'right' },
    { key:'pct', title:'Assertividade', w:13, align:'right' }
  ];
  const btn2 = document.getElementById('adExportAlunoTxt'); if (btn2) btn2.onclick = () => exportTxt(`desempenho_${email.replace(/[@.]/g,'_')}.txt`, rows, cols);
}

function exportTxt(filename, rows, cols){
  try {
    const col = Array.isArray(cols) && cols.length ? cols : [
      { key:'data', title:'Data', w:19 },
      { key:'prova', title:'Prova', w:40 },
      { key:'acertos', title:'Acertos', w:8, align:'right' },
      { key:'total', title:'Total', w:6, align:'right' },
      { key:'pct', title:'Assertividade', w:13, align:'right' }
    ];
    const pad = (s,w,align)=>{
      s = String(s==null?'':s);
      if (s.length > w) s = s.slice(0,w);
      const sp = ' '.repeat(Math.max(0, w - s.length));
      return align==='right' ? sp + s : s + sp;
    };
    const lines = [];
    lines.push(col.map(c=> pad(c.title, c.w, c.align)).join('  '));
    lines.push(col.map(c=> '-'.repeat(c.w)).join('  '));
    rows.forEach(r=>{
      lines.push(col.map(c=> pad(r[c.key] ?? '', c.w, c.align)).join('  '));
    });
    const blob = new Blob([lines.join('\n')+'\n'], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) { console.warn('TXT export falhou:', e); }
}

// Garante que o botão apareça no menu do Admin sem alterar o template original
(function attachAdminPerfButton(){
  const original = renderMenuPrincipal;
  if (typeof original === 'function') {
    window.renderMenuPrincipal = function(){
      original.apply(this, arguments);
      try {
        if (isAdmin()) {
          const container = document.querySelector('#form-box > div > div');
          if (container && !container.querySelector('#btn-admin-perf')) {
            const btn = document.createElement('button');
            btn.id = 'btn-admin-perf';
            btn.className = 'auth-btn';
            btn.style.fontSize = '20px';
            btn.style.padding = '20px';
            btn.textContent = '📊 Acompanhar Desempenho';
            btn.onclick = () => renderAdminDesempenho();
            const last = container.lastElementChild; // geralmente o botão "Sair"
            if (last) container.insertBefore(btn, last); else container.appendChild(btn);
          }
        }
      } catch {}
    };
  }
})();

/** Busca alunos na coleção "usuarios" por Nome + Cidade (prioriza cfcSlug ==, com fallback). */
async function buscarAlunosPorCfc(cfcNome, cfcCidade) {
  await ensureDb();
  if (!db) return [];
  const cfcSlug = buildCfcSlug(cfcNome, cfcCidade);
  const out = [];

  // Tentativa 1: cfcSlug ==
  try {
    const snap = await db.collection("usuarios").where("cfcSlug","==",cfcSlug).get();
    snap.forEach(doc => out.push(_fmtUsuario(doc)));
    if (out.length) return out;
  } catch (e) {
    console.warn("Falha na consulta por cfcSlug. Tentando fallback.", e);
  }

  // Fallback: nomeSlug == e filtra cidadeSlug no cliente
  try {
    const nomeSlug = slugify(toTitleCase(cfcNome));
    const cidadeSlug = slugify(toTitleCase(cfcCidade));
    const snap = await db.collection("usuarios").where("nomeSlug","==",nomeSlug).get();
    snap.forEach(doc => {
      const data = _fmtUsuario(doc);
      if (data.cidadeSlug === cidadeSlug) out.push(data);
    });
  } catch (e) {
    console.error("Erro no fallback buscarAlunosPorCfc:", e);
  }
  return out;
}

function _fmtUsuario(doc) {
  const d = doc.data() || {};
  let criadoEmFmt = "—";
  try {
    if (d.criadoEm?.toDate) criadoEmFmt = d.criadoEm.toDate().toLocaleString("pt-BR");
    else if (d.atualizadoEm?.toDate) criadoEmFmt = d.atualizadoEm.toDate().toLocaleString("pt-BR");
  } catch {}
  return {
    id: doc.id,
    nome: d.nome || "",
    email: normalizeEmail(d.email || ""),
    plano: (d.plano || "free").toLowerCase(),
    cfcNome: d.cfcNome || "",
    cfcCidade: d.cfcCidade || "",
    nomeSlug: d.nomeSlug || "",
    cidadeSlug: d.cidadeSlug || "",
    cfcSlug: d.cfcSlug || "",
    criadoEmFmt
  };
}

/** Exporta a lista atual em CSV. */
function exportarCsvCfc(cfcNome, cfcCidade, alunos) {
  const header = ["Nome","Email","Plano","CriadoEm"];
  const rows = alunos.map(a => [
    safeCsv(a.nome), safeCsv(a.email), safeCsv((a.plano||"free").toUpperCase()),
    safeCsv(a.criadoEmFmt||"")
  ].join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `alunos_${slugify(cfcNome)}__${slugify(cfcCidade)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 1500);
}
function safeCsv(v){ const s = String(v??""); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }

/** Exporta a lista atual em TXT (colunas alinhadas com largura fixa). */
function exportarTxtCfc(cfcNome, cfcCidade, alunos) {
  const headers = ["Nome","Email","Plano","Criado em"];
  const dataRows = alunos.map(a => [
    String(a.nome||""),
    String(a.email||""),
    String((a.plano||"free").toUpperCase()),
    String(a.criadoEmFmt||"")
  ]);

  // calcula larguras
  const widths = headers.map((h, i) => Math.max(
    h.length,
    ...dataRows.map(r => (r[i]||"").length)
  ));

  const pad = (text, w) => {
    const s = String(text||"");
    const diff = w - s.length;
    return diff > 0 ? s + " ".repeat(diff) : s;
  };

  const sep = "  ";
  const headerLine = headers.map((h,i)=> pad(h, widths[i])).join(sep);
  const rulerLine  = widths.map(w => "-".repeat(w)).join(sep);
  const bodyLines  = dataRows.map(r => r.map((c,i)=> pad(c, widths[i])).join(sep));

  const txt = [headerLine, rulerLine, ...bodyLines].join("\n");
  const blob = new Blob([txt], { type:"text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `alunos_${slugify(cfcNome)}__${slugify(cfcCidade)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 1500);
}

/*************************************************
 * PEQUENA ANIMAÇÃO
 *************************************************/
function animateCard() {
  const el = document.getElementById("form-box");
  if (!el) return;
  el.style.willChange = "transform, opacity";
  el.style.transition = "transform .25s ease, opacity .25s ease";
  el.style.opacity = "0.001";
  el.style.transform = "translateY(6px)";
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
    try { updateTouchDesktopExperience(); } catch {}
  });
}

/*************************************************
 * BOOT
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  try { updateTouchDesktopExperience(); } catch {}
  const salvo = JSON.parse(localStorage.getItem("usuarioLogado") || "{}");
  const forcedRoute = consumeForcedRouteState();
  window.__disablePush = true;
  if (salvo?.email) {
    window.currentUser.email = normalizeEmail(salvo.email);
    window.currentUser.nome  = salvo.nome || salvo.email?.split("@")[0] || "Aluno";
    const initialRoute =
      normalizeRouteState(
        forcedRoute ||
        parseRouteFromHash() ||
        loadLastRouteState() ||
        { screen: 'menu', params: null }
      ) || { screen: 'menu', params: null };
    renderFromState(initialRoute);
    window.__disablePush = false;
    pushRoute(initialRoute.screen, initialRoute.params || null, true);
  } else {
    renderIntro();
    window.__disablePush = false;
    pushRoute('intro', null, true);
  }
  try {
    auth.onAuthStateChanged((user) => {
      if (user) {
        const s = JSON.parse(localStorage.getItem("usuarioLogado") || "{}");
        const emailNorm = normalizeEmail(user.email);
        window.currentUser = { email: emailNorm, nome: s.nome || "Aluno" };
        renderMenuPrincipal();
      }
    });
  } catch {}
});

/*************************************************
 * SERVICE WORKER
 *************************************************/
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register('./service-worker.js').then(reg => {
    console.log("✅ Service Worker registrado:", reg);
    reg.onupdatefound = () => {
      const installingWorker = reg.installing;
      installingWorker.onstatechange = () => {
        if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
          console.log("🚀 Nova versão disponível! Atualizando...");
          window.location.reload();
        }
      };
    };
  }).catch(err => console.error("❌ Falha ao registrar Service Worker:", err));
}


function getAuthSafe() {
  try {
    return auth || window.firebaseAuth || null;
  } catch {
    return null;
  }
}

// Busca por termo único com tolerância (consulta por prefixo em slugs + filtro no cliente)
async function buscarAlunosPorTermoCfc(termo, limite=100) {
  await ensureDb();
  if (!db) return [];
  const norm = slugify(toTitleCase(termo || ''));
  const allTokens = Array.from(new Set(norm.split('-').filter(t => t))); const UFS = new Set(['ac','al','am','ap','ba','ce','df','es','go','ma','mg','ms','mt','pa','pb','pe','pi','pr','rj','rn','ro','rr','rs','sc','se','sp','to']); const ufTokens = allTokens.filter(t => t.length===2 && UFS.has(t)); const reqTokens = allTokens.filter(t => t.length>=3 && !UFS.has(t)); const tokens = reqTokens.length ? reqTokens : allTokens.filter(t=> t.length>=3); if (!tokens.length) tokens.push(...allTokens.filter(t=>t.length>=2));
  if (!tokens.length) return [];
  const results = new Map();
  for (const tok of tokens) {
    const end = tok + '\uf8ff';
    for (const field of ['nomeSlug','cidadeSlug','cfcSlug']) {
      try {
        const snap = await db.collection('usuarios').orderBy(field).startAt(tok).endAt(end).limit(limite).get();
        snap.forEach(doc => { const d = _fmtUsuario(doc); results.set(d.email, d); });
      } catch (e) { /* índice pode faltar; ignora este campo */ }
    }
  }
  const arr = Array.from(results.values());
  // Filtro de tolerância leve (mantém se algum token estiver "perto" de alguma parte do slug)
  function __ed(a,b){ a=String(a||""); b=String(b||""); const m=a.length,n=b.length; const dp=Array.from({length:m+1},(_,i)=>Array(n+1).fill(0)); for(let i=0;i<=m;i++) dp[i][0]=i; for(let j=0;j<=n;j++) dp[0][j]=j; for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){ const cost=a[i-1]===b[j-1]?0:1; dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);} return dp[m][n]; }
  const filtered = arr.filter(u=>{ const parts = `${u.nomeSlug||''} ${u.cidadeSlug||''} ${u.cfcSlug||''}`.split(/\s|-/).filter(Boolean); return tokens.every(t=>{ if (parts.some(p=> p.includes(t))) return true; if (t.length>=4 && parts.some(p=> __ed(p.slice(0,t.length), t) <= 1)) return true; return false; }); });
  // Ranking por pontuação
  const ranked = filtered.map(u=>{
    const ns = String(u.nomeSlug||'');
    const cs = String(u.cidadeSlug||'');
    const cf = String(u.cfcSlug||'');
    let score = 0;
    for (const t of tokens) {
      if (ns === t) score += 120; if (cs === t) score += 110; if (cf === t) score += 100;
      if (ns.startsWith(t)) score += 80; if (cs.startsWith(t)) score += 70; if (cf.startsWith(t)) score += 60;
      if (ns.includes(t)) score += 40; if (cs.includes(t)) score += 30; if (cf.includes(t)) score += 20;
      if (t.length>=4) { if (__ed(ns.slice(0,t.length), t) <= 1) score += 18; if (__ed(cs.slice(0,t.length), t) <= 1) score += 16; }
    }
    return { u: u, score };
  }).sort((A,B)=>{ if (B.score!==A.score) return B.score-A.score; return (A.u.nome||'').localeCompare(B.u.nome||''); }).map(x=> x.u);
  // Ordenação antiga (fallback) a seguir caso precise manter
  /*
  filtered.sort((a,b)=>{
    const sA = [a.nomeSlug, a.cidadeSlug, a.cfcSlug].join(' ');
    const sB = [b.nomeSlug, b.cidadeSlug, b.cfcSlug].join(' ');
    const hasA = tokens.some(t=> sA.includes(t));
    const hasB = tokens.some(t=> sB.includes(t));
    if (hasA !== hasB) return hasA ? -1 : 1;
    const startsA = tokens.some(t=> sA.startsWith(t));
    const startsB = tokens.some(t=> sB.startsWith(t));
    if (startsA !== startsB) return startsA ? -1 : 1;
    return (a.nome||'').localeCompare(b.nome||'');
  });
  */
  return ranked;
}

function hasApiSession() {
  const api = getApiClient();
  return Boolean(api && typeof api.getStoredToken === 'function' && api.getStoredToken());
}

async function fetchResultadosViaApi(email) {
  const api = getApiClient();
  if (!api || typeof api.getResultados !== 'function') return null;
  try {
    const resposta = await api.getResultados({ alunoId: email });
    const items = (resposta && Array.isArray(resposta.items)) ? resposta.items : (Array.isArray(resposta) ? resposta : []);
    return items.map((item) => ({
      prova: item.prova || 'Simulado',
      acertos: item.acertos ?? 0,
      total: item.total ?? null,
      data: item.data ? formatarDataBrasil(item.data) : ''
    }));
  } catch (err) {
    console.warn('[api] getResultados falhou, usando Firestore', err);
    return null;
  }
}

function formatarDataBrasil(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value || '';
  try { return date.toLocaleString('pt-BR'); }
  catch { return value || ''; }
}

function getApiClient() {
  return window.LegmasterApi || null;
}



