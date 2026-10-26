export type MessageType = "user" | "assistant" | "system";

/** A message exactly as the server stores and returns it. */
export type ServerMessage = {
  id: string;
  seq: number;
  group_id: string;
  sender_id: string | null;
  type: MessageType;
  content: string;
  created_at: string;
  sender_name: string | null;
};

export type JobStatus = "queued" | "processing" | "succeeded" | "failed";

/** The part of an AI job the UI needs: which message it answers, and where it stands. */
export type ClientJob = {
  id: string;
  trigger_message_id: string;
  status: JobStatus;
  error_category: string | null;
};

/** A message as the chat UI holds it; `seq` is null while a send is still pending or failed. */
export type ChatMessage = Omit<ServerMessage, "seq"> & {
  seq: number | null;
  status: "sent" | "sending" | "failed";
  errorText?: string;
};
