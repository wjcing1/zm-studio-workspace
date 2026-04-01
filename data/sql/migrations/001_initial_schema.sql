PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS studio_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  base TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS studio_focus_items (
  studio_id INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (studio_id, sort_order),
  FOREIGN KEY (studio_id) REFERENCES studio_profile(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assistant_profiles (
  scope TEXT PRIMARY KEY,
  greeting TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS assistant_starters (
  scope TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  PRIMARY KEY (scope, sort_order),
  FOREIGN KEY (scope) REFERENCES assistant_profiles(scope) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  budget TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  manager TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_deliverables (
  project_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (project_id, sort_order),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_team_members (
  project_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (project_id, sort_order),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  file_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS boards (
  key TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL DEFAULT 'workspace',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  camera_x REAL NOT NULL DEFAULT 96,
  camera_y REAL NOT NULL DEFAULT 80,
  camera_z REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS board_nodes (
  board_key TEXT NOT NULL,
  node_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  x INTEGER NOT NULL DEFAULT 0,
  y INTEGER NOT NULL DEFAULT 0,
  w INTEGER NOT NULL DEFAULT 320,
  h TEXT NOT NULL DEFAULT 'auto',
  auto_height INTEGER,
  title TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  file TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  file_kind TEXT NOT NULL DEFAULT '',
  size INTEGER,
  background TEXT NOT NULL DEFAULT '',
  background_style TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  extra_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (board_key, node_id),
  FOREIGN KEY (board_key) REFERENCES boards(key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS board_edges (
  board_key TEXT NOT NULL,
  edge_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  from_side TEXT NOT NULL DEFAULT 'right',
  to_side TEXT NOT NULL DEFAULT 'left',
  from_end TEXT NOT NULL DEFAULT 'none',
  to_end TEXT NOT NULL DEFAULT 'arrow',
  color TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  extra_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (board_key, edge_id),
  FOREIGN KEY (board_key) REFERENCES boards(key) ON DELETE CASCADE
);
