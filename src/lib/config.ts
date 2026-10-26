import { z } from "zod";

const intInRange = (name: string, def: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return def;
      if (!/^\d+$/.test(v)) {
        ctx.addIssue({ code: "custom", message: `${name} must be an integer` });
        return z.NEVER;
      }
      const n = Number(v);
      if (n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${name} must be between ${min} and ${max}` });
        return z.NEVER;
      }
      return n;
    });

const schema = z.object({
  MAX_GROUP_MEMBERS: intInRange("MAX_GROUP_MEMBERS", 5, 2, 50),
  MAX_MESSAGE_LENGTH: intInRange("MAX_MESSAGE_LENGTH", 1000, 1, 4000),
  AI_CONTEXT_MESSAGES: intInRange("AI_CONTEXT_MESSAGES", 20, 1, 100),
  INVITE_EXPIRY_DAYS: intInRange("INVITE_EXPIRY_DAYS", 3, 1, 30),
  MESSAGES_PER_MINUTE: intInRange("MESSAGES_PER_MINUTE", 20, 1, 1000),
  AI_CALLS_PER_MINUTE: intInRange("AI_CALLS_PER_MINUTE", 6, 1, 1000),
});

export type AppConfig = {
  maxGroupMembers: number;
  maxMessageLength: number;
  aiContextMessages: number;
  inviteExpiryDays: number;
  messagesPerMinute: number;
  aiCallsPerMinute: number;
};

export function getConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${detail}`);
  }
  const c = parsed.data;
  return {
    maxGroupMembers: c.MAX_GROUP_MEMBERS,
    maxMessageLength: c.MAX_MESSAGE_LENGTH,
    aiContextMessages: c.AI_CONTEXT_MESSAGES,
    inviteExpiryDays: c.INVITE_EXPIRY_DAYS,
    messagesPerMinute: c.MESSAGES_PER_MINUTE,
    aiCallsPerMinute: c.AI_CALLS_PER_MINUTE,
  };
}
