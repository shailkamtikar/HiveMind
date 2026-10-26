"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createGroup, type CreateGroupState } from "./actions";

export function CreateGroupForm() {
  const [state, action, pending] = useActionState<CreateGroupState, FormData>(createGroup, {});
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
      <div className="flex-1">
        <Input label="New conversation" name="name" placeholder="e.g. Weekend trip ideas" maxLength={200} required error={state.error} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Start conversation"}
      </Button>
    </form>
  );
}
