# Scholarship scanner

Checks the pages in `sources.json` and writes a dated digest of anything new or changed.
`opportunities-2027.md` is the starting list; the scanner keeps it current.

## Run (on your own computer, since the cloud workspace blocks university sites)
    python scan.py
The first run lists everything. Later runs list only pages that changed. Output goes to `digest-YYYY-MM-DD.md`; `state.json` remembers the last run.

Optional: set `ANTHROPIC_API_KEY` and Claude writes the summary of each changed page against your profile. Without it you get extracted dates, amounts and eligibility lines.

## Schedule on Windows
Task Scheduler → Create Basic Task → Weekly → Start a program: `python`, arguments: `scan.py`, start in this folder.

## Limits
- Plain HTML only. Pages that need JavaScript, or PDFs, will show as "unchanged" or poorly summarised.
- A change means any text change, so some alerts are noise.
- Some source URLs are my best guess (la Caixa, Areces, IRC, Oxford, LSE, Gates). A failing URL appears under "Could not fetch": fix it in `sources.json`.
- Add the universities you care about to `sources.json`; it has 23 sources and the UK has more than 100 universities.
