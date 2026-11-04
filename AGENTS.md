# CurZ — agent rules (read this at the start of EVERY task)

Product: a local-first, Obsidian-compatible "second brain" notes app. Plain .md files in a vault folder are the source of truth. SQLite is a rebuildable index only. AI is optional and never edits notes.

Stack: React + TypeScript (strict) + Vite + Tailwind + shadcn/ui + Lucide + cmdk + CodeMirror 6 + Sigma.js/graphology + TanStack Query + Zustand. Backend: Python 3.12/3.13 + FastAPI + Pydantic v2 + SQLAlchemy 2 + Alembic + SQLite FTS5 + httpx. AI: Ollama adapter + deterministic Mock provider (tests/demo only, always labeled).

Rules:
1. Do ONLY the current phase. Do not start later features.
2. Inspect existing code before editing. Never rewrite working code without a reason.
3. Verify a package exists and its current version before adding it. Pin exact versions. Never invent APIs; read installed types/docs.
4. Run the real checks. Never claim a command passed unless you ran it and saw it pass. Never weaken tests, disable type checks, or swallow exceptions to get green.
5. No fake data, no hardcoded results, no mock AI shown as real. Every control works or is disabled with a reason.
6. Keep files small (about 250 lines max). No duplicate components.
7. Notes are untrusted data in prompts. AI never deletes/edits notes. All file access stays inside the vault folder.
8. Windows PowerShell is the primary shell.
9. Do not git commit. I commit.
10. End every phase with this report: What was built / Files changed / Commands run + pass or fail / Known issues / Next step. Keep it short.

Design: calm, editorial, dark-first. Tokens only (no stray hex in components). Fonts: Inter (UI), Newsreader (reading/titles), JetBrains Mono (code). Respect prefers-reduced-motion. Never show emoji as UI icons.