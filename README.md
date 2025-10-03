# ProjetoMatrizSimulados

ProjetoMatrizSimulados centraliza o portal de simulados online e a API que integra pagamentos, controle de acesso e configuracoes multi cliente. O objetivo e viabilizar uma unica base de codigo para autoescolas, reduzindo manutencao e padronizando deploys.

## Visao geral
- Frontend estatico (HTML, CSS e JavaScript) com suporte PWA e experiencias de simulados.
- Backend Node.js (Express + Firebase Admin + Mercado Pago) para autenticar usuarios, processar pagamentos e sincronizar beneficios PRO.
- Suporte a multiplos clientes e autoescolas via resolucao dinamica de configuracoes.
- Artefatos legados preservados em `legacy/` para consultas e migracoes controladas.

## Estrutura do repositorio
```
ProjetoMatrizSimulados/
|-- frontend/     # Aplicacao web estatica: site, assets, PWA e simulados
|-- backend/      # API Express modular (config, rotas Mercado Pago, jobs)
|-- configs/      # Modelos e automacoes para multi cliente
|-- scripts/      # Scripts utilitarios (ex.: apply-config)
`-- legacy/       # Codigo e artefatos antigos (Android, backend TS, etc.)
```

## Requisitos principais
- Node.js 18 ou superior (backend e scripts).
- Conta Firebase (Authentication + Firestore) por cliente.
- Conta Mercado Pago com credenciais de integracao.
- Servidor HTTP estatico opcional para rodar `frontend/` localmente.

## Como rodar

**Frontend**
- Site e estatico: abra `frontend/index.html` direto no navegador ou sirva com seu servidor HTTP preferido (http-server, serve, nginx e similares).
- Ajuste `frontend/js/config.js` com `firebaseConfig` e `apiBase` corretos antes de publicar.

**Backend**
```bash
cd backend
cp .env.example .env    # preencha com credenciais reais
npm install
npm start               # inicia em modo producao
npm run start:dev       # opcional: usa nodemon
```
O servidor escuta na porta definida em `PORT` (padrao 3333) e agenda o cron de limpeza de acessos (`scheduleAccessCleanup`).

## Configuracao multi cliente

Fluxo recomendado (deploy unico para varias autoescolas):
1. Edite `frontend/js/config.js` e adicione cada dominio em `STATIC_CLIENTS`, informando `firebaseConfig` e `apiBase`.
2. Copie `backend/config/tenants.config.example.json` para `backend/config/tenants.config.json` e registre os tenants com as chaves exigidas.
3. Defina `TENANTS_CONFIG_PATH=backend/config/tenants.config.json` (ou use `TENANTS_CONFIG_JSON`).
4. Certifique-se de que o frontend envie o header `X-Leg-Client` (isso ja ocorre por padrao) ou injete `window.LEGMASTER_CLIENTS` quando precisar configurar via script.
5. Integre sistemas externos com o mesmo identificador para que o backend resolva o tenant corretamente.

Fluxo legado (um cliente por build): execute `node scripts/apply-config.js nome-do-cliente` para copiar arquivos de `configs/template` para `frontend/` e `backend/`. Esse caminho continua disponivel para clientes isolados.

## Deploy
- Frontend: publique a pasta `frontend/` em provedores estaticos (Netlify, Vercel, Cloudflare Pages, S3 + CloudFront, etc.). Atualize `manifest-checksum.txt` quando precisar invalidar caches.
- Backend: deploy em Render, Railway, Fly.io, Cloud Run ou infraestrutura equivalente. Replique as variaveis do `.env` e garanta Node >= 18.
- Firebase: habilite Authentication (Email/Senha) e configure regras do Firestore aceitando usuarios autenticados. Inclua indices se o painel solicitar.

## Scripts uteis
- `node scripts/apply-config.js <cliente>`: aplica configuracoes legadas de um cliente especifico.
- `npm start` / `npm run start:dev` (backend): inicia a API com ou sem hot reload.
- Limpeza diaria automatica: `backend/src/jobs/cleanupOldAccesses.js` remove acessos antigos todos os dias as 03h00.

## Checklist rapido de QA
- [ ] Login e cadastro Firebase funcionando.
- [ ] Vencimentos registram em `desempenhos` no Firestore.
- [ ] Webhooks do Mercado Pago liberam o acesso PRO esperado.
- [ ] Paginas `pagamento/sucesso`, `pagamento/pendente` e `pagamento/erro` exibem layout correto.
- [ ] Service Worker instala e atualiza sem erros no console.
- [ ] Multi cliente responde com os tenants certos (teste com cada dominio/header).

## Recursos legados
Tudo que nao faz parte do fluxo atual permanece em `legacy/` (APK Android, backend TypeScript, scripts auxiliares). Consulte apenas para migracoes historicas e evite commitar alteracoes dessa pasta.

---

Precisa de outros ajustes ou automatizacoes? Abra uma issue ou solicite melhorias complementares.
