CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS forums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  last_topic_id INTEGER NOT NULL DEFAULT 0,
  last_check_at INTEGER,
  last_check_time TEXT,
  error_log TEXT NOT NULL DEFAULT '无'
);

CREATE TABLE IF NOT EXISTS bark_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  client_key TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS stats (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('bark_server', 'https://api.day.app'),
  ('bark_icon', 'https://upload.wikimedia.org/wikipedia/commons/1/14/Discourse_logo.png'),
  ('check_interval', '300'),
  ('gotify_server', ''),
  ('gotify_token', ''),
  ('push_time_start', '00:00'),
  ('push_time_end', '23:59');

INSERT OR IGNORE INTO stats (key, value) VALUES
  ('total_notified', '0'),
  ('last_notified_title', '无'),
  ('global_last_check', '尚未检查');
