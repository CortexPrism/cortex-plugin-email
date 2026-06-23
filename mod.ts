/**
 * CortexPrism Generic Email Plugin
 *
 * Send, receive, and manage emails via any SMTP/IMAP-compatible provider.
 *
 * Works with: Gmail, Outlook, Yahoo, ProtonMail (Bridge), custom SMTP/IMAP servers,
 * and any other email provider that supports SMTP sending and IMAP reading.
 *
 * ## Configuration
 *
 * ```json
 * {
 *   "plugins": {
 *     "cortex-plugin-email": {
 *       "enabled": true,
 *       "config": {
 *         "smtpHost": "smtp.gmail.com",
 *         "smtpPort": 587,
 *         "smtpUser": "your.email@gmail.com",
 *         "smtpPassword": "your-app-password",
 *         "imapHost": "imap.gmail.com",
 *         "imapPort": 993,
 *         "imapUser": "your.email@gmail.com",
 *         "imapPassword": "your-app-password",
 *         "fromEmail": "your.email@gmail.com"
 *       }
 *     }
 *   }
 * }
 * ```
 */

import type { PluginContext, Tool, ToolCallResult } from "cortex/plugins";
import { getSmtpConfig, sendEmail } from "./smtp.ts";
import { getEmail, getImapConfig, listEmails, searchEmails } from "./imap.ts";

let pluginConfig: Record<string, unknown> = {};

export async function onLoad(ctx: PluginContext): Promise<void> {
  await ctx.logger.info("[cortex-plugin-email] Loading generic email plugin");
  pluginConfig = await ctx.config.get("email") as Record<string, unknown> || {};
  await ctx.logger.info(
    "[cortex-plugin-email] Loaded — supports any SMTP/IMAP provider",
  );
}

export function onUnload(_ctx: PluginContext): void {
  // No cleanup needed
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function durationMs(start: number): number {
  return Date.now() - start;
}

// ---------------------------------------------------------------------------
// email_list
// ---------------------------------------------------------------------------

const emailListTool: Tool = {
  definition: {
    name: "email_list",
    description: "List emails from the configured IMAP mailbox",
    params: [
      {
        name: "max_results",
        type: "number",
        description: "Maximum number of emails to return",
        required: false,
        default: 20,
      },
      {
        name: "query",
        type: "string",
        description: "Search query (searches subject and from fields)",
        required: false,
      },
      {
        name: "mailbox",
        type: "string",
        description: "IMAP mailbox/folder name (default: INBOX)",
        required: false,
      },
    ],
    capabilities: ["network:fetch"],
  },
  execute: async (
    args: Record<string, unknown>,
    _ctx: PluginContext,
  ): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const maxResults = (args.max_results as number) ?? 20;
      const query = args.query as string | undefined;
      const mailbox = (args.mailbox as string) || undefined;

      if (typeof maxResults !== "number" || maxResults < 1) {
        return {
          toolName: "email_list",
          success: false,
          output: "",
          error: "max_results must be a positive number",
          durationMs: durationMs(start),
        };
      }

      let config;
      try {
        config = getImapConfig(pluginConfig);
      } catch (e) {
        return {
          toolName: "email_list",
          success: false,
          output: "",
          error: e instanceof Error ? e.message : "IMAP not configured",
          durationMs: durationMs(start),
        };
      }

      if (query && query.trim()) {
        const result = await searchEmails(config, query.trim(), {
          maxResults,
          mailbox,
        });
        return {
          toolName: "email_list",
          success: true,
          output: JSON.stringify(
            { total: result.total, messages: result.messages },
            null,
            2,
          ),
          durationMs: durationMs(start),
        };
      }

      const result = await listEmails(config, { maxResults, mailbox });
      return {
        toolName: "email_list",
        success: true,
        output: JSON.stringify(
          { total: result.total, messages: result.messages },
          null,
          2,
        ),
        durationMs: durationMs(start),
      };
    } catch (error) {
      return {
        toolName: "email_list",
        success: false,
        output: "",
        error: `Failed to list emails: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: durationMs(start),
      };
    }
  },
};

// ---------------------------------------------------------------------------
// email_get
// ---------------------------------------------------------------------------

const emailGetTool: Tool = {
  definition: {
    name: "email_get",
    description: "Get a specific email by UID from the IMAP mailbox",
    params: [
      {
        name: "email_id",
        type: "string",
        description: "Email UID to retrieve",
        required: true,
      },
      {
        name: "format",
        type: "string",
        description: "Response format",
        required: false,
        enum: ["full", "metadata", "minimal"],
        default: "full",
      },
      {
        name: "mailbox",
        type: "string",
        description: "IMAP mailbox/folder name (default: INBOX)",
        required: false,
      },
    ],
    capabilities: ["network:fetch"],
  },
  execute: async (
    args: Record<string, unknown>,
    _ctx: PluginContext,
  ): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const emailId = args.email_id as string;
      if (!emailId) {
        return {
          toolName: "email_get",
          success: false,
          output: "",
          error: "email_id is required",
          durationMs: durationMs(start),
        };
      }

      const format = (args.format as string) ?? "full";
      if (!["full", "metadata", "minimal"].includes(format)) {
        return {
          toolName: "email_get",
          success: false,
          output: "",
          error: "format must be one of: full, metadata, minimal",
          durationMs: durationMs(start),
        };
      }

      const mailbox = (args.mailbox as string) || undefined;

      let config;
      try {
        config = getImapConfig(pluginConfig);
      } catch (e) {
        return {
          toolName: "email_get",
          success: false,
          output: "",
          error: e instanceof Error ? e.message : "IMAP not configured",
          durationMs: durationMs(start),
        };
      }

      const message = await getEmail(config, emailId, mailbox);
      if (!message) {
        return {
          toolName: "email_get",
          success: false,
          output: "",
          error: `Email not found: ${emailId}`,
          durationMs: durationMs(start),
        };
      }

      if (format === "minimal") {
        return {
          toolName: "email_get",
          success: true,
          output: JSON.stringify(
            {
              uid: message.uid,
              subject: message.subject,
              from: message.from,
              date: message.date,
              flags: message.flags,
            },
            null,
            2,
          ),
          durationMs: durationMs(start),
        };
      }

      if (format === "metadata") {
        return {
          toolName: "email_get",
          success: true,
          output: JSON.stringify(
            {
              uid: message.uid,
              subject: message.subject,
              from: message.from,
              to: message.to,
              cc: message.cc,
              date: message.date,
              flags: message.flags,
              headers: message.headers,
            },
            null,
            2,
          ),
          durationMs: durationMs(start),
        };
      }

      // Full format
      return {
        toolName: "email_get",
        success: true,
        output: JSON.stringify(message, null, 2),
        durationMs: durationMs(start),
      };
    } catch (error) {
      return {
        toolName: "email_get",
        success: false,
        output: "",
        error: `Failed to get email: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: durationMs(start),
      };
    }
  },
};

// ---------------------------------------------------------------------------
// email_send
// ---------------------------------------------------------------------------

const emailSendTool: Tool = {
  definition: {
    name: "email_send",
    description: "Send an email via SMTP",
    params: [
      {
        name: "to",
        type: "string",
        description: "Recipient email address(es), comma-separated",
        required: true,
      },
      {
        name: "subject",
        type: "string",
        description: "Email subject",
        required: true,
      },
      {
        name: "body",
        type: "string",
        description: "Email body content (plain text or HTML)",
        required: true,
      },
      {
        name: "cc",
        type: "string",
        description: "CC recipients, comma-separated",
        required: false,
      },
      {
        name: "bcc",
        type: "string",
        description: "BCC recipients, comma-separated",
        required: false,
      },
      {
        name: "is_html",
        type: "boolean",
        description: "Whether body is HTML",
        required: false,
        default: false,
      },
    ],
    capabilities: ["network:fetch"],
  },
  execute: async (
    args: Record<string, unknown>,
    _ctx: PluginContext,
  ): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const to = args.to as string;
      const subject = args.subject as string;
      const body = args.body as string;

      if (!to || !subject || !body) {
        return {
          toolName: "email_send",
          success: false,
          output: "",
          error: "to, subject, and body are all required",
          durationMs: durationMs(start),
        };
      }

      let config;
      try {
        config = getSmtpConfig(pluginConfig);
      } catch (e) {
        return {
          toolName: "email_send",
          success: false,
          output: "",
          error: e instanceof Error ? e.message : "SMTP not configured",
          durationMs: durationMs(start),
        };
      }

      const isHtml = args.is_html === true;
      const cc = args.cc as string | undefined;
      const bcc = args.bcc as string | undefined;

      const msgId = await sendEmail(config, to, subject, body, {
        cc,
        bcc,
        isHtml,
      });

      return {
        toolName: "email_send",
        success: true,
        output: JSON.stringify(
          {
            messageId: msgId,
            to,
            subject,
            sent: true,
          },
          null,
          2,
        ),
        durationMs: durationMs(start),
      };
    } catch (error) {
      return {
        toolName: "email_send",
        success: false,
        output: "",
        error: `Failed to send email: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: durationMs(start),
      };
    }
  },
};

// ---------------------------------------------------------------------------
// email_draft
// ---------------------------------------------------------------------------

const emailDraftTool: Tool = {
  definition: {
    name: "email_draft",
    description:
      "Create a draft email (returns the RFC 2822 message for review; does not send)",
    params: [
      {
        name: "to",
        type: "string",
        description: "Recipient email address(es)",
        required: true,
      },
      {
        name: "subject",
        type: "string",
        description: "Email subject",
        required: true,
      },
      {
        name: "body",
        type: "string",
        description: "Email body content",
        required: true,
      },
      {
        name: "cc",
        type: "string",
        description: "CC recipients",
        required: false,
      },
      {
        name: "is_html",
        type: "boolean",
        description: "Whether body is HTML",
        required: false,
        default: false,
      },
    ],
    capabilities: [],
  },
  execute: (
    args: Record<string, unknown>,
    _ctx: PluginContext,
  ): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const to = args.to as string;
      const subject = args.subject as string;
      const body = args.body as string;

      if (!to || !subject || !body) {
        return Promise.resolve({
          toolName: "email_draft",
          success: false,
          output: "",
          error: "to, subject, and body are all required",
          durationMs: durationMs(start),
        });
      }

      const isHtml = args.is_html === true;
      const cc = args.cc as string | undefined;
      const contentType = isHtml
        ? "text/html; charset=utf-8"
        : "text/plain; charset=utf-8";

      const fromEmail = (pluginConfig.fromEmail as string) ||
        pluginConfig.smtpUser as string ||
        "draft@local";

      // Build RFC 2822 draft
      const headers: string[] = [
        `From: ${fromEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: ${contentType}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: <draft.${Date.now()}.${
          Math.random().toString(36).slice(2)
        }@local>`,
        `X-Cortex-Draft: true`,
      ];
      if (cc) headers.push(`Cc: ${cc}`);

      const draft = headers.join("\r\n") + "\r\n\r\n" + body;

      return Promise.resolve({
        toolName: "email_draft",
        success: true,
        output: JSON.stringify(
          {
            draft: true,
            to,
            subject,
            cc: cc || null,
            isHtml,
            rfc2822: draft,
            note: "This is a draft preview. Use email_send to send.",
          },
          null,
          2,
        ),
        durationMs: durationMs(start),
      });
    } catch (error) {
      return Promise.resolve({
        toolName: "email_draft",
        success: false,
        output: "",
        error: `Failed to create draft: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: durationMs(start),
      });
    }
  },
};

// ---------------------------------------------------------------------------
// email_summarize_thread
// ---------------------------------------------------------------------------

const emailSummarizeThreadTool: Tool = {
  definition: {
    name: "email_summarize_thread",
    description:
      "Fetch all emails in a thread by searching for related messages (by subject similarity)",
    params: [
      {
        name: "thread_id",
        type: "string",
        description:
          "Thread identifier (email Message-ID or subject search term)",
        required: true,
      },
      {
        name: "mailbox",
        type: "string",
        description: "IMAP mailbox/folder name (default: INBOX)",
        required: false,
      },
    ],
    capabilities: ["network:fetch"],
  },
  execute: async (
    args: Record<string, unknown>,
    _ctx: PluginContext,
  ): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const threadId = args.thread_id as string;
      if (!threadId) {
        return {
          toolName: "email_summarize_thread",
          success: false,
          output: "",
          error: "thread_id is required",
          durationMs: durationMs(start),
        };
      }

      const mailbox = (args.mailbox as string) || undefined;

      let config;
      try {
        config = getImapConfig(pluginConfig);
      } catch (e) {
        return {
          toolName: "email_summarize_thread",
          success: false,
          output: "",
          error: e instanceof Error ? e.message : "IMAP not configured",
          durationMs: durationMs(start),
        };
      }

      // Search for messages related to this thread ID (by subject or message-id)
      const result = await searchEmails(config, threadId, {
        maxResults: 50,
        mailbox,
      });

      if (result.messages.length === 0) {
        return {
          toolName: "email_summarize_thread",
          success: true,
          output: JSON.stringify(
            {
              threadId,
              messageCount: 0,
              summary: "No messages found matching this thread identifier.",
            },
            null,
            2,
          ),
          durationMs: durationMs(start),
        };
      }

      // Build a summary
      const subjects = [...new Set(result.messages.map((m) => m.subject))];
      const participants = [...new Set(result.messages.map((m) => m.from))];

      const summary = {
        threadId,
        messageCount: result.total,
        messagesShown: result.messages.length,
        subjects,
        participants,
        dateRange: result.messages.length > 0
          ? {
            earliest: result.messages[result.messages.length - 1]?.date ||
              "unknown",
            latest: result.messages[0]?.date || "unknown",
          }
          : null,
        messages: result.messages.map((m) => ({
          uid: m.uid,
          from: m.from,
          subject: m.subject,
          date: m.date,
          flags: m.flags,
        })),
      };

      return {
        toolName: "email_summarize_thread",
        success: true,
        output: JSON.stringify(summary, null, 2),
        durationMs: durationMs(start),
      };
    } catch (error) {
      return {
        toolName: "email_summarize_thread",
        success: false,
        output: "",
        error: `Failed to summarize thread: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: durationMs(start),
      };
    }
  },
};

// ---------------------------------------------------------------------------
// email_extract_actions
// ---------------------------------------------------------------------------

const emailExtractActionsTool: Tool = {
  definition: {
    name: "email_extract_actions",
    description: "Extract action items from email bodies",
    params: [
      {
        name: "email_ids",
        type: "string",
        description: "Comma-separated email UIDs to analyze",
        required: true,
      },
      {
        name: "mailbox",
        type: "string",
        description: "IMAP mailbox/folder name (default: INBOX)",
        required: false,
      },
    ],
    capabilities: ["network:fetch"],
  },
  execute: async (
    args: Record<string, unknown>,
    _ctx: PluginContext,
  ): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const emailIds = args.email_ids as string;
      if (!emailIds) {
        return {
          toolName: "email_extract_actions",
          success: false,
          output: "",
          error: "email_ids is required",
          durationMs: durationMs(start),
        };
      }

      const mailbox = (args.mailbox as string) || undefined;

      let config;
      try {
        config = getImapConfig(pluginConfig);
      } catch (e) {
        return {
          toolName: "email_extract_actions",
          success: false,
          output: "",
          error: e instanceof Error ? e.message : "IMAP not configured",
          durationMs: durationMs(start),
        };
      }

      const ids = emailIds.split(",").map((id) => id.trim()).filter(Boolean);

      if (ids.length === 0) {
        return {
          toolName: "email_extract_actions",
          success: false,
          output: "",
          error: "No valid email IDs provided",
          durationMs: durationMs(start),
        };
      }

      const results: string[] = [];
      for (const id of ids) {
        try {
          const message = await getEmail(config, id, mailbox);
          if (message) {
            const snippet = message.snippet || "(no content)";
            const actionItems: string[] = [];

            // Basic heuristic: look for action-oriented phrases
            const body = message.body || "";
            const lines = body.split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (
                /please\s+\w+/i.test(trimmed) ||
                /could you/i.test(trimmed) ||
                /can you/i.test(trimmed) ||
                /need to/i.test(trimmed) ||
                /action\s*[:：]/i.test(trimmed) ||
                /todo/i.test(trimmed) ||
                /follow.up/i.test(trimmed) ||
                /remind/i.test(trimmed)
              ) {
                actionItems.push(trimmed.slice(0, 150));
              }
            }

            results.push(
              `[${id}] From: ${message.from} | Subject: ${message.subject}\n` +
                `  Snippet: ${snippet}\n` +
                (actionItems.length > 0
                  ? `  Potential action items:\n    - ${
                    actionItems.join("\n    - ")
                  }\n`
                  : ""),
            );
          }
        } catch {
          results.push(`[${id}]: Failed to fetch`);
        }
      }

      if (results.length === 0) {
        return {
          toolName: "email_extract_actions",
          success: true,
          output: "No action items found in the specified emails.",
          durationMs: durationMs(start),
        };
      }

      return {
        toolName: "email_extract_actions",
        success: true,
        output: results.join("\n---\n"),
        durationMs: durationMs(start),
      };
    } catch (error) {
      return {
        toolName: "email_extract_actions",
        success: false,
        output: "",
        error: `Failed to extract actions: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: durationMs(start),
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const tools: Tool[] = [
  emailListTool,
  emailGetTool,
  emailSendTool,
  emailDraftTool,
  emailSummarizeThreadTool,
  emailExtractActionsTool,
];
