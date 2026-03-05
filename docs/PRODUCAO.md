# Go-Live Produção

Este guia cobre o deploy seguro do sistema em produção com rollback rápido.

## 1) Pré-requisitos

- Docker e Docker Compose no servidor.
- DNS configurado para frontend e API.
- Proxy reverso com TLS (Nginx/Traefik/Caddy) na frente da API.
- PostgreSQL com backup automatizado.

## 2) Variáveis obrigatórias

Crie `.env.production` baseado em `.env.production.example`.

Obrigatórias para liberar boot seguro:

- `NODE_ENV=production`
- `ENFORCE_HTTPS=true`
- `ROOT_ADMIN_PASSWORD` forte e exclusiva
- `SECRETARY_PASSWORD` forte e exclusiva
- `FRONTEND_URL` com domínio HTTPS real
- `APP_BASE_URL` com domínio HTTPS real
- `DATABASE_URL` de produção

Recomendadas:

- `TRUST_PROXY=true` (se houver proxy reverso)
- `PGSSLMODE=require` (quando suportado)
- `SMTP_*` configurado para notificações reais
- `COMMENT_KMS_ENABLED=true` + `COMMENT_KMS_MASTER_KEY` forte

## 3) Checklist técnico de go-live

1. Build limpo local:
   - `npm.cmd run build`
2. Testes mínimos:
   - `npm.cmd run test:authz`
3. Revisar variáveis:
   - sem senhas padrão
   - HTTPS forçado
4. Backup pré-deploy:
   - `npm.cmd run backup:db`
5. Deploy:
   - `docker compose --env-file .env.production up -d --build`
6. Smoke test:
   - `GET /api/health`
   - login com `ROOT_ADMIN_EMAIL`
   - criar/editar/excluir atendimento
7. Monitorar logs:
   - `docker compose logs -f api`
8. Confirmar alertas/telemetria.

## 4) Checklist funcional pós-deploy

- Login/Logout funcionando.
- Permissões por perfil funcionando:
  - `superadmin`
  - `admin`
  - `gestor`
  - `operador`
- Cadastro e padronização funcionando no fluxo único.
- Notificações e atividades funcionando.
- Rascunho do atendimento preservando estado ao trocar de tela.

## 5) Rollback rápido

Se houver erro crítico após deploy:

1. Restaurar versão anterior da imagem/container.
2. Subir stack anterior:
   - `docker compose --env-file .env.production up -d`
3. Se necessário, restaurar backup do banco:
   - `npm.cmd run restore:db -- -InputFile <backup.sql>`

## 6) Hardening imediato recomendado

- Limitar acesso externo ao banco (somente rede interna).
- Expor apenas portas necessárias (80/443 no proxy).
- Política de rotação de senha para contas administrativas.
- Política de backup diário + retenção (7/30/90 dias).
- Teste mensal de restore.
