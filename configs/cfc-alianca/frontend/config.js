// Configuração específica para o frontend da CFC Aliança.
// Gere o build/publicação usando este arquivo como `frontend/js/config.js`.

window.LEGMASTER_CONFIG = Object.assign(
  {
    FREE_UNLOCK_INDEX: 1,
    QUESTOES_TOTAL: 30,
    API_BASE: "", // ajuste se houver backend dedicado (ex.: https://api.simuladosalianca.com.br)
    FIREBASE_CONFIG: {
      apiKey: "AIzaSyDOCh8GHwrtNlXB4lTrFemrmRWnM8TyXnk",
      authDomain: "simuladosalianca.firebaseapp.com",
      projectId: "simuladosalianca",
      storageBucket: "simuladosalianca.firebasestorage.app",
      messagingSenderId: "827605156491",
      appId: "1:827605156491:web:bbc7d3b21d0af0e2c1ca8e",
      measurementId: "G-KD97GW4W9S"
    }
  },
  window.LEGMASTER_CONFIG || {}
);
