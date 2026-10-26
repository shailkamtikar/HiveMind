import { z } from "zod";

/** Request body for sending a message. `id` is optional and makes retries idempotent. */
export function sendMessageSchema(maxLength: number) {
  return z.object({
    id: z.uuid().optional(),
    content: z
      .string()
      .transform((v) => v.trim())
      .pipe(
        z
          .string()
          .min(1, "Write something before sending.")
          .max(maxLength, `Messages can be at most ${maxLength} characters.`)
          // Postgres cannot store NUL characters.
          .refine((v) => !v.includes("\u0000"), "Message contains an unsupported character."),
      ),
  });
}

/** Query parameters for loading history. */
export const historyQuerySchema = z
  .object({
    before: z.coerce.number().int().min(0).optional(),
    after: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(30),
  })
  .refine((q) => q.before === undefined || q.after === undefined, "Use either before or after, not both.");
