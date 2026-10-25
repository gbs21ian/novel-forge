# v1.2.2
- 배포 저장소 연결: gbs21ian/novel-forge
- 새 설치 및 비어 있는 기존 설정에 업데이트 저장소 기본값 적용
- 기존 사용자 지정 저장소 유지

## v1.2.1 — Manual self-update for privately installed plugins

- User-configured GitHub Releases source (HTTPS owner/repo validation).
- Explicit check/update controls, optional once-daily startup notification.
- SHA-256 digest validation for all three release assets.
- Manifest version/ID compatibility checks, prevent downgrade.
- Preserve data.json, manuscript and plugin settings; backup original code and rollback on partial write failure.
- Build/test/release GitHub Actions workflow for future tags.
- Obsidian Community Directory policy disclosure (self-updates prohibited for officially listed plugins).

# Changelog

## v1.2.0 — AI Writing Focus

- Local keyword + Korean-bigram retrieval, incremental on-vault index and file/line-range source evidence.
- Four-stage opt-in AI workflow (plan / draft / critique / optional polish), per-stage model overrides within active provider.
- User-approved AI style profile generation from recent chapters; preserve previous profile on change.
- Throttled automatic manuscript snapshots, immediate pre-append / pre-status / pre-restore backups, two-click restoration.
- Incomplete polishing response safety; preserved first drafts, optional review with checked source identifiers.
- Gemini cache registry keyed per project/model for multi-model stages; retained v1.1 history, summary, caching and providers.
- No dependencies required in shipped `main.js`; reproducible `node build.js` source build.

## v1.1.0 — Memory and Cache

- Gemini explicit context cache, chapter summaries, conversation sliding window/auto compression, token accounting.

## v1.0.0 — Web Novel Studio

- Project and chapter management, Markdown drafts, bring-your-own-key AI writing workflows.
