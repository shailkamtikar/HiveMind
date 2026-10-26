import Link from "next/link";
import { ChatPreview } from "@/components/landing/ChatPreview";
import { MarketingShell } from "@/components/landing/MarketingShell";

const HEADLINE = ["One", "chat.", "Many", "minds."];

const STEPS = [
  {
    title: "Start a conversation",
    body: "Name it, and say something. The AI answers every message, so you can begin on your own and bring people in when it gets interesting.",
  },
  {
    title: "Share one link",
    body: "The owner creates an invite link: it expires after three days, can be revoked at any time, and works for up to five people in total. New members can read everything said so far.",
  },
  {
    title: "Talk. The AI keeps up.",
    body: "Everyone sees the same messages in the same order, live. HiveMind answers each message in turn, with the recent conversation and who said what in view.",
  },
];

const eyebrow = "font-mono text-[11px] uppercase tracking-wide text-muted";

export default function Home() {
  return (
    <MarketingShell>
      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-8 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div>
            <p className={eyebrow}>A shared AI chat for friends</p>
            <h1 className="mt-5 font-display text-[3.4rem] leading-[0.95] sm:text-7xl lg:text-[5.5rem]" aria-label="One chat. Many minds. One AI.">
              <span aria-hidden="true">
                {HEADLINE.map((w, i) => (
                  <span key={i} className="inline-block overflow-hidden align-bottom">
                    <span data-hero-word className="inline-block pr-[0.22em]">
                      {w}
                    </span>
                  </span>
                ))}
                <br />
                <span className="inline-block overflow-hidden align-bottom">
                  <span data-hero-word className="inline-block pr-[0.22em]">
                    One
                  </span>
                </span>
                <span className="inline-block overflow-hidden align-bottom">
                  <span data-hero-word className="inline-block italic text-accent-text">
                    AI.
                  </span>
                </span>
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
              HiveMind is one conversation that everyone, and one AI, shares. Ask together, disagree out loud, and let the AI answer with the whole thread in front of it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login?mode=signup"
                className="btn-shine inline-flex h-11 items-center justify-center rounded-[var(--radius)] bg-accent px-5 text-sm font-medium text-accent-foreground"
              >
                Start a conversation
              </Link>
              <Link href="/login" className="inline-flex h-11 items-center px-2 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
                I already have an account
              </Link>
            </div>
          </div>
          <ChatPreview />
        </section>

        <section className="mx-auto mt-28 w-full max-w-6xl px-4 sm:px-6" aria-labelledby="how">
          <p className={eyebrow} data-reveal>
            How it works
          </p>
          <h2 id="how" className="mt-3 max-w-xl font-display text-4xl leading-tight sm:text-5xl" data-reveal>
            Three steps, no setup for your friends.
          </h2>
          <ol className="mt-10 border-t border-border">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid gap-2 border-b border-border py-7 sm:grid-cols-[6rem_1fr_1.4fr] sm:gap-8" data-reveal>
                <span className="font-mono text-sm text-accent-text">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-display text-2xl leading-snug">{s.title}</h3>
                <p className="text-muted leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto mt-28 grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr]" aria-labelledby="honest">
          <div data-reveal>
            <p className={eyebrow}>What happens to your messages</p>
            <h2 id="honest" className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
              Plainly stated.
            </h2>
          </div>
          <div className="space-y-5 leading-relaxed" data-reveal>
            <p>
              Everything said in a conversation is visible to every member of it, including people who join later. Nobody can edit or delete a message in this version.
            </p>
            <p>
              To answer, HiveMind sends the latest messages and the names of the people who wrote them to Google&apos;s Gemini. On the free tier Google may use that text to improve its products, and people may review it. Don&apos;t share anything you would not want a stranger to read.
            </p>
            <p>
              <Link href="/privacy" className="text-accent-text underline underline-offset-4">
                Read the full privacy and data notice
              </Link>
            </p>
          </div>
        </section>

        <section className="mx-auto mt-28 w-full max-w-6xl px-4 sm:px-6" data-reveal>
          <div className="flex flex-col items-start justify-between gap-6 border-t border-border pt-10 sm:flex-row sm:items-end">
            <h2 className="max-w-lg font-display text-4xl leading-tight sm:text-5xl">Bring the group. Ask the question.</h2>
            <Link
              href="/login?mode=signup"
              className="btn-shine inline-flex h-11 items-center justify-center rounded-[var(--radius)] bg-accent px-5 text-sm font-medium text-accent-foreground"
            >
              Create an account
            </Link>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
