import "server-only";

export type AiTurn = { role: "user" | "model"; text: string };

const SYSTEM_PROMPT = [
  "You are HiveMind, a friendly assistant in a group chat shared by a few friends.",
  "Each user message starts with the sender's name followed by a colon; use names naturally.",
  "Keep replies concise and conversational. Do not prefix your reply with your own name.",
  "Write plain text only: no Markdown symbols such as asterisks, pound signs or backticks. Use short lines or '1.' numbering for lists.",
].join(" ");

/** Merges consecutive turns from the same role, which Gemini expects to alternate. */
export function toContents(turns: AiTurn[]) {
  const out: { role: AiTurn["role"]; parts: { text: string }[] }[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.parts[0].text += `\n${t.text}`;
    else out.push({ role: t.role, parts: [{ text: t.text }] });
  }
  return out;
}

const TRANSIENT = new Set([429, 500, 503]);

export async function generateReply(turns: AiTurn[], signal?: AbortSignal): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!key || !model) throw new Error("Gemini is not configured");

  const request = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: toContents(turns),
        // Minimal thinking keeps chat replies to a second or two; the default can take 30s+.
        generationConfig: { maxOutputTokens: 800, temperature: 0.8, thinkingConfig: { thinkingLevel: "minimal" } },
      }),
      signal: signal ?? AbortSignal.timeout(25_000),
    });

  let res = await request();
  if (TRANSIENT.has(res.status)) {
    // One quick retry: "high demand" spikes from the provider are usually brief.
    await new Promise((r) => setTimeout(r, 1000));
    res = await request();
  }
  if (!res.ok) throw new Error(`Gemini responded ${res.status}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no text");
  return text;
}
