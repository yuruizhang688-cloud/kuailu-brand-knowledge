CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  brand_slug TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  doc_title TEXT NOT NULL DEFAULT '',
  target_kind TEXT NOT NULL DEFAULT 'document' CHECK (target_kind IN ('document', 'row', 'block')),
  author_name TEXT NOT NULL,
  comment TEXT NOT NULL,
  suggested_text TEXT NOT NULL DEFAULT '',
  selected_text TEXT NOT NULL DEFAULT '',
  context_before TEXT NOT NULL DEFAULT '',
  context_after TEXT NOT NULL DEFAULT '',
  heading_text TEXT NOT NULL DEFAULT '',
  anchor_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  edit_key_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_brand_doc_created
  ON comments (brand_slug, doc_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_brand_status_created
  ON comments (brand_slug, status, created_at DESC);
