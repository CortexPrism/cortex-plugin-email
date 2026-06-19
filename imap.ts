/**
 * IMAP client for reading emails from any IMAP server.
 *
 * Supports:
 * - TLS connections (993) and STARTTLS upgrades
 * - AUTH LOGIN (plaintext password)
 * - List messages in a folder (INBOX by default)
 * - Fetch full message content by UID
 * - Search messages by query
 */

import type { EmailConnectionConfig } from "./types.ts";

/** Error class for IMAP-level failures */
export class ImapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImapError";
  }
}

/** A parsed email message summary */
export interface EmailSummary {
  uid: string;
  subject: string;
  from: string;
  date: string;
  flags: string[];
  snippet: string;
  seq: number;
}

/** A full email message */
export interface EmailMessage extends EmailSummary {
  to: string;
  cc?: string;
  replyTo?: string;
  body?: string;
  textBody?: string;
  htmlBody?: string;
  headers: Record<string, string>;
}

/**
 * Parse config for IMAP connection parameters.
 */
export function getImapConfig(
  config: Record<string, unknown>,
): EmailConnectionConfig {
  const host = config.imapHost as string;
  const port = config.imapPort as number ?? 993;
  const user = config.imapUser as string;
  const password = config.imapPassword as string;
  const fromEmail = (config.fromEmail as string) || user;

  if (!host || !user || !password) {
    throw new ImapError(
      "IMAP not configured. Set imapHost, imapUser, and imapPassword in plugin config.",
    );
  }

  return { host, port, user, password, fromEmail };
}

// ---- Low-level IMAP protocol ----

let tagCounter = 0;
function nextTag(): string {
  tagCounter++;
  return `A${tagCounter.toString(16).toUpperCase()}`;
}

async function readResponse(
  conn: Deno.TcpConn | Deno.TlsConn,
  tag?: string,
  timeoutMs = 15000,
): Promise<{ lines: string[]; tagResponse?: string }> {
  const lines: string[] = [];
  const buffer = new Uint8Array(4096);
  let partial = "";

  const startTime = Date.now();
  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      throw new ImapError("IMAP response timeout");
    }

    const n = await conn.read(buffer);
    if (n === null) throw new ImapError("IMAP connection closed");

    partial += new TextDecoder().decode(buffer.subarray(0, n));

    // Split into lines
    while (partial.includes("\r\n")) {
      const idx = partial.indexOf("\r\n");
      const line = partial.slice(0, idx);
      partial = partial.slice(idx + 2);
      lines.push(line);

      // If this line starts with the tag, this is the tagged response
      if (tag && line.startsWith(tag)) {
        return { lines, tagResponse: line };
      }

      // If line is a BYE or untagged response with too many lines, still collect
      if (lines.length > 500) {
        return { lines, tagResponse: line };
      }
    }

    // Small sleep to avoid busy waiting
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function writeCommand(
  conn: Deno.TcpConn | Deno.TlsConn,
  command: string,
): Promise<string> {
  const tag = nextTag();
  const data = new TextEncoder().encode(`${tag} ${command}\r\n`);
  await conn.write(data);
  return tag;
}

// ---- High-level IMAP operations ----

/**
 * Connect to an IMAP server, login, and return the connection.
 * The caller must close the connection when done.
 */
export async function connectAndLogin(
  config: EmailConnectionConfig,
  mailbox = "INBOX",
): Promise<Deno.TlsConn> {
  const { host, port, user, password } = config;

  const useStartTls = port === 143;
  let conn: Deno.TcpConn | Deno.TlsConn;

  if (useStartTls) {
    conn = await Deno.connect({ hostname: host, port });
  } else {
    conn = await Deno.connectTls({ hostname: host, port });
  }

  try {
    // Read server greeting
    const greeting = await readResponse(conn);
    if (greeting.lines.length === 0 || !greeting.lines[0]?.startsWith("* OK")) {
      throw new ImapError(
        `IMAP server rejected connection: ${
          greeting.lines[0] || "no greeting"
        }`,
      );
    }

    // STARTTLS if needed
    if (useStartTls) {
      const tag = await writeCommand(conn, "STARTTLS");
      const resp = await readResponse(conn, tag);
      if (!resp.tagResponse?.includes("OK")) {
        throw new ImapError(`IMAP STARTTLS failed: ${resp.tagResponse}`);
      }
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: host });
    }

    // LOGIN
    const loginTag = await writeCommand(
      conn,
      `LOGIN "${escapeStr(user)}" "${escapeStr(password)}"`,
    );
    const loginResp = await readResponse(conn, loginTag);
    if (!loginResp.tagResponse?.includes("OK")) {
      throw new ImapError(
        `IMAP login failed: ${
          loginResp.tagResponse || "authentication error"
        }. Check your username/password.`,
      );
    }

    // SELECT mailbox
    const selectTag = await writeCommand(
      conn,
      `SELECT "${escapeStr(mailbox)}"`,
    );
    const selectResp = await readResponse(conn, selectTag);
    if (!selectResp.tagResponse?.includes("OK")) {
      throw new ImapError(
        `IMAP SELECT ${mailbox} failed: ${selectResp.tagResponse}`,
      );
    }

    return conn as Deno.TlsConn;
  } catch (err) {
    try {
      conn.close();
    } catch { /* ignore */ }
    throw err;
  }
}

/** Escape special characters for IMAP string literals. */
function escapeStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Decode MIME encoded-word (e.g., =?UTF-8?B?...?= or =?UTF-8?Q?...?=) */
function decodeMimeWords(s: string): string {
  return s.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, _charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === "B") {
          return atob(text);
        } else if (encoding.toUpperCase() === "Q") {
          return text.replace(/_/g, " ").replace(
            /=([0-9A-Fa-f]{2})/g,
            (_m: string, hex: string) => String.fromCharCode(parseInt(hex, 16)),
          );
        }
      } catch {
        // Fallback
      }
      return text;
    },
  );
}

/**
 * Parse email headers and body from FETCH BODY[] data.
 * The response format can be complex, so we handle common patterns.
 */
function parseEmailBody(raw: string, msg: Partial<EmailMessage>): void {
  // Split headers from body at first blank line
  const headerEnd = raw.indexOf("\r\n\r\n");
  const headerSection = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw;
  const bodySection = headerEnd >= 0 ? raw.slice(headerEnd + 4) : "";

  // Parse headers
  const headerLines = headerSection.split("\r\n");
  let currentHeader = "";
  for (const line of headerLines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      // Continuation of previous header
      if (currentHeader) {
        const colonIdx = currentHeader.indexOf(":");
        if (colonIdx > 0) {
          const name = currentHeader.slice(0, colonIdx).trim().toLowerCase();
          const value = currentHeader.slice(colonIdx + 1).trim() + " " +
            line.trim();
          msg.headers[name] = value;
        }
        currentHeader = "";
      }
    } else {
      // Process previous header
      if (currentHeader) {
        const colonIdx = currentHeader.indexOf(":");
        if (colonIdx > 0) {
          const name = currentHeader.slice(0, colonIdx).trim().toLowerCase();
          const value = currentHeader.slice(colonIdx + 1).trim();
          msg.headers[name] = value;
        }
      }
      currentHeader = line;
    }
  }
  // Process last header
  if (currentHeader) {
    const colonIdx = currentHeader.indexOf(":");
    if (colonIdx > 0) {
      const name = currentHeader.slice(0, colonIdx).trim().toLowerCase();
      const value = currentHeader.slice(colonIdx + 1).trim();
      msg.headers[name] = value;
    }
  }

  // Set fields from headers
  msg.subject = decodeMimeWords(msg.headers.subject || "");
  msg.from = decodeMimeWords(msg.headers.from || "");
  msg.to = decodeMimeWords(msg.headers.to || "");
  msg.cc = decodeMimeWords(msg.headers.cc || "");
  if (!msg.date) msg.date = msg.headers.date || "";

  // Body text (simplified — strip HTML tags for snippet)
  let text = bodySection;
  // Try to get plain text part if multipart
  const textPlainMatch = bodySection.match(
    /Content-Type:\s*text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|$)/i,
  );
  if (textPlainMatch) {
    text = textPlainMatch[1];
  } else {
    // Strip HTML tags
    text = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  msg.textBody = text;
  msg.snippet = text.slice(0, 200) + (text.length > 200 ? "..." : "");
}

/**
 * List email messages in a mailbox with optional search criteria.
 */
export async function listEmails(
  config: EmailConnectionConfig,
  options: {
    maxResults?: number;
    query?: string;
    mailbox?: string;
  } = {},
): Promise<{ total: number; messages: EmailSummary[] }> {
  const { maxResults = 20, query, mailbox = "INBOX" } = options;
  const conn = await connectAndLogin(config, mailbox);

  try {
    // SEARCH for messages (or fetch all)
    let searchCmd: string;
    if (query && query.trim()) {
      // Build IMAP SEARCH query from user's text query (search in subject/from)
      const escaped = escapeStr(query.trim());
      searchCmd = `SEARCH OR (SUBJECT "${escaped}") (FROM "${escaped}")`;
    } else {
      searchCmd = "SEARCH ALL";
    }

    const searchTag = await writeCommand(conn, searchCmd);
    const searchResp = await readResponse(conn, searchTag);

    // Parse UIDs from SEARCH response
    const uidLine = searchResp.lines.find((l) => l.startsWith("* SEARCH"));
    const uids = uidLine
      ? uidLine.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean).map(
        Number,
      )
      : [];

    // Take the most recent maxResults
    const recentUids = uids.slice(-maxResults);

    if (recentUids.length === 0) {
      return { total: 0, messages: [] };
    }

    // FETCH metadata for each message
    const uidSet = recentUids.join(",");
    const fetchTag = await writeCommand(
      conn,
      `FETCH ${uidSet} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE MESSAGE-ID)])`,
    );
    const fetchResp = await readResponse(conn, fetchTag);

    // Parse results
    const summaries: EmailSummary[] = [];
    const lines = fetchResp.lines;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^\* (\d+) FETCH/);
      if (!match) continue;

      const seq = parseInt(match[1]);
      const uidM = line.match(/UID\s+(\d+)/i);
      const flagsM = line.match(/FLAGS\s*\(([^)]*)\)/i);
      const dateM = line.match(/INTERNALDATE\s+"([^"]+)"/i);
      const uid = uidM ? uidM[1] : String(seq);

      // Parse header fields from the next lines
      let subject = "";
      let from = "";
      let date = dateM ? dateM[1] : "";
      // Look ahead for BODY[HEADER.FIELDS] content
      for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
        const hl = lines[j];
        if (hl.includes("SUBJECT ")) {
          const s = hl.match(/SUBJECT\s+"?([^"]*?)"?\s*$/i);
          if (s) subject = decodeMimeWords(s[1]);
        }
        if (hl.includes("FROM ")) {
          const f = hl.match(/FROM\s+"?([^"]*?)"?\s*$/i);
          if (f) from = decodeMimeWords(f[1]);
        }
        if (hl.includes("MESSAGE-ID ")) {
          const m = hl.match(/MESSAGE-ID\s+"?([^"]*?)"?\s*$/i);
          if (m) msgId = m[1];
        }
        if (hl.includes("DATE ")) {
          const d = hl.match(/DATE\s+"?([^"]*?)"?\s*$/i);
          if (d) date = d[1];
        }
        if (hl.endsWith(")")) break;
      }

      summaries.push({
        uid,
        seq,
        subject: subject || "(no subject)",
        from: from || "(unknown)",
        date,
        flags: flagsM ? flagsM[1].split(" ").filter(Boolean) : [],
        snippet: "",
      });
    }

    return {
      total: uids.length,
      messages: summaries.slice(0, maxResults),
    };
  } finally {
    try {
      // LOGOUT
      const logoutTag = await writeCommand(conn, "LOGOUT");
      await readResponse(conn, logoutTag);
      conn.close();
    } catch {
      conn.close();
    }
  }
}

/**
 * Get a specific email message by UID.
 */
export async function getEmail(
  config: EmailConnectionConfig,
  uid: string,
  mailbox = "INBOX",
): Promise<EmailMessage | null> {
  const conn = await connectAndLogin(config, mailbox);

  try {
    // Fetch with BODY[] to get full content
    const fetchTag = await writeCommand(
      conn,
      `UID FETCH ${uid} (UID FLAGS INTERNALDATE BODY.PEEK[])`,
    );
    const fetchResp = await readResponse(conn, fetchTag, 30000);

    // Parse the response
    const allText = fetchResp.lines.join("\r\n");

    // Find the body content which is between BODY[] {size} and the closing tag
    const bodyMatch = allText.match(
      /\*\s*\d+\s+FETCH\s*\([\s\S]*?BODY\[\]\s*\{(\d+)\}\r\n([\s\S]*?)(?=\)\s*A\d+|\)\s*$)/i,
    );
    if (!bodyMatch) {
      // Try a simpler approach: look for the body content directly
      const msg = extractSimpleMessage(fetchResp.lines, uid);
      return msg || null;
    }

    const bodySize = parseInt(bodyMatch[1]);
    const bodyContent = bodyMatch[2].slice(0, bodySize);

    // Parse the message
    const msg: Partial<EmailMessage> = {
      uid,
      seq: 0,
      subject: "",
      from: "",
      to: "",
      date: "",
      flags: [],
      snippet: "",
      headers: {},
    };

    // Extract flags and date from the raw response
    const rawText = fetchResp.lines.join("\r\n");
    const flagsMatch = rawText.match(/FLAGS\s*\(([^)]*)\)/i);
    if (flagsMatch) msg.flags = flagsMatch[1].split(" ").filter(Boolean);
    const dateMatch = rawText.match(/INTERNALDATE\s+"([^"]+)"/i);
    if (dateMatch) msg.date = dateMatch[1];

    parseEmailBody(bodyContent, msg);

    return msg as EmailMessage;
  } finally {
    try {
      const logoutTag = await writeCommand(conn, "LOGOUT");
      await readResponse(conn, logoutTag);
      conn.close();
    } catch {
      conn.close();
    }
  }
}

/**
 * Extract a simple message when the full parser fails.
 */
function extractSimpleMessage(
  lines: string[],
  uid: string,
): EmailMessage | null {
  const fullText = lines.join("\r\n");

  // Check if message was found
  const fetchLine = lines.find((l) => l.includes("FETCH"));
  if (!fetchLine) return null;

  const flagsM = fullText.match(/FLAGS\s*\(([^)]*)\)/i);
  const dateM = fullText.match(/INTERNALDATE\s+"([^"]+)"/i);
  const seqM = fetchLine.match(/^\* (\d+)/);
  const uidM2 = fullText.match(/UID\s+(\d+)/i);

  const msg: EmailMessage = {
    uid: uidM2?.[1] || uid,
    seq: seqM ? parseInt(seqM[1]) : 0,
    subject: "(unable to decode)",
    from: "(unable to decode)",
    to: "",
    date: dateM?.[1] || "",
    flags: flagsM ? flagsM[1].split(" ").filter(Boolean) : [],
    snippet: "",
    headers: {},
    body: fullText.slice(0, 5000),
  };

  // Try to extract headers from the raw body content
  const bodyStart = fullText.search(/BODY\[\]\s*\{/);
  if (bodyStart >= 0) {
    const bodyContentStart = fullText.indexOf("}", bodyStart);
    if (bodyContentStart >= 0) {
      const body = fullText.slice(bodyContentStart + 1).replace(/\r\n$/g, "")
        .trim();
      const parts = body.split(/\r?\n\r?\n/);
      if (parts.length >= 2) {
        const headerText = parts[0];
        msg.body = parts.slice(1).join("\n\n").slice(0, 5000);
        const headerLines = headerText.split(/\r?\n/);
        for (const hLine of headerLines) {
          const colonIdx = hLine.indexOf(":");
          if (colonIdx > 0) {
            const name = hLine.slice(0, colonIdx).trim().toLowerCase();
            const value = hLine.slice(colonIdx + 1).trim();
            msg.headers[name] = value;
          }
        }
        msg.subject = decodeMimeWords(msg.headers.subject || "(no subject)");
        msg.from = decodeMimeWords(msg.headers.from || "(unknown)");
        msg.to = decodeMimeWords(msg.headers.to || "");
        msg.cc = decodeMimeWords(msg.headers.cc || "");
        msg.snippet = msg.body.replace(/<[^>]*>/g, "").replace(/\s+/g, " ")
          .slice(0, 200);
      }
    }
  }

  return msg;
}

/**
 * Search emails with a text query (searches subject and from fields).
 */
export function searchEmails(
  config: EmailConnectionConfig,
  query: string,
  options: {
    maxResults?: number;
    mailbox?: string;
  } = {},
): Promise<{ total: number; messages: EmailSummary[] }> {
  return listEmails(config, {
    ...options,
    query,
  });
}
