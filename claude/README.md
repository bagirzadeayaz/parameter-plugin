# Claude Code edition

This separate package preserves the existing Codex package, installer, updater and records.

Requirements: Claude Code with WebSearch/WebFetch access, Node.js 20+, Python 3 with `reportlab` and `Pillow`. Set `KONTAKT_PDF_PYTHON` if Python is not on PATH. No Kontakt login or Firebase credentials are required. Tool permission prompts still apply.

From a local repository checkout:

```sh
claude plugin marketplace add .
claude plugin install kontakt-parameter@kontakt-internal
```

Start a Claude Code session and enter `/kontakt-parameter:product-search` followed by a product name. For development: `claude --plugin-dir ./claude/kontakt-parameter`.

After publishing these changes, remote installation:

```sh
claude plugin marketplace add bagirzadeayaz/parameter-plugin
claude plugin install kontakt-parameter@kontakt-internal
```

Claude records live under `~/.claude/kontakt-parameter/results` (or `CLAUDE_CONFIG_DIR`). PDFs remain under `~/Documents/Kontakt Parameter/PDF`, overridable with `KONTAKT_PDF_OUTPUT_DIR`. UUID-based names avoid collisions. Codex records are not read or migrated. Product results and PDFs use the same anonymous platform endpoint; no conversation history or local paths are submitted.

Deploy the accompanying platform `researchProvider` compatibility change before publishing Claude support, so results are labelled Claude rather than Codex. This client-supplied label is provenance, not authentication or proof of research. The same evidence validator applies to both hosts. This adds interactive Claude support, not a Claude worker for the web app.

Claude uses its native plugin update mechanism, not Codex's per-search updater:

```sh
claude plugin marketplace update kontakt-internal
claude plugin update kontakt-parameter@kontakt-internal
```

Reload plugins or start a new session after updating. Do not change versions during an active search. Terminal interfaces may show image/PDF links instead of previews; the PDF still contains the image and paired parameters.

## Maintainers

The distributable directory is self-contained. Its `mcp/`, `scripts/`, `schemas.json` and `workflow.md` are generated from the shared Codex sources using explicit, checked host substitutions. Edit the shared source for business rules, then rebuild; do not hand-edit generated files. The Claude manifest, adapter and skill are maintained separately.

```sh
node scripts/build-claude.mjs
node scripts/build-claude.mjs --check
claude plugin validate ./claude/kontakt-parameter
claude plugin validate .
```

The builder never writes to the Codex package and allowlists only required runtime files. No Firebase secrets are included. Confirm a real Claude search before release; structural validation alone cannot establish research quality or host UI rendering.

Official references: https://code.claude.com/docs/en/plugins-reference · https://code.claude.com/docs/en/plugin-marketplaces · https://code.claude.com/docs/en/tools-reference
