import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function GroupNotFound() {
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <h1 className="font-display text-4xl">Conversation not found</h1>
      <p className="max-w-md text-muted">
        It may not exist, or you may not be a member. Ask the owner for an invite link.
      </p>
      <Link href="/groups">
        <Button variant="secondary">Back to your conversations</Button>
      </Link>
    </div>
  );
}
