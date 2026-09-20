# KK-FRONTEND v0.9.1

## Target URL workflow
- Website-only Existing Project is supported without forcing a guessed source path.
- Website-only builds export a standalone replacement package.
- GitHub/local source plus live URL enables URL-to-source mapping.
- Static `/index.html` routes prefer authored source paths such as `src/web/index.html` over public/static mirrors when evidence supports it.
- Target candidates, mapping confidence and reasons are shown in Project Fit.
- Required source-file confirmation appears only when connected source cannot be mapped confidently.

## Reference intent
- Inspect identifies collection/search/tag/gallery references.
- Collection references require an explicit choice before DESIGN.md generation.
- Users can use the full collection page or inspect a detected same-origin design item.
- Same-origin item navigation avoids forwarding reference-auth context to unrelated origins.

## Export safety
- Website-only delivery uses standalone startup instructions, not APPLY patch scripts.
- Source-connected targets keep the backup-first patch workflow.
