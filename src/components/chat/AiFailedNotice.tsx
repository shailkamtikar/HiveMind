import type { ClientJob } from "@/lib/chat/types";

export const MAX_JOB_ATTEMPTS = 3; // keep in sync with retry_job() in the database

/** Shown under a member's message when HiveMind could not answer it. Rendered from job state, so it can never be mistaken for an AI answer. */
export function AiFailedNotice({
  job,
  retrying,
  onRetry,
}: {
  job: ClientJob;
  retrying: boolean;
  onRetry: (jobId: string) => void;
}) {
  const text =
    job.error_category === "quota"
      ? "HiveMind is temporarily unavailable. Please try again in a little while."
      : "HiveMind couldn't respond to this message.";
  const canRetry = job.attempts < MAX_JOB_ATTEMPTS;
  return (
    <li className="py-1 pl-14" data-testid="ai-failed" data-category={job.error_category ?? "unknown"}>
      <p className="inline-flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-muted">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-danger" />
        {text}
        {canRetry ? (
          <button
            type="button"
            onClick={() => onRetry(job.id)}
            disabled={retrying}
            className="rounded border border-border px-1.5 py-0.5 uppercase text-foreground hover:bg-surface disabled:opacity-60"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        ) : (
          <span data-testid="ai-retry-limit">· Retried too many times</span>
        )}
      </p>
    </li>
  );
}
