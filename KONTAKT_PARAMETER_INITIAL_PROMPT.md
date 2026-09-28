# Copy-paste installation prompt — Codex or Claude Code

Copy the prompt below into either host. It installs only the edition for the current host.

---

Install the latest Kontakt Parameter plugin from https://github.com/bagirzadeayaz/parameter-plugin.git for the host running this conversation: Codex or Claude Code. Detect the active host from the session, not just which executables are installed. If it cannot be determined, ask me. Read the repository README.md and, for Claude Code, claude/README.md. Do not deploy a backend or modify the other host's configuration.

Check Git, Node.js 20+, the active host's plugin-installation support, and Python 3 with reportlab, Pillow and a Unicode font. Explain and ask before installing missing software. Preserve local changes, existing search records, PDFs, model selection, reasoning settings and permission controls. If using an existing checkout, verify its remote and update only safely; never reset or overwrite local edits. If the CLI is unavailable, check for an existing installation or explain the supported UI installation route instead of claiming success.

For Codex only:
- Use the catalog `.agents/plugins/marketplace.json` and package `plugins/kontakt-parameter`, not the Claude package.
- Register the repository with `codex plugin marketplace add https://github.com/bagirzadeayaz/parameter-plugin.git`. If `kontakt-internal` already points to this repository, use `codex plugin marketplace upgrade kontakt-internal` instead. Install with `codex plugin add kontakt-parameter@kontakt-internal` when supported by the installed CLI; otherwise use the host's plugin installation UI.
- Use the installed path returned by the installer. Check its MCP entry point is `mcp/bootstrap.mjs`. Enable live Web Search using that package's `scripts/enable-web-search.mjs`, explaining the scoped setting change and preserving unrelated settings. Codex's bundled Python can be used when available.
- Start a new task after initial installation if required to load the tools. Compatible runtime updates are checked before subsequent searches; launcher or tool-interface changes may require reinstalling. Do not promise every update can load into an existing task.

For Claude Code only:
- Use `.claude-plugin/marketplace.json` and the self-contained package `claude/kontakt-parameter`.
- Register with `claude plugin marketplace add bagirzadeayaz/parameter-plugin`, then install with `claude plugin install kontakt-parameter@kontakt-internal`. If the same marketplace is already registered, update it with `claude plugin marketplace update kontakt-internal`; update an existing installation with `claude plugin update kontakt-parameter@kontakt-internal`.
- Check the installed MCP configuration launches `host.mjs` from `${CLAUDE_PLUGIN_ROOT}`. Require Claude's WebSearch and WebFetch tools; do not run the Codex web-search setup script or configure a Codex worker.
- Reload plugins if supported or start a new Claude Code session. Use `/kontakt-parameter:product-search` followed by a product name. Claude updates through its plugin manager, not Codex's per-search runtime updater.

For either host, inspect an existing `kontakt-internal` marketplace before changing it. If it points elsewhere, ask before replacing it. Do not install into both hosts unless I request that. Explain any repository-access or host-account requirement without requesting secrets in chat.

No Kontakt account, Firebase credentials, direct database connection or separate search-provider API key is required. Future product results and PDFs use the existing anonymous platform endpoint, with local backups. Never upload historical results, conversation history or local file paths. Do not change platform configuration during installation.

Verify installation separately from activation: check the installed package and version, then confirm the tools include `prepare_product_search`, `get_product_schema` and `save_product_search_result` when the current host exposes them. Use read-only checks only; do not start a synthetic search or claim platform storage was tested. If tools cannot load until a new session, clearly state that activation remains unverified and provide the next step. Report any failed or incomplete check honestly.

Do not start research until I provide a product request. Keep installation conversation in my language. Product-service prose should be Azerbaijani; only parameter names and values are paired in Azerbaijani and Russian. Results should include the saved full parameter table, per-parameter proof links, verified image and generated PDF. Do not promise inline images or download cards where the host only supports links or local paths.
