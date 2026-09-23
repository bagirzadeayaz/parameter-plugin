# Kontakt Parameter — standalone Codex plugin

This project contains only the Kontakt Parameter plugin and its Codex marketplace catalog. It does not contain the web app, backend source, account sessions, private API keys, or service-account credentials. It connects to the existing Kontakt Parameter backend; it is not a standalone backend deployment.

## Before using it

- Use a current Codex desktop/CLI installation signed in to your own Codex account, with native live Web Search available.
- Install Node.js 20 or newer, available as `node` on PATH, and Git for GitHub installation.
- PDF generation needs Python 3 with `reportlab` and `Pillow`, and a Unicode font. The plugin checks Codex's bundled Python first, then system Python. If needed, use `python -m pip install reportlab Pillow` in your selected Python environment. An explicit runtime can be selected with `KONTAKT_PDF_PYTHON`.
- Sign in with your own approved Parameter account. Registration is available, but new accounts require administrator approval. No search-provider API key is required.
- A private GitHub repository requires each installing user to have access. Publishing this package does not grant Parameter account access.

## Install this downloaded project

From this project root:

```sh
codex plugin marketplace add .
codex plugin add kontakt-parameter@kontakt-internal
node plugins/kontakt-parameter/scripts/enable-web-search.mjs
node plugins/kontakt-parameter/scripts/login.mjs
```

The web-search setup changes the root `web_search` setting in your Codex user configuration to `live`. Sign-in opens a browser; do not put a password in chat. Start a new Codex chat after installation, select Kontakt Parameter and send a product model. If new tools are not visible, restart Codex.

## Publish later

Create a GitHub repository of your choice and upload the CONTENTS of this directory, retaining the hidden `.agents` folder and the hidden `.codex-plugin` and `.mcp.json` files inside the plugin. Do not upload the parent application project. No push has been performed as part of preparing this package.

Replace `YOUR_GITHUB_REPOSITORY_URL` in [the installation prompt](KONTAKT_PARAMETER_INITIAL_PROMPT.md) with the actual published repository URL before sharing it. If you use GitHub's web uploader, confirm that hidden files were included; using Git is safer for this layout.

## Update a Git-backed installation

```sh
codex plugin marketplace upgrade kontakt-internal
codex plugin add kontakt-parameter@kontakt-internal
```

Start a new chat after updating. The maintainer must publish a new plugin version when files change. If a marketplace named `kontakt-internal` already points elsewhere, resolve that conflict before installing; do not silently overwrite it.

Plugin packaging and marketplace commands follow the [official OpenAI documentation](https://developers.openai.com/plugins/build/plugins).
