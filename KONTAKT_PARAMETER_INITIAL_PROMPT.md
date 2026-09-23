# Copy-paste installation prompt

Replace YOUR_GITHUB_REPOSITORY_URL with the published repository URL before sharing.

---

Install the Kontakt Parameter plugin from YOUR_GITHUB_REPOSITORY_URL for my Codex account. This is a plugin-only repository; do not deploy its backend or start the optional local worker.

Check Git, the Codex CLI and Node.js 20+ first. Register the repository with `codex plugin marketplace add YOUR_GITHUB_REPOSITORY_URL`, then install `kontakt-parameter@kontakt-internal` using `codex plugin add`. If that marketplace name already exists, inspect its source and do not replace an unrelated installation without asking me. If repository access is denied, help me sign in to GitHub or explain which access is missing.

Use the installed plugin path returned by the installer. Check that Python can import reportlab and PIL, and that the PDF generator can find a Unicode font; use Codex's bundled runtime if available. Explain and request approval for any missing software installation. Enable native live Web Search with the plugin's `scripts/enable-web-search.mjs` script; preserve other Codex settings and do not change my selected model or reasoning level.

Open the secure Parameter sign-in using the plugin's `scripts/login.mjs` or its sign-in tool. Never ask me to paste passwords, refresh tokens or API keys into chat. I will sign in or register in the browser; if the account is pending, explain that administrator approval is needed rather than claiming setup is complete.

Verify the installed version and available connection status, accurately report anything that remains incomplete, and tell me to start a new Codex chat so the plugin's tools and instructions load. In the new chat I can select Kontakt Parameter and send a product name. The plugin should follow its bundled research workflow and provide the product image, full parameter table with proof links beside confirmed values, and a PDF. Do not fabricate a successful test or start a product search without my product request.
