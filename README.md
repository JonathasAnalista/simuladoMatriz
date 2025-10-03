# Simulado Agente â€“ Estrutura Profissional
# antes de fazer o deploy  rodar esse comando para copiar o arquivo do novo cfc na frontend # e backend principal pra depois fazer o deploy --> node scripts/apply-config.js cfc-nome
Este repositÃ³rio mantÃ©m o frontend estÃ¡tico da plataforma (`frontend/`) e a API Node.js que integra com Firebase e Mercado Pago (`backend/`). ConteÃºdos antigos (Android/TWA/scripts manuais) estÃ£o arquivados em `legacy/`.

```
simuladosdetranoficial_2/
|-- frontend/           # Site: HTML, CSS, JS, PWA, simulados
|-- backend/            # API Express + Firebase Admin (cron de limpeza incluso)
|   `-- src/            # App Express modularizado (config, jobs, rotas Mercado Pago)
`-- legacy/             # Materiais antigos (APK, gradle, scripts, backend TS)
    `-- server-ts/      # Backend TypeScript arquivado
```

---

## Frontend (`frontend/`)

- `index.html` â€“ shell principal (carrega tema, scripts, integraÃ§Ãµes)..
- `assets/css/style.css` â€“ estilos globais do app.
- `assets/js/script.js` â€“ lÃ³gica principal (auth, provas, UI)..
- `assets/js/api.js` â€“ cliente para a API (`window.LegmasterApi`).
- `js/config.js` â€“ configuraÃ§Ã£o Firebase (usa `window.LEGMASTER_CONFIG`).
- `js/firebase.js` â€“ inicializaÃ§Ã£o segura do Firebase no cliente.
- `js/gate.js` â€“ guard que controla acesso FREE/PRO dos simulados..
- `service-worker.js`, `manifest.json`, `icons/` â€“ PWA e Ã­cones.
- `pagamento/{sucesso,pendente,erro}/` â€“ retornos do checkout Mercado Pago.
- `simulados/` â€“ pastas dos simulados com seus `index.html`, `script.js`, `style.css` e assets.
- `manifest-checksum.txt` â€“ hash usado na publicaÃ§Ã£o para invalidar caches.

### Executar localmente

Ã‰ um site estÃ¡tico: abra `frontend/index.html` ou sirva com seu static server preferido.

### Ajustes rÃ¡pidos

- Atualize `frontend/js/config.js` com as chaves do novo projeto Firebase.
- Ajuste `window.__LEGMASTER_API_BASE__` em `frontend/index.html` para apontar para a API hospedada.
- Para alteraÃ§Ãµes visuais, edite `assets/css/style.css` (agora centralizado).

---

## Backend (`backend/`)

API Express (Node 18+) usada para Mercado Pago e para aplicar benefÃ­cios PRO no Firestore. O cÃ³digo foi modularizado em `src/` (config, rotas Mercado Pago, jobs de limpeza).

### Setup

1. `cd backend`
2. Copie `.env.example` para `.env` e preencha com os valores reais.
3. `npm install`
4. `npm start`

### Cron automÃ¡tico

O job `backend/src/jobs/cleanupOldAccesses.js` usa `node-cron` para executar `cleanupOldAccesses()` todo dia Ã s 03:00 e manter apenas os acessos dos Ãºltimos dois dias. O agendamento Ã© iniciado em `backend/src/server.js`.

### Endpoints principais

- `POST /api/mp/create-preference`
- `POST /api/mp/pix/create`
- `GET  /api/mp/payment/:id`
- `POST /api/mp/webhook`
- Health check: `GET /` e `GET /debug/env`

### Deploy

- Render, Railway, Fly.io, Cloud Run, etc.
- Configure as mesmas variÃ¡veis de ambiente do `.env`.
- Certifique-se de rodar com Node >= 18.

## Backend TypeScript legado (`legacy/server-ts/`)

Projeto mais antigo (TS) com mÃºltiplos controllers/services. Mantido arquivado em `legacy/server-ts/`. Antes de usar novamente:

1. `cd legacy/server-ts`
2. `npm install`
3. Configure `.env` com as variÃ¡veis esperadas.
4. `npm run dev` ou `npm run build && npm run start`

Essa pasta estÃ¡ fora do fluxo atual (fica em `legacy/`) e sÃ³ deve ser usada para consultas ou migraÃ§Ãµes.


---

## Legacy (`legacy/`)

- APK assinada antiga, projeto Android (`app/`, `gradle*`, `build/`).
- `server-ts/` (backend TypeScript arquivado) e demais scripts auxiliares.
- `chave-legmaster.json`, `limparAcessos.js`, `twa-manifest.json`, `apply_changes.ps1`, etc.

Esses arquivos ficam guardados, mas nÃ£o fazem parte do fluxo atual. `legacy/` estÃ¡ no `.gitignore` para evitar commits acidentais.


---

## Multi-cliente (autoescolas)

- `frontend/js/config.js` agora escolhe o Firebase pelo hostname. Adicione cada domínio em `STATIC_CLIENTS` (ou injete via `window.LEGMASTER_CLIENTS`) com o `FIREBASE_CONFIG` e `API_BASE` corretos.
- Para o backend, descreva cada autoescola em um JSON (ex.: `backend/config/tenants.config.json`) e informe `TENANTS_CONFIG_PATH` ou `TENANTS_CONFIG_JSON`. O arquivo exemplo `backend/config/tenants.config.example.json` mostra o formato esperado.
- O frontend já envia o cabeçalho `X-Leg-Client` automaticamente nas chamadas. Integrações externas devem incluir esse identificador para que o backend selecione o tenant certo.
- Se preferir o fluxo antigo (build separado por cliente), o script `node scripts/apply-config.js nome-do-cliente` continua disponível.

Veja `configs/README.md` para o passo a passo detalhado.

---

## Fluxo de trabalho recomendado

1. **Frontend**
   - Ajuste configs (`config.js`, `index.html`).
   - Gere build estÃ¡tico (Netlify/Vercel aceita a pasta `frontend/`).
2. **Backend**
   - Configure `.env`.
   - Execute `npm start` localmente ou faÃ§a deploy.
3. **Firebase**
   - Console â†’ Authentication: habilitar Email/Senha, adicionar domÃ­nios.
   - Console â†’ Firestore: publicar regras permitindo gravaÃ§Ã£o (auth != null) e adicionar Ã­ndices se necessÃ¡rio.
4. **MigraÃ§Ãµes**
   - Se precisar migrar dados de outro projeto, exporte/import em Firestore.

---

## Boas prÃ¡ticas em vigor

- Uso defensivo do Firebase client (verifica `window.LEGMASTER_CONFIG`).
- Guards no `gtag` para evitar exceÃ§Ãµes.
- Service Worker simples que nÃ£o atrapalha atualizaÃ§Ãµes.
- CrÃ©ditos e toasts acessÃ­veis (`aria-*`).
- LÃ³gica de simulados agrupada em `assets/js/script.js` (ainda que extensa, centralizada).

---

## Ideias futuras (sem quebrar o existente)

- Migrar simulados para dados (JSON) para reduzir duplicaÃ§Ã£o.
- Adotar bundler (Vite/Parcel) para modularizar JS/CSS.
- Simplificar fluxo de deploy com scripts (`npm run deploy:frontend`, etc.).
- Melhorar regras do Firestore para granularidade por coleÃ§Ã£o.

---

## Checklist rÃ¡pido de QA

- [ ] Login/cadastro Firebase funcionando.
- [ ] Salvamento de simulado aparece no Firestore (`desempenhos`).
- [ ] Webhook Mercado Pago ativa plano PRO corretamente.
- [ ] PÃ¡ginas de retorno do pagamento respondem com o layout esperado.
- [ ] Service Worker registra sem erros no console.

---

Qualquer ajuste adicional (scripts de build, automaÃ§Ãµes CI/CD, limpeza de simulados) Ã© sÃ³ solicitar.
