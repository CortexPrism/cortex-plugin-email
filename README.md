# Email Agent (Gmail/Outlook)

Read, draft, send, and organize emails via Gmail API.

## Installation

```bash
cortex plugin install github:CortexPrism/cortex-plugin-email
```

## Tools

### email_list

List emails from Gmail inbox.

- `max_results` (number, default: 20) — Maximum results
- `query` (string, optional) — Gmail search query
- `label` (string, optional) — Label filter

### email_get

Get a specific email by ID.

- `email_id` (string, required) — Email ID
- `format` (enum: full, metadata, minimal, default: full) — Response format

### email_send

Send an email.

- `to` (string, required) — Recipient
- `subject` (string, required) — Subject line
- `body` (string, required) — Email body
- `cc` (string, optional) — CC recipients
- `bcc` (string, optional) — BCC recipients
- `is_html` (boolean, default: false) — HTML body

### email_draft

Create a draft email.

- `to` (string, required) — Recipient
- `subject` (string, required) — Subject line
- `body` (string, required) — Email body

### email_summarize_thread

Summarize an email thread.

- `thread_id` (string, required) — Thread ID

### email_extract_actions

Extract action items from emails.

- `email_ids` (string, required) — Comma-separated email IDs

## Configuration

Configure Gmail API credentials in the plugin settings:

| Field             | Type   | Required | Description                          |
| ----------------- | ------ | -------- | ------------------------------------ |
| gmailClientId     | text   | Yes      | Google Cloud OAuth 2.0 client ID     |
| gmailClientSecret | secret | Yes      | Google Cloud OAuth 2.0 client secret |
| gmailRefreshToken | secret | Yes      | Gmail API refresh token              |

## License

MIT
