import { z } from "zod";

export const GROUP_NAME_MAX = 80;

export const createGroupSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, "Give the conversation a name.")
        .max(GROUP_NAME_MAX, `Keep the name under ${GROUP_NAME_MAX + 1} characters.`),
    ),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
