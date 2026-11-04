# Data model

Markdown files in the selected vault are the source of truth. SQLite is a
rebuildable index and stores vault selection, note metadata, relationships,
tags, revisions, and full-text search data.

- **notes**: one row per vault-relative `.md` path, with title, SHA-256 content
  hash, timestamps, and an optional archive timestamp.
- **links**: outgoing wikilinks per source note; resolved links reference a
  target note, while unresolved links retain their target text and optional
  display alias.
- **tags / note_tags**: normalized, unique tag names and their many-to-many
  associations with notes. Frontmatter and inline Markdown tags are indexed
  together.
- **revisions**: prior Markdown content and hash, retained on meaningful
  changes with a per-note 60-second deduplication window.
- **settings**: string key/value pairs, including the selected vault path.
- **notes_fts**: SQLite FTS5 index of active note titles and Markdown bodies.
- **ai_tasks**: asynchronous task type, provider/model, status, result, and
  errors. Task prompts and note content are not persisted here.
- **claims / evidence**: AI-derived statements and separately stored proof
  quotes; evidence carries a verified source span and source hash, and edited-away
  quotes remain stored with `stale` status. Neither table writes to Markdown.
- **extraction_stats**: per-extraction raw and backend-verified quote counts for
  the Trust Report. Unverified quotes are counted but never inserted as evidence.
- **relationships**: typed AI proposals or manual relationships between two notes,
  with confidence, per-note content hashes, human-review state, and decision
  timestamps. Accepted and pending relationships can appear in the Reasoned graph;
  rejected proposals are suppressed until either source note changes.
- **relationship_evidence**: one verified quote and original character span from
  each endpoint note. Edited-away quotes are retained as stale and move proposals
  to `outdated`; they are never used as current proof.
- **review_decisions**: append-only accept, edit, dismiss, and defer history for
  relationship proposals. Manual relationships are recorded as accepted decisions.
- **retrieval_chunks / retrieval_chunks_fts**: rebuildable heading/paragraph
  chunks with original Markdown character offsets, source hashes, and an FTS5
  index used for scoped BM25 retrieval. Ask lazily backfills chunks for existing
  indexed notes after migration; if a note changed outside CurZ, it asks
  for a vault rescan rather than indexing a mismatched source.
- **chunk_embeddings**: optional cached vectors keyed by note, content hash,
  model, and chunk. They rerank the BM25 shortlist and can be deleted/rebuilt;
  retrieval remains BM25-only when no embedding model is configured.
- **revisit_preferences**: per-note `saved` or `dismissed` state for Home's
  deterministic Revisit suggestions. Preferences survive reloads and cascade
  away only when the corresponding note is permanently removed.
- **sample vault manifest**: a local JSON manifest in the dedicated sample
  folder lists only bundled sample paths. Removal checks each listed note's
  `sample: true` frontmatter and never recursively deletes the folder.
- **evaluation report**: `evals/results/latest.json` contains aggregate
  measurements and provider configuration only; it does not store prompts or
  note contents. The Trust Report reads this file without hardcoded metrics.

The index can be reconstructed by rescanning the vault. Every resolved file
path is checked against the resolved vault root; writes use a temporary file in
the target directory and an atomic replace.
