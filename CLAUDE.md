# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Claude Office Visualizer transforms Claude Code operations into a real-time pixel art office simulation. A "boss" character (main Claude agent) manages work, spawns "employee" agents (subagents), and orchestrates tasks visually.

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) for system architecture and component details.

## Project Goals & Scope

**What this is** — Pedro's personal observability tool for his own Claude Code activity, customized with Jurídico Pro branding. Treated as a Jurídico Pro internal tool, not a generic open-source distribution.

**Who uses it** — Today: Pedro only, running locally. Future: other Jurídico Pro employees, gated by login. New features should NOT block this future (don't hardcode single-user assumptions in DB queries, API routes, or state) but auth itself is NOT required yet.

**Relationship to upstream** — Divergent fork from `paulrobello/claude-office`. No commitment to PR back, no parity guarantee. Upstream fixes may be cherry-picked ad-hoc when useful, but breaking compatibility with upstream is acceptable when it serves Jurídico Pro needs.

**Non-goals** — Public/anonymous internet access; SaaS distribution to non-JP users; mobile-first redesign (desk-first UI is fine); becoming a general monitoring/observability platform (scope stays at Claude Code visualization).

## Decision Constraints

- **Visual identity**: All UI surfaces use Jurídico Pro design tokens — dark base + dourado fosco `#B8972A`, Montserrat font. Sprite art and game elements keep retro pixel style but UI chrome (modals, sidebars, headers) follows JP tokens.
- **Database**: `DATABASE_URL` must support both SQLite (default for local solo use) and Postgres via asyncpg (Supabase for the future multi-user deployment). Don't write SQLite-only SQL.
- **Hooks stay lightweight**: hooks only forward payload data — no file reads, no JSONL parsing. Heavy work belongs in the backend. This invariant carries over from upstream and must be preserved.
- **No premature scale features**: don't add rate limiting, queues, multi-tenancy plumbing, or auth scaffolding until there are real >1 users. Solve for today + don't paint into corners.

## Commands

```bash
# Root
make install         # Install backend + frontend deps
make install-all     # Same + hooks + opencode plugin
make dev-tmux        # Run in tmux (recommended) - backend :8000, frontend :3000
make dev-tmux-kill   # Kill tmux session
make checkall        # fmt + lint + typecheck across all components
make simulate        # Run event simulation
make gen-types       # Regenerate frontend TS types from Pydantic models

# Component-specific (run from backend/ or frontend/)
make dev             # Start dev server
make checkall        # Check single component (faster)
uv run pytest tests/test_file.py::test_name  # Single backend test

# Hooks integration with Claude Code
make hooks-install         # Install hooks (preferred over hooks/install.sh)
make hooks-uninstall
make hooks-status          # Show what's registered in ~/.claude
make hooks-logs            # Tail recent hook activity
make hooks-debug-on/off    # Toggle verbose hook logging

# OpenCode plugin (alternative to Claude Code CLI)
make opencode-install      # Build + register plugin
make opencode-uninstall
make opencode-build        # Build without registering
```

## Development Workflow

**Preferred:** Use `make dev-tmux` - creates separate windows for backend/frontend.
- Read logs: `tmux capture-pane -t claude-office:backend -p`
- Switch windows: `Ctrl-b n` / `Ctrl-b p`
- Hot reload enabled on both servers

**Debugging:** Hook logs at `~/.claude/claude-office-hooks.log` (enable with `CLAUDE_OFFICE_DEBUG=1`)

## Project Skills

- **/office-sprite** - Generate office furniture sprites
- **/character-sprite** - Generate character sprite sheets
- **/desk-accessory** - Generate tintable desk items

See `.claude/skills/*/SKILL.md` for details.

## Workflow Guidelines

**Commit after every batch of work:** Always commit after completing each logical unit.

**Use subagents for validation:** Spawn a Bash subagent to run `make checkall` and commit:
```
"Run 'make checkall' from the project root. If successful, commit with message: '<message>'"
```

## Architecture Notes

**Sidebar panel system** — Both side panels are a `SidebarStack` of `AccordionPanel`s registered in `frontend/src/components/sidebar/panelRegistry.tsx`. Panels are reorderable via `@dnd-kit` (`PanelDndProvider`); order/collapse/size persist in `layoutStore`. To add a new panel: write the component, register it in `panelRegistry`, no sidebar code changes needed.

**Terminal focus (Windows)** — `backend/app/core/terminal_focus.py` records each session's Claude Code PID on `session_start` and walks up the process tree at focus time to find the first ancestor that owns a visible window (wt.exe / VSCode / Cursor — bare powershell/cmd don't own windows). Triggered by `POST /api/v1/sessions/{id}/focus`. No-op on macOS/Linux.

**Database backend** — `DATABASE_URL` accepts both SQLite (default) and Postgres. The engine factory in `backend/app/db/database.py` picks per-dialect settings; SQLite uses StaticPool + WAL, Postgres uses asyncpg default pool. Boolean `server_default`s use `"false"` (Postgres-compatible) rather than `"0"`.

**Session display name sync** — `POST /api/v1/sessions/refresh-names` scans each active session's JSONL transcript for the latest `ai-title` entry and updates `display_name`. Picks up both Claude Code's auto-generated titles and manual `/rename` slash commands. The refresh button is in the sessions sidebar header.

## Version Management

**Keep all version locations in sync** when bumping versions:

| Location | File |
|----------|------|
| Root package | `pyproject.toml` |
| Backend | `backend/pyproject.toml` |
| Hooks | `hooks/pyproject.toml` |
| Hooks CLI | `hooks/src/claude_office_hooks/main.py` (`__version__`) |
| Frontend package | `frontend/package.json` |
| Frontend display | `frontend/src/app/page.tsx` (header badge) |
| OpenCode plugin | `opencode-plugin/package.json` |

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
