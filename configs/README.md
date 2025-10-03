# Configuracoes por autoescola

Este diretorio guarda os arquivos especificos de cada cliente. Você pode manter uma pasta por autoescola com as chaves e variáveis que não devem ser versionadas.

## Fluxo recomendado (multi-cliente)

1. Liste cada domínio em `frontend/js/config.js` (a seção `STATIC_CLIENTS` já contém um exemplo). Ajuste o `FIREBASE_CONFIG` e o `API_BASE` correspondente.
2. Copie `backend/config/tenants.config.example.json` para `backend/config/tenants.config.json` e preencha com os dados reais de cada autoescola.
3. Configure a variável `TENANTS_CONFIG_PATH=backend/config/tenants.config.json` (ou exporte o JSON diretamente via `TENANTS_CONFIG_JSON`).
4. Faça o deploy único do frontend/backend: o frontend envia o cabeçalho `X-Leg-Client` automaticamente. Integrações externas devem incluir o mesmo identificador.

## Fluxo legado (um cliente por build)

1. Copie o template:
   ```bash
   cp -r configs/template configs/autoescola-nome
   ```
2. Edite `configs/autoescola-nome/frontend/config.js` e substitua os valores do `FIREBASE_CONFIG` pelo projeto Firebase da autoescola.
3. Preencha `configs/autoescola-nome/backend/.env` com as credenciais do Firebase Admin e os dominios (`FRONTEND_URL`, `BASE_URL`).
4. Aplique a configuracao no projeto antes do deploy ou teste local:
   ```bash
   node scripts/apply-config.js autoescola-nome
   ```
5. Faca deploy do frontend (Netlify) e do backend usando os arquivos copiados.

## Boas praticas

- Gere uma chave de servico do Firebase por autoescola e guarde apenas neste
  diretorio (nao comite os `.env` ou `tenants.config.json`).
- Ajuste o `API_BASE` no `config.js` para apontar para a instancia do backend.
- Apos copiar/adicionar os arquivos, confira os valores diretamente em
  `frontend/js/config.js` e nas variaveis de ambiente antes de subir para producao.

## Estrutura

```
configs/
  template/
    frontend/config.js   # modelo de configuracao do cliente
    backend/.env         # modelo de variaveis do backend
  autoescola-nome/
    frontend/config.js   # valores reais do cliente (uso opcional)
    backend/.env
```

Use o script `scripts/apply-config.js` apenas se optar pelo fluxo antigo de um cliente por vez.
