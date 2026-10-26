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

/** A message as the chat UI holds it; `seq` is null while a send is still pending or failed. */
export type ChatMessage = Omit<ServerMessage, "seq"> & {
  seq: number | null;
  status: "sent" | "sending" | "failed";
  errorText?: string;
};
