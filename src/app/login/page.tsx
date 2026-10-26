import { Suspense } from "react";
import { safeNext } from "@/lib/auth/safeNext";
import { Card } from "@/components/ui/Card";
import { LoginForm } from "./LoginForm";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// searchParams is request-time data, so it is read inside a Suspense boundary.
async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  const notice =
    first(sp.error) === "link"
      ? "That sign-in link is invalid or has expired. Request a new one below."
      : undefined;
  return <LoginForm next={next} notice={notice} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
      <header>
        <h1 className="font-display text-5xl leading-none">HiveMind</h1>
        <p className="mt-2 text-muted">Sign in to start or join a shared conversation.</p>
      </header>
      <Card>
        <Suspense fallback={<div className="h-40" aria-hidden />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </Card>
    </main>
  );
}
