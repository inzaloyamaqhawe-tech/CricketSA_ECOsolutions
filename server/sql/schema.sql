-- Cricket ECO Solutions schema
-- Safe to run repeatedly (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'applicant', -- 'applicant' | 'admin'
  full_name     TEXT NOT NULL,
  phone         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS volunteer_roles (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  department      TEXT,
  description     TEXT,
  is_open         BOOLEAN NOT NULL DEFAULT true,
  pass_threshold  INTEGER NOT NULL DEFAULT 70, -- percent
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Two kinds of screening question:
--  - Knockout: exactly one option is the "pass" answer (pass_option). Selecting
--    anything else instantly fails the applicant regardless of their score
--    elsewhere (e.g. availability, minimum age, code-of-conduct commitment).
--  - Weighted: every option carries points (points_a..d); the applicant's
--    total points across all weighted questions, as a percentage of the
--    maximum possible, is their screening score.
-- A question is one or the other: is_knockout = true uses pass_option and
-- ignores points; is_knockout = false uses points_a..d and ignores pass_option.
-- option_c/option_d/points_c/points_d may be NULL for questions with only two choices.
CREATE TABLE IF NOT EXISTS screening_questions (
  id           SERIAL PRIMARY KEY,
  role_id      INTEGER NOT NULL REFERENCES volunteer_roles(id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  option_a     TEXT NOT NULL,
  option_b     TEXT NOT NULL,
  option_c     TEXT,
  option_d     TEXT,
  is_knockout  BOOLEAN NOT NULL DEFAULT false,
  pass_option  CHAR(1) CHECK (pass_option IN ('A','B','C','D')),
  points_a     INTEGER NOT NULL DEFAULT 0,
  points_b     INTEGER NOT NULL DEFAULT 0,
  points_c     INTEGER,
  points_d     INTEGER,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  CHECK (NOT is_knockout OR pass_option IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS venues (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  city  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id             INTEGER NOT NULL REFERENCES volunteer_roles(id),
  venue_id            INTEGER REFERENCES venues(id),
  country_of_residence TEXT NOT NULL,
  city_of_residence    TEXT,
  date_of_birth        DATE,
  motivation           TEXT,
  availability_notes   TEXT,
  status               TEXT NOT NULL DEFAULT 'draft',
    -- draft | submitted | screening_pending | shortlisted | rejected_auto |
    -- interview_invited | interview_scheduled | offered | rejected_manual | withdrawn
  screening_score      INTEGER,          -- weighted percent 0-100 (independent of knockout outcome)
  knockout_failed      BOOLEAN NOT NULL DEFAULT false, -- true if a knockout question sank the application regardless of score
  screening_submitted_at TIMESTAMPTZ,
  decided_at           TIMESTAMPTZ,
  decided_by           INTEGER REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_documents (
  id             SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  doc_type       TEXT NOT NULL, -- 'cv' | 'police_clearance' | 'id_document'
  original_name  TEXT NOT NULL,
  stored_path    TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS screening_answers (
  id              SERIAL PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question_id     INTEGER NOT NULL REFERENCES screening_questions(id),
  selected_option CHAR(1) NOT NULL CHECK (selected_option IN ('A','B','C','D')),
  points_awarded  INTEGER,          -- NULL for knockout questions
  knockout_failed BOOLEAN NOT NULL DEFAULT false, -- true if this was a knockout Q and the wrong option was chosen
  UNIQUE(application_id, question_id)
);

CREATE TABLE IF NOT EXISTS interviews (
  id             SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  scheduled_at   TIMESTAMPTZ,
  meeting_link   TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'invited', -- invited | scheduled | completed | no_show | cancelled
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_log (
  id             SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  to_email       TEXT NOT NULL,
  email_type     TEXT NOT NULL, -- 'rejection' | 'shortlisted' | 'interview_invite' | 'offer' | 'welcome'
  subject        TEXT NOT NULL,
  sent_ok        BOOLEAN NOT NULL DEFAULT true,
  error_message  TEXT,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_role ON applications(role_id);
CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_application ON application_documents(application_id);
