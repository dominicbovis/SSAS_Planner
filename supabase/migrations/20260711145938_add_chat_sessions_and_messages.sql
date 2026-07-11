/*
# Add chat sessions and messages tables

1. Purpose
   Persist "Ask Claude" conversations so users can save, reopen, and build on
   previous chats. Each chat session belongs to a scheme and optionally
   references the active scenarios at the time the chat was started.

2. New Tables
   - `chat_sessions`
     - `id` (uuid, primary key)
     - `scheme_id` (uuid, FK -> ssas_schemes, cascade delete)
     - `title` (text, not null) — auto-derived from the first user message
     - `scenario_context` (text, nullable) — snapshot of active scenario context
     - `created_at` (timestamptz, default now())
     - `updated_at` (timestamptz, default now())

   - `chat_messages`
     - `id` (uuid, primary key)
     - `session_id` (uuid, FK -> chat_sessions, cascade delete)
     - `role` (text, not null) — 'user' | 'assistant'
     - `content` (text, not null)
     - `created_at` (timestamptz, default now())

3. Security
   - Single-tenant app (no auth screen). RLS enabled on both tables.
   - Policies use `TO anon, authenticated` so the anon-key frontend can CRUD.
   - `USING (true)` is acceptable because this is intentionally shared/public data
     in a single-tenant app with no sign-in.

4. Indexes
   - `chat_messages_session_id_idx` for fast message retrieval by session.
   - `chat_sessions_scheme_id_idx` for fast session listing by scheme.
*/

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES ssas_schemes(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  scenario_context text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_chat_sessions" ON chat_sessions;
CREATE POLICY "anon_select_chat_sessions" ON chat_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_chat_sessions" ON chat_sessions;
CREATE POLICY "anon_insert_chat_sessions" ON chat_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_chat_sessions" ON chat_sessions;
CREATE POLICY "anon_update_chat_sessions" ON chat_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_chat_sessions" ON chat_sessions;
CREATE POLICY "anon_delete_chat_sessions" ON chat_sessions FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS chat_sessions_scheme_id_idx ON chat_sessions(scheme_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_chat_messages" ON chat_messages;
CREATE POLICY "anon_select_chat_messages" ON chat_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_chat_messages" ON chat_messages;
CREATE POLICY "anon_insert_chat_messages" ON chat_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_chat_messages" ON chat_messages;
CREATE POLICY "anon_update_chat_messages" ON chat_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_chat_messages" ON chat_messages;
CREATE POLICY "anon_delete_chat_messages" ON chat_messages FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx ON chat_messages(session_id);
