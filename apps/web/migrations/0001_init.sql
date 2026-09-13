-- Launch schema (ADR-0035).

CREATE TABLE vault_accounts (
  id TEXT PRIMARY KEY,
  github_user_id TEXT NOT NULL,
  engine TEXT NOT NULL CONSTRAINT vault_accounts_engine CHECK (engine IN ('claude', 'codex', 'grok', 'cursor', 'antigravity')),
  label TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX vault_accounts_user_engine
  ON vault_accounts (github_user_id, engine);

CREATE TABLE encryption_key_meta (
  github_user_id TEXT PRIMARY KEY,
  epoch INTEGER NOT NULL DEFAULT 1,
  rotated_at INTEGER NOT NULL
);

CREATE TABLE model_slots (
  id TEXT PRIMARY KEY,
  github_user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  engine TEXT NOT NULL CONSTRAINT model_slots_engine CHECK (engine IN ('claude', 'codex', 'grok', 'cursor', 'antigravity')),
  model TEXT NOT NULL,
  effort TEXT CONSTRAINT model_slots_effort CHECK (effort IN ('low', 'medium', 'high', 'max')),
  fast INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  default_sort_index INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  similar_model INTEGER NOT NULL DEFAULT 1
    CONSTRAINT model_slots_similar_model CHECK (similar_model IN (0, 1)),
  FOREIGN KEY (account_id) REFERENCES vault_accounts (id) ON DELETE CASCADE
);

CREATE INDEX model_slots_user
  ON model_slots (github_user_id, default_sort_index);

CREATE TABLE repo_model_list (
  github_user_id TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  sort_index INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (github_user_id, repo_id, slot_id),
  FOREIGN KEY (slot_id) REFERENCES model_slots (id) ON DELETE CASCADE
);

CREATE INDEX repo_model_list_repo
  ON repo_model_list (github_user_id, repo_id, sort_index);

CREATE TABLE repo_model_list_meta (
  github_user_id TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (github_user_id, repo_id)
);

CREATE TABLE enabled_repos (
  github_user_id TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  bot_at INTEGER,
  home_at INTEGER,
  last_synced_at INTEGER,
  synced_epoch INTEGER NOT NULL DEFAULT 0,
  wake_mode TEXT NOT NULL DEFAULT 'auto',
  review_prompt TEXT,
  ignore_paths TEXT,
  auto_authors TEXT NOT NULL DEFAULT 'you',
  auto_author_skip TEXT,
  auto_branches TEXT NOT NULL DEFAULT 'default',
  auto_branch_list TEXT,
  auto_branch_skip TEXT,
  auto_review_cadence TEXT NOT NULL DEFAULT 'every-push',
  PRIMARY KEY (github_user_id, repo_id)
);

CREATE INDEX enabled_repos_repo_id ON enabled_repos (repo_id);

CREATE TABLE repo_setting_defaults (
  github_user_id TEXT PRIMARY KEY,
  wake_mode TEXT NOT NULL DEFAULT 'auto',
  auto_authors TEXT NOT NULL DEFAULT 'you',
  auto_branches TEXT NOT NULL DEFAULT 'default',
  auto_review_cadence TEXT NOT NULL DEFAULT 'every-push'
);

CREATE TABLE home_repos (
  github_user_id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  installation_id TEXT,
  secrets_epoch INTEGER NOT NULL DEFAULT 0,
  secrets_synced_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE repo_routes (
  repo_id TEXT PRIMARY KEY,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  github_user_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  bot_installation_id TEXT
);

CREATE INDEX repo_routes_bot_installation ON repo_routes (bot_installation_id);

CREATE TABLE wake_runs (
  wake_key TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL,
  github_user_id TEXT,
  consumer_repo_id TEXT NOT NULL,
  consumer_owner TEXT NOT NULL,
  consumer_name TEXT NOT NULL,
  pull_number INTEGER NOT NULL,
  head_sha TEXT,
  comment_id INTEGER,
  progress_comment_id INTEGER,
  run_url TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX wake_runs_dispatch_id ON wake_runs (dispatch_id);

CREATE INDEX wake_runs_consumer_created ON wake_runs (consumer_repo_id, created_at DESC);

CREATE TABLE webhook_receipts (
  id INTEGER PRIMARY KEY CONSTRAINT webhook_receipts_singleton CHECK (id = 1),
  received_at INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  outcome TEXT NOT NULL
);
