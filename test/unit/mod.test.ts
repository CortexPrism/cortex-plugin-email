// deno-lint-ignore-file require-await, no-unused-vars
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { tools } from '../../mod.ts';
import { getSmtpConfig, SmtpError } from '../../smtp.ts';
import { getImapConfig, ImapError } from '../../imap.ts';
import type { PluginContext } from '../../types.ts';

const mockContext: PluginContext = {
  pluginId: 'cortex-plugin-email',
  pluginDir: '/tmp/plugins/cortex-plugin-email',
  state: {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
    delete: () => Promise.resolve(),
    list: () => Promise.resolve({}),
  },
  config: {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
    getAll: () => Promise.resolve({}),
  },
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
  host: {
    registerTool: () => {},
    unregisterTool: () => {},
  },
};

function findTool(name: string) {
  return tools.find((t) => t.definition.name === name);
}

// --- Tool export tests ---

Deno.test('tools array exported with 6 tools', () => {
  assertEquals(Array.isArray(tools), true);
  assertEquals(tools.length, 6);
  assertEquals(tools[0].definition.name, 'email_list');
  assertEquals(tools[1].definition.name, 'email_get');
  assertEquals(tools[2].definition.name, 'email_send');
  assertEquals(tools[3].definition.name, 'email_draft');
  assertEquals(tools[4].definition.name, 'email_summarize_thread');
  assertEquals(tools[5].definition.name, 'email_extract_actions');
});

Deno.test('all tools have required definition fields', () => {
  for (const tool of tools) {
    assertEquals(typeof tool.definition.name, 'string', `Tool missing name`);
    assertEquals(
      typeof tool.definition.description,
      'string',
      `Tool ${tool.definition.name} missing description`,
    );
    assertEquals(
      Array.isArray(tool.definition.params),
      true,
      `Tool ${tool.definition.name} missing params`,
    );
    assertEquals(typeof tool.execute, 'function', `Tool ${tool.definition.name} missing execute`);
  }
});

// --- email_list ---

Deno.test('email_list - rejects invalid max_results', async () => {
  const tool = findTool('email_list');
  if (!tool) throw new Error('email_list tool not found');

  const result = await tool.execute({ max_results: 0 }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'positive number');
});

Deno.test('email_list - rejects missing IMAP config', async () => {
  const tool = findTool('email_list');
  if (!tool) throw new Error('email_list tool not found');

  const result = await tool.execute({ max_results: 20 }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'IMAP');
});

Deno.test('email_list - rejects negative max_results', async () => {
  const tool = findTool('email_list');
  if (!tool) throw new Error('email_list tool not found');

  const result = await tool.execute({ max_results: -1 }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'positive number');
});

// --- email_get ---

Deno.test('email_get - rejects missing email_id', async () => {
  const tool = findTool('email_get');
  if (!tool) throw new Error('email_get tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'email_id');
});

Deno.test('email_get - rejects invalid format', async () => {
  const tool = findTool('email_get');
  if (!tool) throw new Error('email_get tool not found');

  const result = await tool.execute(
    { email_id: '123', format: 'invalid' },
    mockContext,
  );
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'format must be one of');
});

Deno.test('email_get - rejects missing IMAP config', async () => {
  const tool = findTool('email_get');
  if (!tool) throw new Error('email_get tool not found');

  const result = await tool.execute({ email_id: '123', format: 'full' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'IMAP');
});

// --- email_send ---

Deno.test('email_send - rejects missing required params', async () => {
  const tool = findTool('email_send');
  if (!tool) throw new Error('email_send tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'required');
});

Deno.test('email_send - rejects missing SMTP config', async () => {
  const tool = findTool('email_send');
  if (!tool) throw new Error('email_send tool not found');

  const result = await tool.execute({
    to: 'alice@example.com',
    subject: 'Test',
    body: 'Hello',
  }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'SMTP');
});

Deno.test('email_send - validates individual required fields', async () => {
  const tool = findTool('email_send');
  if (!tool) throw new Error('email_send tool not found');

  const result1 = await tool.execute({ subject: 'Hi', body: 'Hello' }, mockContext);
  assertEquals(result1.success, false);
  assertStringIncludes(result1.error, 'to');

  const result2 = await tool.execute({ to: 'a@b.com', body: 'Hello' }, mockContext);
  assertEquals(result2.success, false);
  assertStringIncludes(result2.error, 'subject');

  const result3 = await tool.execute({ to: 'a@b.com', subject: 'Hi' }, mockContext);
  assertEquals(result3.success, false);
  assertStringIncludes(result3.error, 'body');
});

// --- email_draft ---

Deno.test('email_draft - creates draft without config', async () => {
  const tool = findTool('email_draft');
  if (!tool) throw new Error('email_draft tool not found');

  const result = await tool.execute({
    to: 'alice@example.com',
    subject: 'Hello',
    body: 'World',
  }, mockContext);

  // Draft should succeed even without SMTP/IMAP config
  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'draft');
});

Deno.test('email_draft - rejects missing required params', async () => {
  const tool = findTool('email_draft');
  if (!tool) throw new Error('email_draft tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'required');
});

Deno.test('email_draft - includes RFC 2822 in output', async () => {
  const tool = findTool('email_draft');
  if (!tool) throw new Error('email_draft tool not found');

  const result = await tool.execute({
    to: 'alice@example.com',
    subject: 'Test',
    body: 'Hello World',
    cc: 'bob@example.com',
  }, mockContext);

  assertEquals(result.success, true);
  assertStringIncludes(result.output, 'rfc2822');
  assertStringIncludes(result.output, 'Cc: bob@example.com');
});

// --- email_summarize_thread ---

Deno.test('email_summarize_thread - rejects missing thread_id', async () => {
  const tool = findTool('email_summarize_thread');
  if (!tool) throw new Error('email_summarize_thread tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'thread_id');
});

Deno.test('email_summarize_thread - rejects missing IMAP config', async () => {
  const tool = findTool('email_summarize_thread');
  if (!tool) throw new Error('email_summarize_thread tool not found');

  const result = await tool.execute({ thread_id: 'thread123' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'IMAP');
});

// --- email_extract_actions ---

Deno.test('email_extract_actions - rejects missing email_ids', async () => {
  const tool = findTool('email_extract_actions');
  if (!tool) throw new Error('email_extract_actions tool not found');

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'email_ids');
});

Deno.test('email_extract_actions - rejects empty email_ids', async () => {
  const tool = findTool('email_extract_actions');
  if (!tool) throw new Error('email_extract_actions tool not found');

  const result = await tool.execute({ email_ids: ', ,' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'No valid email IDs');
});

Deno.test('email_extract_actions - rejects missing IMAP config', async () => {
  const tool = findTool('email_extract_actions');
  if (!tool) throw new Error('email_extract_actions tool not found');

  const result = await tool.execute({ email_ids: '123,456' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'IMAP');
});

// --- SMTP module tests ---

Deno.test('getSmtpConfig - rejects missing config', () => {
  try {
    getSmtpConfig({});
    assertEquals(true, false, 'Should have thrown');
  } catch (e) {
    assertStringIncludes(e instanceof Error ? e.message : String(e), 'SMTP');
  }
});

Deno.test('getSmtpConfig - returns config when all fields present', () => {
  const config = getSmtpConfig({
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpUser: 'user@example.com',
    smtpPassword: 'secret',
    fromEmail: 'from@example.com',
  });
  assertEquals(config.host, 'smtp.example.com');
  assertEquals(config.port, 587);
  assertEquals(config.user, 'user@example.com');
  assertEquals(config.fromEmail, 'from@example.com');
});

Deno.test('getSmtpConfig - defaults fromEmail to smtpUser', () => {
  const config = getSmtpConfig({
    smtpHost: 'smtp.example.com',
    smtpUser: 'user@example.com',
    smtpPassword: 'secret',
  });
  assertEquals(config.fromEmail, 'user@example.com');
});

// --- IMAP module tests ---

Deno.test('getImapConfig - rejects missing config', () => {
  try {
    getImapConfig({});
    assertEquals(true, false, 'Should have thrown');
  } catch (e) {
    assertStringIncludes(e instanceof Error ? e.message : String(e), 'IMAP');
  }
});

Deno.test('getImapConfig - returns config when all fields present', () => {
  const config = getImapConfig({
    imapHost: 'imap.example.com',
    imapPort: 993,
    imapUser: 'user@example.com',
    imapPassword: 'secret',
  });
  assertEquals(config.host, 'imap.example.com');
  assertEquals(config.port, 993);
  assertEquals(config.user, 'user@example.com');
});

Deno.test('getImapConfig - defaults fromEmail to imapUser', () => {
  const config = getImapConfig({
    imapHost: 'imap.example.com',
    imapUser: 'user@example.com',
    imapPassword: 'secret',
  });
  assertEquals(config.fromEmail, 'user@example.com');
});

// --- Error class tests ---

Deno.test('SmtpError has correct name', () => {
  const err = new SmtpError('test error');
  assertEquals(err.name, 'SmtpError');
  assertEquals(err.message, 'test error');
});

Deno.test('ImapError has correct name', () => {
  const err = new ImapError('test error');
  assertEquals(err.name, 'ImapError');
  assertEquals(err.message, 'test error');
});
