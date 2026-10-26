import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/chat/types";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

export function MessageItem({
  message,
  isOwn,
  animate = false,
  onRetry,
}: {
  message: ChatMessage;
  isOwn: boolean;
  /** Ease the message in; only for messages that arrive after the page loaded. */
  animate?: boolean;
  onRetry?: (id: string) => void;
}) {
  const name = message.sender_name || (message.sender_id ? "Member" : "Former member");
  return (
    <li
      className={cn(
        "flex gap-3 border-l-2 py-1 pl-3",
        animate && "message-in",
        isOwn ? "border-accent" : "border-transparent",
      )}
      data-testid="message"
      data-status={message.status}
    >
      <Avatar name={name} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-wide text-muted">
          <span className="text-foreground">{isOwn ? "You" : name}</span>
          <time dateTime={message.created_at} suppressHydrationWarning>
            {formatTime(message.created_at)}
          </time>
          {message.status === "sending" && <span>Sending…</span>}
        </p>
        {/* Plain text only: React escapes it, and whitespace/newlines are preserved. */}
        <p className={cn("mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed", message.status !== "sent" && "text-muted")}>
          {message.content}
        </p>
        {message.status === "failed" && (
          <p role="alert" className="mt-1 flex items-center gap-3 text-sm text-danger">
            <span>{message.errorText ?? "Not sent."}</span>
            {onRetry && (
              <button
                type="button"
                onClick={() => onRetry(message.id)}
                className="rounded-md border border-border px-2 py-0.5 text-foreground hover:bg-surface-2"
              >
                Retry
              </button>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
