# Kontakt Parameter Codex plugin

This internal plugin lets Codex research product parameters with Codex's native web-search capability and save the result to the existing production Firebase workflow. It supports phones, tablets, notebooks, refrigerators, and washing machines. The same application permissions, category schemas, and evidence storage remain authoritative.

For GitHub installation, paste the prompt from [`KONTAKT_PARAMETER_INITIAL_PROMPT.md`](../../KONTAKT_PARAMETER_INITIAL_PROMPT.md), after replacing its repository URL placeholder. See the [project setup guide](../../README.md) for runtime requirements. Users do not provide search-provider API keys.

## Account setup

From the repository root, run:

```powershell
node plugins/kontakt-parameter/scripts/login.mjs
```

The command opens the plugin's secure browser window. Choose **Daxil ol** to use an existing Parameter application account or **Qeydiyyat** to register. New accounts enter the application's existing administrator-approval queue with the `pending` role. The same window can be opened directly from chat through the `begin_parameter_sign_in` tool, so users do not need to enter credentials in a terminal or conversation.

The browser sends the password directly to Firebase Authentication. ChatGPT, Codex, and the local MCP server never receive it. The plugin stores only the refresh token plus non-secret connection metadata in the current user's Codex profile. The password, OpenRouter key, and service-account credentials are never stored.

Sign out with:

```powershell
node plugins/kontakt-parameter/scripts/logout.mjs
```

You can also ask the plugin to sign out through `sign_out_parameter_account`.

An explicit request to search for a product authorizes both task creation and the final validated result save, so the plugin does not ask for separate start or save confirmations. Rerunning an existing task and cancelling an active task still require approval. Other tools only read schemas, status, and results. Plugin searches use the signed-in user's normal Codex usage allowance; they do not consume OpenRouter, Exa, Firecrawl, or Azure model balance.

Every successful search automatically creates a polished PDF in the shared Kontakt template and returns it with the complete ordered parameter table, at least one inspected exact-product image, and a linked per-source coverage table. The PDF contains the saved image and exact saved parameter values, is generated locally under `Documents/Kontakt Parameter/PDF`, and does not add a Firebase image-storage step. The save tool returns the PDF, saved app-format result, images, and source counts, so these sections do not depend on a separate follow-up request.

All visible plugin communication is written for non-technical users. Internal research, model, tool, validation, schema, worker, routing, metadata, and recovery stages are never narrated. Long searches may show only an occasional compact percentage with elapsed and indicative remaining time; completed responses begin directly with the product data. Codex may still display its own built-in activity rows for tool and Web Search usage, which are controlled by the Codex host rather than this plugin.

The MCP server cannot spend or transfer Codex tokens itself. The installer enables live hosted Codex Web Search and the bundled skill requires real `web_search` events. Research is adaptive: Codex chooses queries, languages, websites and source types without fixed modes, query limits, source quotas, country limits or domain allowlists. The only website exclusion is Azerbaijani retailers; Azerbaijani official manufacturer sites and all relevant international sources remain allowed. Official exact-product sources receive priority. Every missing field receives more research, and conflicts are researched until an applicable official source resolves them or at least three independent sources establish a clear majority.

Native Codex image analysis applies to all five categories. Each schema field is marked either `direct_product_photo` or `readable_exact_model_label_only`. Direct images can support only safely visible properties; hidden technical values require visibly printed exact-model labels, manuals, specification graphics, rating plates, packaging panels or energy labels. Inspected images, observations and confidence are stored with field evidence, and visual guessing is rejected.

## Local web-app worker

The deployed web app can enqueue Codex-native searches without showing Codex to its users. On one trusted Windows computer, sign the plugin into an approved Parameter account, sign the Codex CLI into the Codex account that supplies usage, and keep this command running. A normal account processes only tasks assigned to that account; a `super_admin` worker can process searches submitted by every employee.

```powershell
npm --prefix plugins/kontakt-parameter run worker
```

On Windows, the same service can be started by double-clicking `START_LOCAL_WORKER.cmd` in the plugin folder.

The worker claims queued searches, launches an isolated noninteractive Codex process with live Web Search, reports progress to Firebase, stops the process when a user cancels, retries interrupted runs up to three times, and saves the validated result through the existing plugin tools. The web-app user's Search click is the authorization to research and save that task, so no chat or second approval is shown.

No application `.env` file or repository secret is exposed to the research process. The Codex child runs in a temporary read-only workspace. If this computer is off, requests remain queued and begin when the worker is started again.

Before Codex shows a result table or asks to save it, the read-only `validate_product_search_draft` tool applies the same production checks without writing data. It rejects drafts when any unresolved field lacks a documented recovery search, image analysis was not actually attempted, evidence pages were not opened, or conflicts were not researched and documented. Refrigerator schemas also distinguish usable/net capacity from gross/nominal capacity so those values are stored in the correct Kontakt fields instead of being treated as a conflict.
