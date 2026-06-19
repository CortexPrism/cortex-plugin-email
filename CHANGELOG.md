# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Unit test suite for all tools
- Structured logging via ctx.logger in lifecycle hooks

### Changed

- Renamed manifest file from `cortex.json` to `manifest.json` for consistency with Cortex standard
- Standardized UI section structure to `ui.settings` format
- Normalized parameter naming: `defaultValue` → `default`, `options` → `enum`
- Added `homepage` field with repository URL
- Added `dependencies` field to manifest

## [2.0.0] — 2026-06-18

### Added

- **SMTP client** (`smtp.ts`) — send email via any SMTP server with TLS or STARTTLS
- **IMAP client** (`imap.ts`) — list, search, and fetch emails from any IMAP mailbox
- Generic email provider support (Gmail, Outlook, Yahoo, ProtonMail, etc.)
- `email_list` now supports `mailbox` parameter for selecting folders
- `email_get` now supports `mailbox` parameter
- `email_draft` now returns RFC 2822 formatted message preview
- `mailbox` parameter added to multiple tools for folder selection
- Provider quick-reference table in README

### Changed

- **Breaking:** Configuration replaced Gmail-specific OAuth (`gmailClientId`, etc.) with generic
  SMTP/IMAP settings (`smtpHost`, `smtpPort`, `smtpUser`, `smtpPassword`, `imapHost`, `imapPort`,
  `imapUser`, `imapPassword`, `fromEmail`)
- **Breaking:** `email_list` no longer uses Gmail search syntax; uses IMAP subject/from search
- **Breaking:** `email_get` uses IMAP UID instead of Gmail message ID
- **Breaking:** `email_draft` no longer saves to Gmail drafts — returns RFC 2822 preview
- `email_summarize_thread` now searches by subject similarity instead of Gmail thread ID
- `email_extract_actions` uses IMAP fetch + heuristic analysis
- All tools now use SMTP/IMAP connections instead of Gmail REST API
- Version bumped to 2.0.0 due to breaking configuration changes

### Removed

- Gmail API dependency (moved to `cortex-plugin-google`)
- Gmail-specific OAuth 2.0 configuration UI
- Gmail search syntax (replaced with IMAP search)

## [1.0.1] — 2026-06-15

### Added

- Initial release

### Fixed

- Replaced non-existent `cortex/plugins` import with local `types.ts` containing inline type
  definitions
- Removed broken `cortex/plugins` import map from `deno.json`
- Fixed test files with complete mock contexts (`state.delete`, `state.list`,
  `config.get/set/getAll`, `logger`, `host`)
- Rewrote scaffold test files to test actual plugin tools instead of template leftovers
- Added `defaultValue` and `default` fields to `ToolParam` type for compatibility

## [1.0.0] — 2026-06-15

### Added

- Initial release of cortex-plugin-email
- `email_list` — List emails from Gmail inbox
- `email_get` — Get a specific email by ID
- `email_send` — Send an email via Gmail API
- `email_draft` — Create a draft email
- `email_summarize_thread` — Summarize an email thread
- `email_extract_actions` — Extract action items from emails
- Gmail API OAuth 2.0 configuration UI
