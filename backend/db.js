import pg from 'pg';

const { Pool } = pg;

const {
  DATABASE_URL,
  PGHOST = 'localhost',
  PGPORT = '5432',
  PGDATABASE = 'dash_educacao',
  PGUSER = 'postgres',
  PGPASSWORD = '',
  PGSSLMODE,
} = process.env;

const ssl =
  PGSSLMODE === 'require'
    ? {
        rejectUnauthorized: false,
      }
    : undefined;

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl,
    })
  : new Pool({
      host: PGHOST,
      port: Number(PGPORT),
      database: PGDATABASE,
      user: PGUSER,
      password: PGPASSWORD,
      ssl,
    });

export async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log opcional para monitorar performance em desenvolvimento
    // console.log('Query executada:', { text, duration, rows: res.rowCount });

    return res;
  } catch (error) {
    console.error('\n================ DATABASE ERROR ================');
    console.error('\u274C Erro na base de dados');
    console.error('Message:', error.message);
    console.error('Query:', text);
    console.error('Params:', '[omitted]');
    console.error('Stack:', error.stack);
    console.error('================================================\n');
    throw error; // Repassa o erro para que a API possa enviar o status 500
  }
}

export async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      full_name TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operador',
      department TEXT NOT NULL DEFAULT '',
      phone TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      email_verified_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      approved_by UUID,
      failed_login_attempts INT NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'operador';`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by UUID;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version TEXT;`);

  await query(`
    UPDATE users
    SET
      full_name = COALESCE(NULLIF(full_name, ''), name),
      role = COALESCE(NULLIF(role, ''), 'operador'),
      department = COALESCE(department, ''),
      failed_login_attempts = COALESCE(failed_login_attempts, 0)
    WHERE full_name IS NULL OR full_name = '' OR role IS NULL OR role = '' OR department IS NULL OR failed_login_attempts IS NULL;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);

  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      ip_address TEXT,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS teams (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS team_members (
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      added_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (team_id, user_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      due_date DATE NOT NULL,
      priority TEXT NOT NULL DEFAULT 'media',
      status TEXT NOT NULL DEFAULT 'pendente',
      task_type TEXT NOT NULL DEFAULT 'administrativo',
      goal_target TEXT,
      team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS task_assignees (
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (task_id, user_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id UUID PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      edited_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;`);

  await query(`
    CREATE TABLE IF NOT EXISTS task_sla_profiles (
      type TEXT PRIMARY KEY,
      sla_days INT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id UUID PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS task_events (
      id UUID PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'info',
      related_entity TEXT,
      related_id TEXT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS task_templates (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'media',
      task_type TEXT NOT NULL DEFAULT 'administrativo',
      goal_target TEXT,
      default_due_days INT NOT NULL DEFAULT 7,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS comment_crypto_keys (
      id TEXT PRIMARY KEY,
      wrapped_key TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      retired_at TIMESTAMPTZ,
      purge_after TIMESTAMPTZ,
      purged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'administrativo';`);

  await query(`
    INSERT INTO task_sla_profiles (type, sla_days, is_active)
    VALUES
      ('administrativo', 7, TRUE),
      ('pedagogico', 10, TRUE),
      ('planejamento', 15, TRUE),
      ('urgente', 2, TRUE)
    ON CONFLICT (type) DO NOTHING;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS atendimentos (
      id UUID PRIMARY KEY,
      data DATE NOT NULL,
      turno TEXT NOT NULL,
      departamento TEXT NOT NULL,
      atividade TEXT NOT NULL,
      responsavel TEXT NOT NULL,
      local TEXT NOT NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;`);
  await query(`ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;`);
  await query(`ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;`);

  await query(`
    CREATE TABLE IF NOT EXISTS catalog_options (
      id UUID PRIMARY KEY,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (type, normalized_value)
    );
  `);

  const { rows } = await query('SELECT COUNT(*)::INT AS total FROM atendimentos');
  if (rows[0].total > 0) return;

  await query(
    `
      INSERT INTO atendimentos (id, data, turno, departamento, atividade, responsavel, local, created_at)
      VALUES
        ($1, CURRENT_DATE, $2, $3, $4, $5, $6, NOW()),
        ($7, CURRENT_DATE, $8, $9, $10, $11, $12, NOW()),
        ($13, CURRENT_DATE, $14, $15, $16, $17, $18, NOW())
    `,
    [
      '00000000-0000-0000-0000-000000000001',
      'Manhã',
      'TI',
      'Manutencao de Servidor',
      'Ricardo Silva',
      'Data Center',
      '00000000-0000-0000-0000-000000000002',
      'Tarde',
      'RH',
      'Entrevista de Candidato',
      'Maria Oliveira',
      'Sala de Reuniao 1',
      '00000000-0000-0000-0000-000000000003',
      'Noite',
      'Seguranca',
      'Ronda Perimetral',
      'Joao Souza',
      'Patio Externo',
    ]
  );
}

export default pool;

// Fechamento de Conexao (Graceful Shutdown)
// Garante que o Pool de conexoes seja encerrado quando o processo terminar
process.on('SIGTERM', () => {
  pool.end(() => {
    console.log('Pool de conexoes PostgreSQL encerrado.');
  });
});

process.on('SIGINT', () => {
  pool.end(() => {
    console.log('Pool de conexoes PostgreSQL encerrado manualmente.');
    process.exit(0);
  });
});
