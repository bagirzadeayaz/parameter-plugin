# Copy-paste installation prompt

Copy the prompt below into Codex.

---

Install the latest Kontakt Parameter plugin from https://github.com/bagirzadeayaz/parameter-plugin.git for my Codex account. This is a local-only plugin repository; do not deploy a backend.

Check Git, the Codex CLI and Node.js 20+ first. Register the repository with `codex plugin marketplace add https://github.com/bagirzadeayaz/parameter-plugin.git`, then install `kontakt-parameter@kontakt-internal` using `codex plugin add`. If that marketplace already points to this repository, upgrade it before installing. If that marketplace name already exists with a different source, do not replace it without asking me. If repository access is denied, explain which access is missing.

Use the installed plugin path returned by the installer. Check that Python can import reportlab and PIL, and that the PDF generator can find a Unicode font; use Codex's bundled runtime if available. Explain and request approval for any missing software installation. Enable native live Web Search with the plugin's `scripts/enable-web-search.mjs` script; preserve other Codex settings and do not change my selected model or reasoning level.

Do not open a Parameter sign-in page or ask for an account, registration, password, refresh token, API key, or administrator approval. The plugin must not connect to Firebase or any other database. It must store search records and generated PDFs only on my device.

Verify the installed version and local-only status, accurately report anything that remains incomplete, and tell me to start a new Codex chat so the plugin's tools and instructions load. In the new chat I can select Kontakt Parameter and send a product name. The plugin should follow its bundled research workflow and provide the product image, full parameter table with proof links beside confirmed values, and a locally generated PDF. Do not fabricate a successful test or start a product search without my product request.

Verify that the installed MCP entry point is `mcp/bootstrap.mjs` and that its tools include `prepare_product_search`. Explain that this initial installation needs a new task once; afterward compatible runtime updates are downloaded automatically before new searches in the same task. A failed update falls back to the last working version. Launcher and registered tool-interface changes may still require a normal update.

Keep this installation conversation in English. The plugin's product-search messages and reports must be in Azerbaijani. Keep product names, website names, links, and exact parameter values intact.
