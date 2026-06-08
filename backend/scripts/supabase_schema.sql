-- Schema escritorio_digital — espelho dos saves do painel JP (one-way sync
-- a partir do SQLite local backend/visualizer.db). RLS desativado no MVP.
--
-- Criado em 2026-06-07 (Pedro + Claudius).

CREATE SCHEMA IF NOT EXISTS escritorio_digital;

-- ─── sessions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escritorio_digital.sessions (
  id              text PRIMARY KEY,
  label           text,
  display_name    text,
  project_name    text,
  project_root    text,
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL,
  status          text NOT NULL,
  floor_id        text,
  room_id         text,
  team_name       text,
  teammate_name   text,
  is_lead         boolean NOT NULL DEFAULT false,
  is_pinned       boolean NOT NULL DEFAULT false,
  archived_at     timestamptz,
  floor_pinned    boolean NOT NULL DEFAULT false,
  terminal_pid    integer,
  last_cwd        text,
  event_count     integer NOT NULL DEFAULT 0,
  last_event_type text,
  synced_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_updated_at_desc_idx
  ON escritorio_digital.sessions (updated_at DESC);
CREATE INDEX IF NOT EXISTS sessions_floor_id_idx
  ON escritorio_digital.sessions (floor_id);
CREATE INDEX IF NOT EXISTS sessions_status_idx
  ON escritorio_digital.sessions (status);
CREATE INDEX IF NOT EXISTS sessions_pinned_idx
  ON escritorio_digital.sessions (is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS sessions_archived_idx
  ON escritorio_digital.sessions (archived_at) WHERE archived_at IS NOT NULL;

-- ─── user_preferences ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escritorio_digital.user_preferences (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL,
  synced_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── tasks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escritorio_digital.tasks (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id    text NOT NULL REFERENCES escritorio_digital.sessions(id) ON DELETE CASCADE,
  task_id       text NOT NULL,
  content       text NOT NULL,
  status        text NOT NULL,
  active_form   text,
  description   text,
  blocks        text,
  blocked_by    text,
  owner         text,
  metadata_json text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL,
  synced_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_session_id_idx
  ON escritorio_digital.tasks (session_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx
  ON escritorio_digital.tasks (status);

-- ─── Confirma ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM escritorio_digital.sessions)         AS sessions_count,
  (SELECT count(*) FROM escritorio_digital.user_preferences) AS preferences_count,
  (SELECT count(*) FROM escritorio_digital.tasks)            AS tasks_count;
