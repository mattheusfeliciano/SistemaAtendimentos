# Dash Educacao

Aplicacao web para registro, acompanhamento e analise de atendimentos/atividades da Secretaria de Educacao, Ciencia e Tecnologia.

## Visao geral

Arquitetura atual:

- frontend em React + Vite + TypeScript
- backend em Node.js + Express
- banco PostgreSQL
- autenticacao por sessao com cookie HttpOnly
- controle de permissao por perfil (`admin`, `gestor`, `operador`)

## Funcionalidades principais

- login seguro com sessao no servidor
- cadastro de usuario com senha forte e aprovacao por gestao/admin
- dashboard com indicadores e graficos de atendimentos
- registro de atendimento com campos multi-selecao
- historico com filtros, visualizacao, edicao e exclusao por permissao
- padronizacao de cadastro (departamento, local, atividade, responsavel)
- painel de usuarios por perfil
- relatorios (HTML/PDF)
- auditoria de acoes sensiveis

## Modulo de Atividades (fase atual)

Ja implementado nesta fase:

- programacao de atividades com prazo (`due_date`) e prioridade
- status de fluxo: `pendente`, `em_andamento`, `atrasada`, `concluida`
- painel de atividades para usuarios (com alteracao de status)
- comentarios por atividade (chat de acompanhamento)
- notificacoes quando o secretario cria atividade, envia mensagem por equipe ou atualiza vinculos
- criacao de equipes e distribuicao por equipe
- painel geral do secretario com metricas e acompanhamento por usuario
- metas por atividade (`goal_target`) com destaque visual (trofeu)
- ajuste de prazo por atividade (`due_date`)
- historico de atividades concluidas
- acompanhamento por usuario com fluxo + chat
- edicao e exclusao de equipe
- edicao e exclusao de mensagem no chat (somente autor)
- criptografia de mensagens do chat em repouso (AES-256-GCM)
- painel de notificacoes no topo (ler + responder notificacao de atividade)
- calendario com modal por dia e campo de observacoes
- filtros avancados no painel de atividades (equipe, status, periodo)
- busca global com atalho `Ctrl+K` (usuario, equipe, atividade, notificacao, atendimento)
- templates de atividade (aplicar no planejamento e salvar modelo)
- visao kanban com drag-and-drop de status
- base de tempo real com SSE para notificacoes (`/api/events`)
- chat de atividade com atualizacao em tempo real via SSE (`task:comment`)
- suporte a chave versionada para criptografia do chat (`COMMENT_CRYPTO_KEYS`)
- rotacao/expurgo automaticos de chave do chat com KMS logico (`COMMENT_KMS_*`)

## Estrutura do projeto

- `App.tsx`: navegacao principal e tabs do sistema
- `components/TasksPanel.tsx`: painel de atividades do usuario + notificacoes
- `components/SecretaryPanel.tsx`: painel do secretario (equipes, atividades, metricas)
- `components/AtendimentoForm.tsx`: formulario de novo registro/edicao
- `components/AdminUsersPanel.tsx`: gestao de usuarios
- `components/CatalogOptionsPanel.tsx`: padronizacao de cadastro
- `pages/LoginPage.tsx`: tela de login
- `pages/RegisterPage.tsx`: tela de cadastro
- `services/api.ts`: cliente HTTP do frontend (inclui tasks/teams/notifications)
- `backend/server.js`: API Express
- `backend/db.js`: conexao e inicializacao do PostgreSQL
- `docker-compose.yml`: stack local (web + api + postgres)

## Banco de dados (novas tabelas)

- `teams`
- `team_members`
- `tasks`
- `task_assignees`
- `task_comments`
- `notifications`

## Requisitos

Para executar com Docker:

- Docker Desktop instalado
- portas livres: `3000`, `3001`, `5432`

Para executar sem Docker:

- Node.js 20+
- PostgreSQL 16+ (ou versao compativel)

## Variaveis de ambiente

Use `.env.example` como base.

Backend:

- `API_PORT` (padrao `3001`)
- `FRONTEND_URL` (padrao `http://localhost:3000`)
- `SESSION_HOURS`
- `ENFORCE_HTTPS`
- `TRUST_PROXY`
- `DATABASE_URL` ou (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`)
- `PGSSLMODE=require` (opcional)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (opcional)
- `COMMENT_KMS_ENABLED` (`true/false`, padrao `false`)
- `COMMENT_KMS_MASTER_KEY` (segredo master para embrulhar chaves de dados)
- `COMMENT_CRYPTO_ROTATION_DAYS` (padrao `30`)
- `COMMENT_CRYPTO_RETENTION_DAYS` (padrao `120`)
- `COMMENT_CRYPTO_MAINTENANCE_MS` (padrao `21600000`, 6h)

Frontend:

- `VITE_API_BASE_URL` (opcional)
- `VITE_DEV_PROXY_TARGET` (usado no Docker)

## Subir com Docker (recomendado)

1. Instale dependencias:

```bash
npm install
```

2. Suba os servicos:

```bash
npm run docker:up
```

3. Acesse:

- frontend: `http://localhost:3000`
- health API: `http://localhost:3001/api/health`

## Rodar sem Docker

1. Copie `.env.example` para `.env` e ajuste.
2. Garanta que o PostgreSQL esteja ativo.
3. Instale dependencias:

```bash
npm install
```

4. Execute frontend + API:

```bash
npm run dev:full
```

## Scripts

- `npm run dev`: frontend (Vite)
- `npm run api`: backend
- `npm run dev:full`: frontend + backend em paralelo
- `npm run build`: build de producao do frontend
- `npm run preview`: preview do build
- `npm run test:e2e`: executa suite E2E (Playwright)
- `npm run backup:db`: gera backup SQL (ambiente Docker local)
- `npm run restore:db -- -InputFile arquivo.sql`: restaura backup SQL (ambiente Docker local)
- `npm run docker:up`
- `npm run docker:down`
- `npm run docker:down:purge`

Para executar E2E localmente na primeira vez:

- `npx playwright install`

## Permissoes por perfil

### Operador

- registrar/editar atendimentos
- consultar dashboard, historico e relatorios
- acessar painel de atividades (status + comentarios)
- visualizar/editar padronizacao

### Gestor

- tudo que operador faz
- excluir atendimentos e itens da padronizacao
- gerenciar usuarios operadores
- acessar painel do secretario (equipes, atividades, metricas)

### Admin

- acesso total
- gestao completa de usuarios e permissoes
- painel do secretario com controle total

## Endpoints principais

Autenticacao:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Usuarios:

- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id/approve`
- `PATCH /api/users/:id/deactivate`
- `PATCH /api/users/:id/activate`
- `PATCH /api/users/:id`
- `PATCH /api/users/:id/access`
- `DELETE /api/users/:id`

Atendimentos:

- `GET /api/atendimentos`
- `GET /api/atendimentos/:id`
- `POST /api/atendimentos`
- `PUT /api/atendimentos/:id`
- `DELETE /api/atendimentos/:id`

Equipes:

- `GET /api/teams`
- `POST /api/teams`
- `PATCH /api/teams/:id`
- `PUT /api/teams/:id/members`
- `DELETE /api/teams/:id`
- `POST /api/teams/:id/message`

Atividades:

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id/status`
- `PATCH /api/tasks/:id/due-date`
- `GET /api/tasks/:id/comments`
- `POST /api/tasks/:id/comments`
- `PATCH /api/tasks/:taskId/comments/:commentId`
- `DELETE /api/tasks/:taskId/comments/:commentId`
- `GET /api/tasks/:id/attachments`
- `POST /api/tasks/:id/attachments`
- `POST /api/tasks/:id/attachments/upload`
- `GET /api/tasks-metrics/secretary`
- `POST /api/tasks/:id/typing`
- `POST /api/tasks/:id/presence/ping`
- `GET /api/task-templates`
- `POST /api/task-templates`
- `PATCH /api/task-templates/:id`
- `DELETE /api/task-templates/:id`

Notificacoes:

- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`
- `GET /api/events` (SSE de eventos em tempo real)

Operacao/observabilidade:

- `GET /api/ops/metrics` (admin)

## Plano de evolucao (guia de proximos passos)
Status de implementacao continua:

### Fase 1 (concluida)

- [x] base de atividades, equipes, notificacoes e painel do secretario
- [x] status completo (`pendente`, `em_andamento`, `atrasada`, `concluida`)
- [x] historico de concluidas
- [x] ajuste de prazo
- [x] CRUD de equipes (admin + secretario)
- [x] chat com edicao/exclusao pelo autor

### Fase 2 (em implementacao)

- [x] filtros avancados no painel de atividades (por equipe, status, periodo)
- [x] timeline visual do fluxo (modal da atividade + acompanhamento)
- [x] SLA por tipo de atividade (selecao no planejamento + exibicao)
- [x] anexos por atividade (documentos) na UI (lista + adicionar por URL)
- [x] upload nativo de arquivo (arquivo local no chat da atividade)

### Fase 3 (planejado)

- [x] chat em tempo real por atividade (base SSE)
- [x] mencoes `@usuario` (notificação por menção)
- [x] notificacoes em tempo real (base SSE no backend + listener frontend)
- [x] indicadores de digitacao/online por atividade

### Fase 4 (planejado)

- [x] metas por equipe com progresso mensal (base inicial no painel da secretaria)
- [x] ranking de entrega e qualidade (score operacional inicial)
- [x] relatorio gerencial de produtividade (visao executiva inicial)

### Seguranca (status)

- [x] autenticacao por sessao com cookie `HttpOnly`
- [x] hardening basico (helmet, CORS, CSRF guard, rate limit)
- [x] trilha de auditoria para operacoes sensiveis
- [x] criptografia de mensagens de chat em repouso (AES-256-GCM)
- [x] suporte a rotacao versionada de chave criptografica (`COMMENT_CRYPTO_KEYS`)
- [x] rotacao automatica com KMS logico e expurgo de chave antiga
- [x] observabilidade basica da API (metricas + ultimos erros)
- [ ] monitoramento/alertas avancados (stack externa)

### UX/produtividade (status)

- [x] painel de notificacoes clicavel no topo
- [x] responder notificacao direto no dropdown
- [x] fechamento do dropdown por clique fora + `Esc`
- [x] calendario com modal por dia e observacoes
- [x] busca global (atalho `Ctrl+K`)
- [x] templates de atividade
- [x] visao Kanban
- [x] suite E2E base para login + Ctrl+K + Kanban + notificacoes
- [x] polish visual da tela de Equipe (tipografia, espaçamento e microinterações)

### O que pode ter (futuro recomendado)

- assistente de preenchimento inteligente para atividades recorrentes
- recomendacao automatica de prazo com base em historico/SLA
- exportacao consolidada de operacao (CSV/PDF) por periodo/equipe
- painel mobile dedicado para responsaveis operacionais

## Observacoes

- Se alterar backend, reinicie a API (`docker compose restart api`).
- `npm run docker:down:purge` remove volume do banco e apaga dados locais.
