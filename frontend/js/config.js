// Multi-cliente: escolhe configurações Firebase/API por hostname.
// Adicione novas entradas em STATIC_CLIENTS para cada domínio atendido.

(function configureLegmasterMultiClient() {
  const DEFAULTS = {
    FREE_UNLOCK_INDEX: 1,
    QUESTOES_TOTAL: 30,
    API_BASE: ''
  };

  const STATIC_CLIENTS = [
    // {
    //   id: 'cfc-aliannnca',
    //   label: 'CFC Aliança',
    //   isDefault: false,
    //   hosts: [
    //     'www.simuladostransiitar.com.br',
    //     'simuladostransiitar.com.br'
    //   ],
    //   config: {
    //     API_BASE: '', // ajuste se houver backend dedicado (ex.: https://api.simuladosalianca.com.br)
    //     FIREBASE_CONFIG: {
    //       apiKey: 'AIzaSyDOCh8GHwrtNlXB4lTrFemrmRWnM8TyXnk',
    //       authDomain: 'simuladosalianca.firebaseapp.com',
    //       projectId: 'simuladosalianca',
    //       storageBucket: 'simuladosalianca.firebasestorage.app',
    //       messagingSenderId: '827605156491',
    //       appId: '1:827605156491:web:bbc7d3b21d0af0e2c1ca8e',
    //       measurementId: 'G-KD97GW4W9S'
    //     }
    //   }
    // },
    // Exemplo de novo cliente: copie este bloco, ajuste IDs/domínios e remova `disabled`.
    {
      id: 'simulado-agente',
      label: 'cfc agente',
      disabled: false,
      hosts: ['simulados-agente.netlify.app'],
      config: {
        API_BASE: '',
        FIREBASE_CONFIG: {
          apiKey: 'AIzaSyCSiHm8E1IqZ8SvdkZ2HkfGnOrXI2NMwx8',
          authDomain: 'simuladosagente.firebaseapp.com',
          projectId: 'simuladosagente',
          storageBucket: 'simuladosagente.firebasestorage.app',
          messagingSenderId: '861070968741',
          appId: '1:861070968741:web:ed5e25721b38da558f8a4c',
          measurementId: 'G-5T6V3PWDTQ'
        }
      }
    },

    {
      id: 'simulado-transitar',
      label: 'cfc transitar',
      disabled: false,
      hosts: ['www.simuladostransitar.com.br', 'simuladostransitar.com.br'],
      config: {
        API_BASE: '',
        FIREBASE_CONFIG: {
          apiKey: 'AIzaSyD1_my9oD0zr-MPklc7DbzeO_sPwcc_39Q',
          authDomain: 'simuladostransitar.firebaseapp.com',
          projectId: 'simuladostransitar',
          storageBucket: 'simuladostransitar.firebasestorage.app',
          messagingSenderId: '702137808325',
          appId: '1:702137808325:web:ffaadc3f479ce223ba07ac',
          measurementId: 'G-FMXRNTQ6F1'
        }
      }
    }
  ];

  const externalPresets = Array.isArray(window.LEGMASTER_CLIENTS)
    ? window.LEGMASTER_CLIENTS
    : [];

  const clients = [
    ...externalPresets,
    ...STATIC_CLIENTS.filter((client) => !client.disabled)
  ];

  const host = (window.location.hostname || '').toLowerCase();

  const matchByHost = (client) =>
    Array.isArray(client.hosts) &&
    client.hosts.some((entry) => typeof entry === 'string' && entry.toLowerCase() === host);

  const resolvedClient =
    clients.find(matchByHost) ||
    clients.find((client) => client.isDefault) ||
    null;

  if (!resolvedClient) {
    console.warn('[config.js] Nenhum cliente configurado para o host', host, '- usando valores padrão.');
  }

  const finalConfig = Object.assign(
    {},
    DEFAULTS,
    resolvedClient?.config || {},
    window.LEGMASTER_CONFIG || {}
  );

  window.LEGMASTER_CONFIG = finalConfig;
  window.LEGMASTER_CLIENT_ID = resolvedClient?.id || null;

  if (typeof finalConfig.API_BASE === 'string' && finalConfig.API_BASE.trim()) {
    window.__LEGMASTER_API_BASE__ = finalConfig.API_BASE.trim();
  }
})();
