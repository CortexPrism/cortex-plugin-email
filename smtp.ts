/**
 * SMTP client for sending emails via any SMTP server.
 *
 * Supports:
 * - TLS connections (465) and STARTTLS upgrades (587)
 * - AUTH LOGIN and AUTH PLAIN
 * - Plain text and HTML messages
 * - CC and BCC recipients
 */

import type { EmailConnectionConfig } from './types.ts';

/** Error class for SMTP-level failures */
export class SmtpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmtpError';
  }
}

/**
 * Parse config for SMTP connection parameters.
 */
export function getSmtpConfig(config: Record<string, unknown>): EmailConnectionConfig {
  const host = config.smtpHost as string;
  const port = config.smtpPort as number ?? 587;
  const user = config.smtpUser as string;
  const password = config.smtpPassword as string;
  const fromEmail = (config.fromEmail as string) || user;

  if (!host || !user || !password) {
    throw new SmtpError(
      'SMTP not configured. Set smtpHost, smtpUser, and smtpPassword in plugin config.',
    );
  }

  return { host, port, user, password, fromEmail };
}

/** Read a line from a TLS connection (up to \r\n or \n). */
async function readLine(conn: Deno.TcpConn | Deno.TlsConn): Promise<string> {
  const buffer = new Uint8Array(1024);
  const parts: string[] = [];
  while (true) {
    const n = await conn.read(buffer);
    if (n === null) throw new SmtpError('Connection closed unexpectedly');
    const chunk = new TextDecoder().decode(buffer.subarray(0, n));
    parts.push(chunk);
    // Check for end of line
    if (chunk.includes('\r\n') || chunk.includes('\n')) break;
  }
  return parts.join('');
}

/** Write a line to the TLS connection. */
async function writeLine(conn: Deno.TcpConn | Deno.TlsConn, line: string): Promise<void> {
  const data = new TextEncoder().encode(line + '\r\n');
  await conn.write(data);
}

/** Base64 encode a string for SMTP AUTH. */
function b64(s: string): string {
  return btoa(s);
}

/**
 * Send an email via SMTP.
 *
 * @returns The SMTP server response (message ID if available).
 */
export async function sendEmail(
  config: EmailConnectionConfig,
  to: string,
  subject: string,
  body: string,
  options: {
    cc?: string;
    bcc?: string;
    isHtml?: boolean;
  } = {},
): Promise<string> {
  const { host, port, user, password, fromEmail } = config;
  const { cc, bcc, isHtml } = options;

  // Connect with TLS (either direct on 465 or STARTTLS on 587)
  const useStartTls = port === 587 || port === 25;
  let conn: Deno.TcpConn | Deno.TlsConn;

  if (useStartTls) {
    // Plain TCP first, then upgrade via STARTTLS
    conn = await Deno.connect({ hostname: host, port });
  } else {
    // Direct TLS (typically port 465)
    conn = await Deno.connectTls({ hostname: host, port });
  }

  try {
    // Read server greeting
    const greeting = await readLine(conn);
    if (!greeting.startsWith('220')) {
      throw new SmtpError(`SMTP server rejected connection: ${greeting.trim()}`);
    }

    // EHLO
    await writeLine(conn, `EHLO cortex-plugin-email`);
    const ehloResponse = await readMultiline(conn);
    if (!ehloResponse.includes('250 ')) {
      // Try HELO as fallback
      await writeLine(conn, `HELO cortex-plugin-email`);
      const heloResponse = await readMultiline(conn);
      if (!heloResponse.includes('250 ')) {
        throw new SmtpError(`SMTP EHLO/HELO failed: ${heloResponse.trim()}`);
      }
    }

    // STARTTLS if needed
    if (useStartTls) {
      await writeLine(conn, 'STARTTLS');
      const startTlsResponse = await readLine(conn);
      if (!startTlsResponse.startsWith('220')) {
        throw new SmtpError(`STARTTLS failed: ${startTlsResponse.trim()}`);
      }
      // Upgrade to TLS
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: host });
      // Re-send EHLO after TLS upgrade
      await writeLine(conn, `EHLO cortex-plugin-email`);
      const ehlo2 = await readMultiline(conn);
      if (!ehlo2.includes('250 ')) {
        throw new SmtpError(`SMTP EHLO after STARTTLS failed: ${ehlo2.trim()}`);
      }
    }

    // AUTH LOGIN
    await writeLine(conn, `AUTH LOGIN`);
    const authPrompt1 = await readLine(conn);
    if (!authPrompt1.startsWith('334')) {
      throw new SmtpError(`SMTP AUTH failed (username prompt): ${authPrompt1.trim()}`);
    }
    await writeLine(conn, b64(user));
    const authPrompt2 = await readLine(conn);
    if (!authPrompt2.startsWith('334')) {
      throw new SmtpError(`SMTP AUTH failed (password prompt): ${authPrompt2.trim()}`);
    }
    await writeLine(conn, b64(password));
    const authResult = await readLine(conn);
    if (!authResult.startsWith('235')) {
      throw new SmtpError(
        `SMTP authentication failed: ${authResult.trim()}. Check your username/password.`,
      );
    }

    // MAIL FROM
    await writeLine(conn, `MAIL FROM:<${fromEmail}>`);
    const mailFromResponse = await readLine(conn);
    if (!mailFromResponse.startsWith('250')) {
      throw new SmtpError(`MAIL FROM rejected: ${mailFromResponse.trim()}`);
    }

    // RCPT TO (add all recipients)
    const allRecipients = [to];
    if (cc) allRecipients.push(...cc.split(',').map((s) => s.trim()));
    if (bcc) allRecipients.push(...bcc.split(',').map((s) => s.trim()));

    for (const rcpt of allRecipients) {
      if (!rcpt) continue;
      await writeLine(conn, `RCPT TO:<${rcpt}>`);
      const rcptResponse = await readLine(conn);
      if (!rcptResponse.startsWith('250')) {
        throw new SmtpError(`RCPT TO rejected for ${rcpt}: ${rcptResponse.trim()}`);
      }
    }

    // DATA
    await writeLine(conn, 'DATA');
    const dataPrompt = await readLine(conn);
    if (!dataPrompt.startsWith('354')) {
      throw new SmtpError(`DATA command failed: ${dataPrompt.trim()}`);
    }

    // Build email headers and body
    const contentType = isHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
    const headers = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: ${contentType}`,
      `X-Mailer: CortexPrism-EmailPlugin/1.0`,
    ];
    if (cc) headers.push(`Cc: ${cc}`);
    const date = new Date().toUTCString();
    headers.push(`Date: ${date}`);

    // Message-ID
    const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${host}>`;
    headers.push(`Message-ID: ${msgId}`);

    const message = headers.join('\r\n') + '\r\n\r\n' + body;

    // Write message with dot-stuffing
    const messageLines = message.split('\r\n');
    for (const line of messageLines) {
      // Dot-stuffing: if line starts with ".", add an extra "."
      if (line.startsWith('.')) {
        await writeLine(conn, '.' + line);
      } else {
        await writeLine(conn, line);
      }
    }
    // End data with "."
    await writeLine(conn, '.');
    const dataResult = await readLine(conn);
    if (!dataResult.startsWith('250')) {
      throw new SmtpError(`SMTP data transfer failed: ${dataResult.trim()}`);
    }

    // QUIT
    await writeLine(conn, 'QUIT');
    await readLine(conn);

    return msgId;
  } finally {
    try {
      conn.close();
    } catch {
      // Ignore close errors
    }
  }
}

/** Read multi-line SMTP response (until 250, 235, etc.). */
async function readMultiline(conn: Deno.TcpConn | Deno.TlsConn): Promise<string> {
  const lines: string[] = [];
  while (true) {
    const line = await readLine(conn);
    lines.push(line.trim());
    // Multi-line responses have '-' after the code; last line has ' '
    if (line.length >= 4 && line[3] === ' ') break;
  }
  return lines.join('\n');
}
