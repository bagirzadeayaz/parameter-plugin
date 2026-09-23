# Kontakt Parameter — standalone Codex plugin

This project contains only the Kontakt Parameter plugin and its Codex marketplace catalog. It does not contain or connect to the web app, backend, Firebase, another database, account sessions, private API keys, or service-account credentials. Results and PDFs are saved locally on the user's device.

## Before using it

- Use a current Codex desktop/CLI installation signed in to your own Codex account, with native live Web Search available.
- Install Node.js 20 or newer, available as `node` on PATH, and Git for GitHub installation.
- PDF generation needs Python 3 with `reportlab` and `Pillow`, and a Unicode font. The plugin checks Codex's bundled Python first, then system Python. If needed, use `python -m pip install reportlab Pillow` in your selected Python environment. An explicit runtime can be selected with `KONTAKT_PDF_PYTHON`. PDFs are collected in `Documents/Kontakt Parameter/PDF` under product-based filenames; set `KONTAKT_PDF_OUTPUT_DIR` to choose another local folder.
- No Parameter account, registration, sign-in, password, administrator approval, guest identity, database connection, or search-provider API key is required.
- A private GitHub repository still requires each installing user to have repository access.

## Install this downloaded project

From this project root:

```sh
codex plugin marketplace add .
codex plugin add kontakt-parameter@kontakt-internal
node plugins/kontakt-parameter/scripts/enable-web-search.mjs
```

The web-search setup changes the root `web_search` setting in your Codex user configuration to `live`. No Parameter sign-in page opens. Start a new Codex chat after installation, select Kontakt Parameter and send a product model. If new tools are not visible, restart Codex.

## Publish later

Create a GitHub repository of your choice and upload the CONTENTS of this directory, retaining the hidden `.agents` folder and the hidden `.codex-plugin` and `.mcp.json` files inside the plugin. Do not upload the parent application project. No push has been performed as part of preparing this package.

The [installation prompt](KONTAKT_PARAMETER_INITIAL_PROMPT.md) uses the published `bagirzadeayaz/parameter-plugin` repository. If you use GitHub's web uploader, confirm that hidden files were included; using Git is safer for this layout.

## Automatic updates

Before every new product request, the installed launcher checks `bagirzadeayaz/parameter-plugin` on GitHub. Compatible commits on `main` are downloaded automatically and applied to that request, including its current research instructions. No separate updater, account, or additional interface is needed. Research and results remain local; only public update requests are sent to GitHub.

Downloads are pinned to one commit, verified against Git blob hashes, and checked for import errors, category schemas, workflow availability, runtime ABI and the installed tool contract before activation. Each search keeps its selected runtime through completion and after app restarts. Downloads go under the Codex profile at `kontakt-parameter/updates`; version pins go under `kontakt-parameter/runtime-pins`. Result JSON and PDF paths are unchanged.

If GitHub is offline, rate-limited, or supplies an incompatible/broken update, the plugin uses its last working version (or the installed bundled version on first use). Public GitHub API rate limits apply; repeated searches from one shared public IP can exhaust the anonymous limit. Updates do not require Git on the user's device after installation. No branches are pulled or merged, so rewritten repository history is supported.

For routine releases, edit `plugins/kontakt-parameter/workflow.md` for research instructions or the runtime code and push to `main`. The installed `SKILL.md` is deliberately a short stable entry point. Keep `runtime.json` ABI and the existing tool names, descriptions and input schemas compatible. Changes to the launcher, installed skill, registered tool contract, external dependencies or MCP configuration require a normal plugin release/reinstall. New runtime assets outside `mcp/*.mjs`, `schemas.json`, `workflow.md`, `runtime.json`, `package.json`, and `scripts/generate_product_pdf.py` also require an updater change. Run `node --test test/updater.test.mjs` before publishing; CI runs it on Windows and Linux as well. Activation checks are smoke checks, not proof that every behavior in a new commit is correct.

## One-time update for existing users

Older versions do not contain the updater. Install this version once:

```sh
codex plugin marketplace upgrade kontakt-internal
codex plugin add kontakt-parameter@kontakt-internal
```

Start a new task after this initial update so the launcher and short entry-point skill load. Compatible future runtime updates apply in the same task on the next product request. Use the same normal update procedure for future launcher/tool-interface changes. The maintainer must publish a new plugin manifest version for those installation updates. If a marketplace named `kontakt-internal` already points elsewhere, resolve that conflict before installing; do not silently overwrite it.

Plugin packaging and marketplace commands follow the [official OpenAI documentation](https://developers.openai.com/plugins/build/plugins).
