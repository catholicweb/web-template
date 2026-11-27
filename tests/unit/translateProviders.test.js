import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { translateWithLLM, parseTranslations } from "../../docs/.vitepress/translate.js";

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const gemini = (translations) => json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ translations }) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
const openrouter = (translations) => json({ choices: [{ message: { content: JSON.stringify({ translations }) } }], usage: { prompt_tokens: 3, completion_tokens: 2 } });

const isGemini = (url) => String(url).includes("generativelanguage.googleapis.com");

describe("translateWithLLM providers", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_MODEL;
  });
  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses Gemini first, sending the key in a header and a JSON schema", async () => {
    process.env.GEMINI_API_KEY = "g-key";
    process.env.OPENROUTER_API_KEY = "o-key";
    const fetchMock = vi.fn(async () => gemini(["Kaixo"]));
    vi.stubGlobal("fetch", fetchMock);

    expect(await translateWithLLM(["Hola"], "Euskara")).toEqual(["Kaixo"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("g-key");
    expect(options.headers["x-goog-api-key"]).toBe("g-key");
    const body = JSON.parse(options.body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.systemInstruction.parts[0].text).toContain("Euskara (Leitza dialect)");
  });

  it("falls back to OpenRouter when Gemini fails", async () => {
    process.env.GEMINI_API_KEY = "g-key";
    process.env.OPENROUTER_API_KEY = "o-key";
    vi.stubGlobal("fetch", vi.fn(async (url) => (isGemini(url) ? json({ error: "boom" }, 500) : openrouter(["Bonjour"]))));

    expect(await translateWithLLM(["Hola"], "Français")).toEqual(["Bonjour"]);
  });

  it("falls back when Gemini returns the wrong number of strings", async () => {
    process.env.GEMINI_API_KEY = "g-key";
    process.env.OPENROUTER_API_KEY = "o-key";
    vi.stubGlobal("fetch", vi.fn(async (url) => (isGemini(url) ? gemini(["solo una"]) : openrouter(["uno", "dos"]))));

    expect(await translateWithLLM(["a", "b"], "English")).toEqual(["uno", "dos"]);
  });

  it("stops calling Gemini for a while after a 429", async () => {
    process.env.GEMINI_API_KEY = "g-key";
    process.env.OPENROUTER_API_KEY = "o-key";
    const fetchMock = vi.fn(async (url) => (isGemini(url) ? json({ error: "quota" }, 429) : openrouter(["x"])));
    vi.stubGlobal("fetch", fetchMock);

    await translateWithLLM(["a"], "English");
    await translateWithLLM(["b"], "English");
    expect(fetchMock.mock.calls.filter(([u]) => isGemini(u))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([u]) => !isGemini(u))).toHaveLength(2);
  });

  it("works with OpenRouter alone (current setup) and returns [] when everything fails", async () => {
    process.env.OPENROUTER_API_KEY = "o-key";
    vi.stubGlobal("fetch", vi.fn(async () => openrouter(["ok"])));
    expect(await translateWithLLM(["a"], "English")).toEqual(["ok"]);

    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "down" }, 500)));
    expect(await translateWithLLM(["a"], "English")).toEqual([]);
  });

  it("throws when no key is configured", async () => {
    await expect(translateWithLLM(["a"], "English")).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("parseTranslations accepts a fenced JSON reply", () => {
    expect(parseTranslations('```json\n{"translations":["a"]}\n```')).toEqual(["a"]);
  });
});
