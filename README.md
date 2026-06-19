# CortexPrism Email Plugin

Generic email integration for Cortex agents — send via SMTP, read via IMAP. Works with **Gmail**,
**Outlook**, **Yahoo**, **ProtonMail** (Bridge), and any other email provider that supports
SMTP/IMAP.

> **Note:** Gmail-specific mail, calendar, drive, and docs tools are available in
> `cortex-plugin-google`. This plugin focuses on generic email connectivity via standard protocols.

## Features

| Tool                     | Description                                            | Protocol |
| ------------------------ | ------------------------------------------------------ | -------- |
| `email_list`             | List emails from any IMAP mailbox                      | IMAP     |
| `email_get`              | Get a specific email by UID with full headers and body | IMAP     |
| `email_send`             | Send email via any SMTP server                         | SMTP     |
| `email_draft`            | Create a draft email (RFC 2822 preview, no send)       | —        |
| `email_summarize_thread` | Summarize an email thread by subject search            | IMAP     |
| `email_extract_actions`  | Extract action items from email bodies                 | IMAP     |

## Installation

```bash
# From marketplace
cortex plugin install marketplace:cortex-plugin-email

# From GitHub
cortex plugin install github:CortexPrism/cortex-plugin-email

# Local installation (for development)
cortex plugin install ./manifest.json
```

## Configuration

Configure your SMTP and IMAP credentials in Cortex settings:

```json
{
  "plugins": {
    "cortex-plugin-email": {
      "enabled": true,
      "config": {
        "smtpHost": "smtp.gmail.com",
        "smtpPort": 587,
        "smtpUser": "your.email@gmail.com",
        "smtpPassword": "your-app-password",
        "imapHost": "imap.gmail.com",
        "imapPort": 993,
        "imapUser": "your.email@gmail.com",
        "imapPassword": "your-app-password",
        "fromEmail": "your.email@gmail.com"
      }
    }
  }
}
```

### Provider Quick Reference

| Provider              | SMTP Host               | SMTP Port      | IMAP Host               | IMAP Port |
| --------------------- | ----------------------- | -------------- | ----------------------- | --------- |
| **Gmail**             | `smtp.gmail.com`        | 587 (STARTTLS) | `imap.gmail.com`        | 993 (TLS) |
| **Outlook / Hotmail** | `smtp-mail.outlook.com` | 587 (STARTTLS) | `outlook.office365.com` | 993 (TLS) |
| **Yahoo Mail**        | `smtp.mail.yahoo.com`   | 587 (STARTTLS) | `imap.mail.yahoo.com`   | 993 (TLS) |
| **ProtonMail Bridge** | `127.0.0.1`             | 1025           | `127.0.0.1`             | 1143      |
| **iCloud Mail**       | `smtp.mail.me.com`      | 587 (STARTTLS) | `imap.mail.me.com`      | 993 (TLS) |

**App Passwords:** Most providers require an app-specific password instead of your regular password.
Check your provider's security settings.

## Quick Start

```bash
# List your inbox
cortex tool call email_list '{"max_results": 5}'

# Search for emails
cortex tool call email_list '{"query": "meeting", "max_results": 10}'

# Send an email
cortex tool call email_send '{
  "to": "colleague@company.com",
  "subject": "Meeting tomorrow",
  "body": "Hi, just confirming our 10am meeting."
}'

# Create a draft (preview before sending)
cortex tool call email_draft '{
  "to": "boss@company.com",
  "subject": "Weekly report",
  "body": "Here is this week's update..."
}'

# Use in chat
cortex chat --plugin cortex-plugin-email
```

## Tools

### email_list

List emails from an IMAP mailbox.

**Parameters:**

- `max_results` (number, optional, default: 20) — Maximum emails to return
- `query` (string, optional) — Search query (searches subject and from fields)
- `mailbox` (string, optional) — IMAP folder name (default: `INBOX`)

### email_get

Get a specific email by its IMAP UID.

**Parameters:**

- `email_id` (string, required) — Email UID to retrieve
- `format` (enum, optional) — `full`, `metadata`, or `minimal` (default: `full`)
- `mailbox` (string, optional) — IMAP folder name (default: `INBOX`)

### email_send

Send an email via SMTP.

**Parameters:**

- `to` (string, required) — Recipient(s), comma-separated
- `subject` (string, required) — Email subject
- `body` (string, required) — Email body (plain text or HTML)
- `cc` (string, optional) — CC recipients, comma-separated
- `bcc` (string, optional) — BCC recipients, comma-separated
- `is_html` (boolean, optional, default: false) — Set true if body is HTML

### email_draft

Create a draft email preview (does not send). Returns the RFC 2822 formatted message for review.

**Parameters:**

- `to` (string, required) — Recipient(s)
- `subject` (string, required) — Email subject
- `body` (string, required) — Email body
- `cc` (string, optional) — CC recipients
- `is_html` (boolean, optional, default: false) — Whether body is HTML

### email_summarize_thread

Summarize an email thread by searching for related messages.

**Parameters:**

- `thread_id` (string, required) — Thread identifier (Message-ID or search term)
- `mailbox` (string, optional) — IMAP folder name (default: `INBOX`)

### email_extract_actions

Extract action items from email bodies using content analysis.

**Parameters:**

- `email_ids` (string, required) — Comma-separated email UIDs to analyze
- `mailbox` (string, optional) — IMAP folder name (default: `INBOX`)

## Requirements

- **SMTP** credentials for sending emails
- **IMAP** credentials for reading/searching emails
- Network access to your email provider's servers
- For Gmail: enable "Less secure app access" or use an App Password

## Development

```bash
# Run tests
deno task test

# Format code
deno fmt

# Lint
deno lint

# Validate
deno task validate
```

## Project Structure

```
cortex-plugin-email/
├── manifest.json     # Plugin manifest with 6 tool definitions
├── mod.ts           # Main entry — email tools (list, get, send, draft, summarize, extract)
├── smtp.ts          # SMTP client — send email via TLS/STARTTLS with AUTH LOGIN
├── imap.ts          # IMAP client — list, search, fetch emails via TLS
├── types.ts         # TypeScript type definitions
├── test/            # Unit tests
├── README.md        # This file
└── CHANGELOG.md     # Version history
```

## License

MIT

## Support

- [Plugin Development Guide](../docs/developing.md)
- [Discord Community](https://discord.gg/y7DkaEbPQC)
