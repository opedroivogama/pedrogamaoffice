-- v2: schema escritorio_online (que já está exposto no PostgREST do self-hosted).
CREATE SCHEMA IF NOT EXISTS escritorio_online;

CREATE TABLE IF NOT EXISTS escritorio_online.sessions (
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

CREATE INDEX IF NOT EXISTS sessions_updated_at_desc_idx ON escritorio_online.sessions (updated_at DESC);
CREATE INDEX IF NOT EXISTS sessions_floor_id_idx ON escritorio_online.sessions (floor_id);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON escritorio_online.sessions (status);
CREATE INDEX IF NOT EXISTS sessions_pinned_idx ON escritorio_online.sessions (is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS sessions_archived_idx ON escritorio_online.sessions (archived_at) WHERE archived_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS escritorio_online.user_preferences (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL,
  synced_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escritorio_online.tasks (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id    text NOT NULL REFERENCES escritorio_online.sessions(id) ON DELETE CASCADE,
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
  synced_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, task_id)
);

CREATE INDEX IF NOT EXISTS tasks_session_id_idx ON escritorio_online.tasks (session_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON escritorio_online.tasks (status);

SELECT
  (SELECT count(*) FROM escritorio_online.sessions)         AS sessions_count,
  (SELECT count(*) FROM escritorio_online.user_preferences) AS preferences_count,
  (SELECT count(*) FROM escritorio_online.tasks)            AS tasks_count;
