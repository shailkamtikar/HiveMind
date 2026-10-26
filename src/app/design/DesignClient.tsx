"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";

export function DesignClient() {
  const [open, setOpen] = useState(false);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header>
        <p className="text-sm text-muted">Design system (temporary page)</p>
        <h1 className="font-display text-5xl leading-tight">HiveMind</h1>
        <p className="mt-2 text-muted">Think together in one shared chat.</p>
      </header>

      <section className="flex flex-wrap items-center gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button disabled>Disabled</Button>
        <Spinner />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <Input label="Email" name="email" type="email" placeholder="you@example.com" />
        </Card>
        <Card>
          <Input label="Conversation name" name="name" defaultValue="" error="Name is required" />
        </Card>
      </section>

      <section className="flex items-center gap-3">
        <Avatar name="Shail Kamtikar" />
        <Avatar name="Ada" />
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
      </section>

      <Dialog open={open} onClose={() => setOpen(false)} title="Share this conversation">
        <p className="text-sm text-muted">Anyone with the link can read the history and join.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>Create link</Button>
        </div>
      </Dialog>
    </main>
  );
}
