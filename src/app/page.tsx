import { Suspense } from "react";
import Link from "next/link";
import { ChatPreview } from "@/components/landing/ChatPreview";
import { Line, SectionRule } from "@/components/landing/Editorial";
import { HiveFallback } from "@/components/landing/HiveFallback";
import { HiveScene } from "@/components/landing/HiveScene";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { StartCta, StartCtaFallback } from "@/components/landing/StartCta";

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

const FACTS = [
  ["People", "Up to five per conversation"],
  ["Invite links", "Three days, revocable"],
  ["Message length", "1000 characters"],
  ["AI", "Google Gemini, one reply per message"],
  ["Deleting", "Not in this version"],
];

const eyebrow = "font-mono text-[11px] uppercase tracking-wide text-muted";

export default function Home() {
  return (
    <MarketingShell>
      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-10 pt-12 sm:px-6 lg:grid-cols-[1fr_1fr] lg:pt-20">
          <div>
            <p className={`${eyebrow} flex items-center gap-3`}>
              <span aria-hidden="true" className="inline-block h-px w-10 bg-foreground/40" />
              Group chat → shared AI
            </p>
            <h1 className="mt-6 font-display text-[3.3rem] leading-[0.96] tracking-[-0.015em] sm:text-7xl lg:text-[5.4rem]" aria-label="One chat. Many minds. One AI.">
              <span aria-hidden="true">
                <Line i={0}>One chat.</Line>
                <Line i={1}>Many minds.</Line>
                <Line i={2}>
                  One <em className="text-accent-text">AI.</em>
                </Line>
              </span>
            </h1>
            <p className="rise mt-7 max-w-md text-lg leading-relaxed text-muted" style={{ "--i": 6 } as React.CSSProperties}>
              HiveMind is one conversation that everyone, and one AI, shares. Ask together, disagree out loud, and let the AI answer with the whole thread in front of it.
            </p>
            <div className="rise mt-9" style={{ "--i": 8 } as React.CSSProperties}>
              <Suspense fallback={<StartCtaFallback />}>
                <StartCta variant="hero" />
              </Suspense>
            </div>
          </div>
          <div className="rise" style={{ "--i": 4 } as React.CSSProperties}>
            <HiveScene fallback={<HiveFallback />} />
          </div>
        </section>

        <section className="mx-auto mt-28 w-full max-w-6xl px-4 sm:px-6" aria-labelledby="how">
          <SectionRule n="01" label="How it works" />
          <h2 id="how" className="mt-8 max-w-xl scroll-mt-24 font-display text-4xl leading-tight sm:text-5xl" data-reveal>
            Three steps, no setup for your friends.
          </h2>
          <ol className="mt-10 border-t border-border">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid gap-2 border-b border-border py-7 sm:grid-cols-[6rem_1fr_1.4fr] sm:gap-8" data-reveal style={{ "--i": i } as React.CSSProperties}>
                <span className="font-mono text-sm text-accent-text">{i + 1}</span>
                <h3 className="font-display text-2xl leading-snug">{s.title}</h3>
                <p className="leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-14 grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]" data-reveal>
            <div>
              <p className={eyebrow}>What a conversation looks like</p>
              <p className="mt-3 max-w-sm font-display text-3xl leading-tight">Everyone talks. The AI answers whoever spoke last, by name.</p>
            </div>
            <ChatPreview />
          </div>
        </section>

        <section className="mx-auto mt-28 w-full max-w-6xl px-4 sm:px-6" aria-labelledby="facts">
          <SectionRule n="02" label="What it does" />
          <h2 id="facts" className="mt-8 max-w-xl font-display text-4xl leading-tight sm:text-5xl" data-reveal>
            Small on purpose.
          </h2>
          <dl className="mt-10 border-t border-border">
            {FACTS.map(([k, v], i) => (
              <div key={k} className="grid gap-1 border-b border-border py-5 sm:grid-cols-[14rem_1fr] sm:gap-8" data-reveal style={{ "--i": i } as React.CSSProperties}>
                <dt className={eyebrow}>{k}</dt>
                <dd className="font-display text-2xl leading-snug">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto mt-28 w-full max-w-6xl px-4 sm:px-6" aria-labelledby="honest">
          <SectionRule n="03" label="Your data" />
          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <h2 id="honest" className="scroll-mt-24 font-display text-4xl leading-tight sm:text-5xl" data-reveal>
              Plainly stated.
            </h2>
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
          </div>
        </section>

        <section className="mx-auto mt-28 w-full max-w-6xl px-4 sm:px-6" data-reveal>
          <div className="flex flex-col items-start justify-between gap-8 border-t border-border pt-10 lg:flex-row lg:items-center">
            <h2 className="max-w-lg font-display text-4xl leading-tight sm:text-5xl">Bring the group. Ask the question.</h2>
            <Suspense fallback={<StartCtaFallback />}>
              <StartCta variant="closing" />
            </Suspense>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
