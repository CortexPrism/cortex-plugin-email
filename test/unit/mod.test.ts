import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { tools } from "../../mod.ts";
import type { PluginContext } from 'cortex/plugins';

const mockContext: PluginContext = {
  pluginId: "cortex-plugin-email",
  pluginDir: "/tmp/plugins/cortex-plugin-email",
  state: {
    get: async () => null,
    set: async () => {},
  },
  config: {},
};

function findTool(name: string) {
  return tools.find(t => t.definition.name === name);
}

Deno.test("email_list - rejects invalid max_results", async () => {
  const tool = findTool("email_list");
  if (!tool) throw new Error("email_list tool not found");

  const result = await tool.execute({ max_results: 0 }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "positive number");
});

Deno.test("email_list - rejects missing API config", async () => {
  const tool = findTool("email_list");
  if (!tool) throw new Error("email_list tool not found");

  const result = await tool.execute({ max_results: 20 }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "not configured");
});

Deno.test("email_list - accepts negative max_results as error", async () => {
  const tool = findTool("email_list");
  if (!tool) throw new Error("email_list tool not found");

  const result = await tool.execute({ max_results: -1 }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "positive number");
});

Deno.test("email_get - rejects missing email_id", async () => {
  const tool = findTool("email_get");
  if (!tool) throw new Error("email_get tool not found");

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "email_id");
});

Deno.test("email_get - rejects invalid format", async () => {
  const tool = findTool("email_get");
  if (!tool) throw new Error("email_get tool not found");

  const result = await tool.execute({ email_id: "msg123", format: "invalid" }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "format must be one of");
});

Deno.test("email_get - rejects missing API config", async () => {
  const tool = findTool("email_get");
  if (!tool) throw new Error("email_get tool not found");

  const result = await tool.execute({ email_id: "msg123", format: "full" }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "not configured");
});

Deno.test("email_send - rejects missing required params", async () => {
  const tool = findTool("email_send");
  if (!tool) throw new Error("email_send tool not found");

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "required");
});

Deno.test("email_send - rejects missing API config", async () => {
  const tool = findTool("email_send");
  if (!tool) throw new Error("email_send tool not found");

  const result = await tool.execute({
    to: "alice@example.com",
    subject: "Test",
    body: "Hello",
  }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "not configured");
});

Deno.test("email_draft - rejects missing required params", async () => {
  const tool = findTool("email_draft");
  if (!tool) throw new Error("email_draft tool not found");

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "required");
});

Deno.test("email_draft - rejects missing API config", async () => {
  const tool = findTool("email_draft");
  if (!tool) throw new Error("email_draft tool not found");

  const result = await tool.execute({
    to: "alice@example.com",
    subject: "Test",
    body: "Hello",
  }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "not configured");
});

Deno.test("email_summarize_thread - rejects missing thread_id", async () => {
  const tool = findTool("email_summarize_thread");
  if (!tool) throw new Error("email_summarize_thread tool not found");

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "thread_id");
});

Deno.test("email_summarize_thread - rejects missing API config", async () => {
  const tool = findTool("email_summarize_thread");
  if (!tool) throw new Error("email_summarize_thread tool not found");

  const result = await tool.execute({ thread_id: "thread123" }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "not configured");
});

Deno.test("email_extract_actions - rejects missing email_ids", async () => {
  const tool = findTool("email_extract_actions");
  if (!tool) throw new Error("email_extract_actions tool not found");

  const result = await tool.execute({}, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "email_ids");
});

Deno.test("email_extract_actions - rejects empty email_ids", async () => {
  const tool = findTool("email_extract_actions");
  if (!tool) throw new Error("email_extract_actions tool not found");

  const result = await tool.execute({ email_ids: ", ," }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, "No valid email IDs");
});

Deno.test("tools array exported", () => {
  assertEquals(tools.length, 6);
  assertEquals(tools[0].definition.name, "email_list");
  assertEquals(tools[1].definition.name, "email_get");
  assertEquals(tools[2].definition.name, "email_send");
  assertEquals(tools[3].definition.name, "email_draft");
  assertEquals(tools[4].definition.name, "email_summarize_thread");
  assertEquals(tools[5].definition.name, "email_extract_actions");
});
