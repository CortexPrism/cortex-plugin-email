import type { PluginContext, Tool, ToolCallResult, ToolContext } from './types.ts';

let pluginConfig: Record<string, unknown> = {};

export async function onLoad(ctx: PluginContext): Promise<void> {
  pluginConfig = await ctx.config.get() as Record<string, unknown>;
}

export async function onUnload(_ctx: PluginContext): Promise<void> {}

const emailListTool: Tool = {
  definition: {
    name: 'email_list',
    description: 'List emails',
    params: [
      {
        name: 'max_results',
        type: 'number',
        description: 'Maximum number of emails to return',
        required: false,
        default: 20,
      },
      { name: 'query', type: 'string', description: 'Gmail search query', required: false },
      { name: 'label', type: 'string', description: 'Gmail label to filter by', required: false },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const maxResults = (args.max_results as number) ?? 20;
      const query = args.query as string | undefined;
      const label = args.label as string | undefined;

      if (typeof maxResults !== 'number' || maxResults < 1) {
        return {
          toolName: 'email_list',
          success: false,
          output: '',
          error: 'max_results must be a positive number',
          durationMs: Date.now() - start,
        };
      }

      const clientId = pluginConfig.gmailClientId as string;
      const clientSecret = pluginConfig.gmailClientSecret as string;
      const refreshToken = pluginConfig.gmailRefreshToken as string;

      if (!clientId || !clientSecret || !refreshToken) {
        return {
          toolName: 'email_list',
          success: false,
          output: '',
          error:
            'Gmail API not configured. Set gmailClientId, gmailClientSecret, and gmailRefreshToken.',
          durationMs: Date.now() - start,
        };
      }

      const params = new URLSearchParams();
      params.set('maxResults', String(maxResults));
      if (query) params.set('q', query);
      if (label) params.set('labelIds', label);

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
        { headers: { Authorization: `Bearer ${refreshToken}` } },
      );

      if (!response.ok) {
        return {
          toolName: 'email_list',
          success: false,
          output: '',
          error: `Gmail API error: ${response.status}`,
          durationMs: Date.now() - start,
        };
      }

      const data = await response.json();
      return {
        toolName: 'email_list',
        success: true,
        output: JSON.stringify(data),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'email_list',
        success: false,
        output: '',
        error: `Failed to list emails: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const emailGetTool: Tool = {
  definition: {
    name: 'email_get',
    description: 'Get a specific email by ID',
    params: [
      { name: 'email_id', type: 'string', description: 'The email ID to retrieve', required: true },
      {
        name: 'format',
        type: 'string',
        description: 'Email format to return',
        required: false,
        enum: ['full', 'metadata', 'minimal'],
        default: 'full',
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const emailId = args.email_id as string;
      if (!emailId) {
        return {
          toolName: 'email_get',
          success: false,
          output: '',
          error: 'email_id is required',
          durationMs: Date.now() - start,
        };
      }

      const format = (args.format as string) ?? 'full';
      if (!['full', 'metadata', 'minimal'].includes(format)) {
        return {
          toolName: 'email_get',
          success: false,
          output: '',
          error: 'format must be one of: full, metadata, minimal',
          durationMs: Date.now() - start,
        };
      }

      const refreshToken = pluginConfig.gmailRefreshToken as string;
      if (!refreshToken) {
        return {
          toolName: 'email_get',
          success: false,
          output: '',
          error: 'Gmail API not configured',
          durationMs: Date.now() - start,
        };
      }

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${
          encodeURIComponent(emailId)
        }?format=${format}`,
        { headers: { Authorization: `Bearer ${refreshToken}` } },
      );

      if (!response.ok) {
        return {
          toolName: 'email_get',
          success: false,
          output: '',
          error: `Gmail API error: ${response.status}`,
          durationMs: Date.now() - start,
        };
      }

      const data = await response.json();
      return {
        toolName: 'email_get',
        success: true,
        output: JSON.stringify(data),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'email_get',
        success: false,
        output: '',
        error: `Failed to get email: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const emailSendTool: Tool = {
  definition: {
    name: 'email_send',
    description: 'Send an email',
    params: [
      { name: 'to', type: 'string', description: 'Recipient email address', required: true },
      { name: 'subject', type: 'string', description: 'Email subject', required: true },
      { name: 'body', type: 'string', description: 'Email body content', required: true },
      { name: 'cc', type: 'string', description: 'CC recipients', required: false },
      { name: 'bcc', type: 'string', description: 'BCC recipients', required: false },
      {
        name: 'is_html',
        type: 'boolean',
        description: 'Whether body is HTML',
        required: false,
        default: false,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const to = args.to as string;
      const subject = args.subject as string;
      const body = args.body as string;

      if (!to || !subject || !body) {
        return {
          toolName: 'email_send',
          success: false,
          output: '',
          error: 'to, subject, and body are required',
          durationMs: Date.now() - start,
        };
      }

      const refreshToken = pluginConfig.gmailRefreshToken as string;
      if (!refreshToken) {
        return {
          toolName: 'email_send',
          success: false,
          output: '',
          error: 'Gmail API not configured',
          durationMs: Date.now() - start,
        };
      }

      const isHtml = (args.is_html as boolean) ?? false;
      const cc = args.cc as string | undefined;
      const bcc = args.bcc as string | undefined;

      const emailParts = [
        `From: me`,
        `To: ${to}`,
        `Subject: ${subject}`,
      ];
      if (cc) emailParts.push(`Cc: ${cc}`);
      if (bcc) emailParts.push(`Bcc: ${bcc}`);
      emailParts.push(
        'Content-Type: ' + (isHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'),
      );
      emailParts.push('MIME-Version: 1.0');
      emailParts.push('');
      emailParts.push(body);

      const raw = btoa(unescape(encodeURIComponent(emailParts.join('\r\n'))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${refreshToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw }),
        },
      );

      if (!response.ok) {
        return {
          toolName: 'email_send',
          success: false,
          output: '',
          error: `Gmail API error: ${response.status}`,
          durationMs: Date.now() - start,
        };
      }

      const data = await response.json();
      return {
        toolName: 'email_send',
        success: true,
        output: JSON.stringify(data),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'email_send',
        success: false,
        output: '',
        error: `Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const emailDraftTool: Tool = {
  definition: {
    name: 'email_draft',
    description: 'Create a draft email',
    params: [
      { name: 'to', type: 'string', description: 'Recipient email address', required: true },
      { name: 'subject', type: 'string', description: 'Email subject', required: true },
      { name: 'body', type: 'string', description: 'Email body content', required: true },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const to = args.to as string;
      const subject = args.subject as string;
      const body = args.body as string;

      if (!to || !subject || !body) {
        return {
          toolName: 'email_draft',
          success: false,
          output: '',
          error: 'to, subject, and body are required',
          durationMs: Date.now() - start,
        };
      }

      const refreshToken = pluginConfig.gmailRefreshToken as string;
      if (!refreshToken) {
        return {
          toolName: 'email_draft',
          success: false,
          output: '',
          error: 'Gmail API not configured',
          durationMs: Date.now() - start,
        };
      }

      const emailParts = [
        `From: me`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        body,
      ];

      const raw = btoa(unescape(encodeURIComponent(emailParts.join('\r\n'))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${refreshToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { raw } }),
        },
      );

      if (!response.ok) {
        return {
          toolName: 'email_draft',
          success: false,
          output: '',
          error: `Gmail API error: ${response.status}`,
          durationMs: Date.now() - start,
        };
      }

      const data = await response.json();
      return {
        toolName: 'email_draft',
        success: true,
        output: JSON.stringify(data),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'email_draft',
        success: false,
        output: '',
        error: `Failed to create draft: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const emailSummarizeThreadTool: Tool = {
  definition: {
    name: 'email_summarize_thread',
    description: 'Summarize an email thread',
    params: [
      {
        name: 'thread_id',
        type: 'string',
        description: 'The thread ID to summarize',
        required: true,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const threadId = args.thread_id as string;
      if (!threadId) {
        return {
          toolName: 'email_summarize_thread',
          success: false,
          output: '',
          error: 'thread_id is required',
          durationMs: Date.now() - start,
        };
      }

      const refreshToken = pluginConfig.gmailRefreshToken as string;
      if (!refreshToken) {
        return {
          toolName: 'email_summarize_thread',
          success: false,
          output: '',
          error: 'Gmail API not configured',
          durationMs: Date.now() - start,
        };
      }

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`,
        { headers: { Authorization: `Bearer ${refreshToken}` } },
      );

      if (!response.ok) {
        return {
          toolName: 'email_summarize_thread',
          success: false,
          output: '',
          error: `Gmail API error: ${response.status}`,
          durationMs: Date.now() - start,
        };
      }

      const data = await response.json();
      const messages = data.messages || [];
      const subjects = messages.map((m: Record<string, unknown>) => {
        const headers =
          (m.payload as Record<string, unknown>)?.headers as Array<Record<string, string>> || [];
        const subject = headers.find((h) => h.name === 'Subject');
        return subject?.value || '(no subject)';
      });

      const summary = `Thread contains ${messages.length} messages. Subjects: ${
        subjects.join(' | ')
      }`;

      return {
        toolName: 'email_summarize_thread',
        success: true,
        output: summary,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'email_summarize_thread',
        success: false,
        output: '',
        error: `Failed to summarize thread: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const emailExtractActionsTool: Tool = {
  definition: {
    name: 'email_extract_actions',
    description: 'Extract action items from emails',
    params: [
      {
        name: 'email_ids',
        type: 'string',
        description: 'Comma-separated email IDs',
        required: true,
      },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const emailIds = args.email_ids as string;
      if (!emailIds) {
        return {
          toolName: 'email_extract_actions',
          success: false,
          output: '',
          error: 'email_ids is required',
          durationMs: Date.now() - start,
        };
      }

      const refreshToken = pluginConfig.gmailRefreshToken as string;
      if (!refreshToken) {
        return {
          toolName: 'email_extract_actions',
          success: false,
          output: '',
          error: 'Gmail API not configured',
          durationMs: Date.now() - start,
        };
      }

      const ids = emailIds.split(',').map((id) => id.trim()).filter(Boolean);

      if (ids.length === 0) {
        return {
          toolName: 'email_extract_actions',
          success: false,
          output: '',
          error: 'No valid email IDs provided',
          durationMs: Date.now() - start,
        };
      }

      const results: string[] = [];
      for (const id of ids) {
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`,
          { headers: { Authorization: `Bearer ${refreshToken}` } },
        );

        if (response.ok) {
          const data = await response.json();
          const snippet = data.snippet || '';
          if (snippet) {
            results.push(`[${id}]: ${snippet}`);
          }
        }
      }

      if (results.length === 0) {
        return {
          toolName: 'email_extract_actions',
          success: true,
          output: 'No action items found in the specified emails.',
          durationMs: Date.now() - start,
        };
      }

      const output = results.map((r, i) => `${i + 1}. ${r}`).join('\n');
      return {
        toolName: 'email_extract_actions',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'email_extract_actions',
        success: false,
        output: '',
        error: `Failed to extract actions: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export const tools: Tool[] = [
  emailListTool,
  emailGetTool,
  emailSendTool,
  emailDraftTool,
  emailSummarizeThreadTool,
  emailExtractActionsTool,
];
