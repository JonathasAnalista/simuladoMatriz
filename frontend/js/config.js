// Configuracao multi-cliente para ProjetoMatrizSimulados.
// Define o mapa de hosts -> Firebase/API e injeta os valores em window.LEGMASTER_CONFIG.
(function bootstrapLegmasterConfig() {
  const DEFAULTS = {
    FREE_UNLOCK_INDEX: 1,
    QUESTOES_TOTAL: 30,
    API_BASE: ""
  };

  // const DEFAULT_FIREBASE_CONFIG = {
  //   apiKey: "AIzaSyCSiHm8E1IqZ8SvdkZ2HkfGnOrXI2NMwx8",
  //   authDomain: "simuladosagente.firebaseapp.com",
  //   projectId: "simuladosagente",
  //   storageBucket: "simuladosagente.firebasestorage.app",
  //   messagingSenderId: "861070968741",
  //   appId: "1:861070968741:web:ed5e25721b38da558f8a4c",
  //   measurementId: "G-5T6V3PWDTQ"
  // };

  const HOST_PRESETS = {
    // "localhost:5173": {
    //   id: "dev-local",
    //   label: "Desenvolvimento Local",
    //   apiBase: "http://localhost:3333",
    //   firebaseConfig: DEFAULT_FIREBASE_CONFIG
    // },
    // "127.0.0.1:5173": {
    //   id: "dev-local",
    //   label: "Loopback Local",
    //   apiBase: "http://localhost:3333",
    //   firebaseConfig: DEFAULT_FIREBASE_CONFIG
    // },
    // "simuladosdetranoficial.netlify.app": {
    //   id: "simulados-oficial",
    //   label: "Simulados Detran Oficial",
    //   apiBase: "",
    //   firebaseConfig: DEFAULT_FIREBASE_CONFIG
    // },
    // "projetomatrizsimulados.netlify.app": {
    //   id: "matriz-producao",
    //   label: "Projeto Matriz Simulados",
    //   apiBase: "",
    //   firebaseConfig: DEFAULT_FIREBASE_CONFIG
    // },
    // "simulados-agente.netlify.app": {
    //   id: "simulado-agente",
    //   label: "Simulado Agente",
    //   apiBase: "",
    //   firebaseConfig: DEFAULT_FIREBASE_CONFIG
    // },
    "simuladostransitar.com.br": {
      id: "simulado-transitar",
      label: "CFC Transitar",
      apiBase: "",
      firebaseConfig: {
        apiKey: "AIzaSyD1_my9oD0zr-MPklc7DbzeO_sPwcc_39Q",
        authDomain: "simuladostransitar.firebaseapp.com",
        projectId: "simuladostransitar",
        storageBucket: "simuladostransitar.firebasestorage.app",
        messagingSenderId: "702137808325",
        appId: "1:702137808325:web:ffaadc3f479ce223ba07ac",
        measurementId: "G-FMXRNTQ6F1"
      }
    },
    "www.simuladostransitar.com.br": {
      id: "simulado-transitar",
      label: "CFC Transitar",
      apiBase: "",
      firebaseConfig: {
        apiKey: "AIzaSyD1_my9oD0zr-MPklc7DbzeO_sPwcc_39Q",
        authDomain: "simuladostransitar.firebaseapp.com",
        projectId: "simuladostransitar",
        storageBucket: "simuladostransitar.firebasestorage.app",
        messagingSenderId: "702137808325",
        appId: "1:702137808325:web:ffaadc3f479ce223ba07ac",
        measurementId: "G-FMXRNTQ6F1"
      }
    }
  };

  function normalizeHost(host) {
    return String(host || "").trim().toLowerCase();
  }

  function toHostEntries(raw) {
    if (!raw) return {};
    if (Array.isArray(raw)) {
      return raw.reduce((acc, entry) => {
        if (!entry || !entry.hosts || !entry.firebaseConfig) return acc;
        const hosts = Array.isArray(entry.hosts) ? entry.hosts : [entry.hosts];
        hosts.forEach((host) => {
          const normalized = normalizeHost(host);
          if (!normalized) return;
          acc[normalized] = {
            id: entry.id || null,
            label: entry.label || null,
            apiBase: entry.apiBase || entry.API_BASE || "",
            firebaseConfig: entry.firebaseConfig || entry.FIREBASE_CONFIG || null
          };
        });
        return acc;
      }, {});
    }
    if (raw instanceof Map) {
      const result = {};
      raw.forEach((value, key) => {
        result[normalizeHost(key)] = value;
      });
      return result;
    }
    if (typeof raw === "object") {
      return Object.keys(raw).reduce((acc, key) => {
        acc[normalizeHost(key)] = raw[key];
        return acc;
      }, {});
    }
    return {};
  }

  const externalClients = toHostEntries(window.LEGMASTER_CLIENTS);
  const extraClients = toHostEntries(window.LEGMASTER_ADDITIONAL_CLIENTS);
  const hostClients = { ...HOST_PRESETS, ...externalClients, ...extraClients };

  const fallbackClient = window.LEGMASTER_DEFAULT_CLIENT || HOST_PRESETS["projetomatrizsimulados.netlify.app"];
  const host = normalizeHost(window.location.host || window.location.hostname);
  const resolved = hostClients[host] || fallbackClient;

  if (!resolved || !resolved.firebaseConfig) {
    console.warn(`[config.js] Nenhuma configuracao encontrada para ${host}. Usando fallback padrao.`);
  }

  const finalConfig = Object.assign({}, DEFAULTS, {
    API_BASE: resolved?.apiBase || DEFAULTS.API_BASE,
    FIREBASE_CONFIG: resolved?.firebaseConfig || DEFAULT_FIREBASE_CONFIG
  }, window.LEGMASTER_CONFIG_OVERRIDE || {});

  window.LEGMASTER_CLIENTS_MAP = hostClients;
  window.LEGMASTER_DEFAULT_CLIENT = fallbackClient;
  window.LEGMASTER_CONFIG = finalConfig;
  window.LEGMASTER_CLIENT_ID = resolved?.id || null;
  window.LegmasterClientLabel = resolved?.label || null;

  if (finalConfig.API_BASE && typeof finalConfig.API_BASE === "string" && finalConfig.API_BASE.trim()) {
    window.__LEGMASTER_API_BASE__ = finalConfig.API_BASE.trim();
  }
})();
