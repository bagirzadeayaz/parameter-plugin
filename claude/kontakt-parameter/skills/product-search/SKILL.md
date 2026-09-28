---
name: product-search
description: Research a phone, tablet, notebook, refrigerator or washing machine's specifications using Kontakt Parameter, with verified sources, Azerbaijan-market variants, AZ/RU parameter values and a PDF. Use for product model/specification requests, not plugin maintenance.
---

# Kontakt product search

Use the Kontakt Parameter MCP tools. If deferred, discover them through ToolSearch. Before every new product request call `prepare_product_search` and follow its returned workflow completely. It supplies the shared evidence, normalization, variant, image, saving and presentation requirements adapted to Claude Code.

Use Claude Code WebSearch for discovery, WebFetch for source pages, AskUserQuestion for unresolved variants, and actual pixels returned by inspect_product_image for visual evidence. Do not call Codex tools, launch Codex, change host settings, or fabricate tool activity. If native research tools are unavailable, report the limitation rather than claiming a verified result.

A repeated full product request starts a fresh record and fresh research; do not reuse previous responses or PDFs. Answers to a pending choice continue that search. Preserve explicit user choices. Ask only about unresolved variants verified for Azerbaijan, one dimension at a time: colour, then storage/capacity, then remaining dimensions. Wait for a real answer; never treat a timeout or default as consent.

Finish through per-field recovery, validation, save, PDF and the full parameter table with proof links. Keep task IDs on retries; avoid duplicate searches. Do not weaken evidence requirements to improve completion percentages. A persistent unavailable service or denied permission is a real blocker, not permission to invent evidence or loop indefinitely.

Write customer prose in Azerbaijani. Only parameter names and values are paired AZ/RU. Use the saved parameterTableMarkdown unchanged and include the verified image and generated PDF link/path. Terminal previews vary; do not promise inline rendering where unavailable.
