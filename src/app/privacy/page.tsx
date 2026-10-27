import type { Metadata } from "next";
import { MarketingShell } from "@/components/landing/MarketingShell";

export const metadata: Metadata = { title: "Privacy and data · HiveMind" };

const eyebrow = "font-mono text-[11px] uppercase tracking-wide text-muted";

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "Who can read a conversation",
    body: [
      "Every member of a conversation can read all of it. When the owner shares an invite link, anyone who opens it and signs in can join and read the entire history, including everything said before they joined.",
      "A conversation is private to its members until it is shared. People who are not members cannot read it, and the app answers 'not found' whether or not the conversation exists.",
    ],
  },
  {
    title: "What is sent to the AI",
    body: [
      "To write a reply, HiveMind sends Google's Gemini API the most recent messages of the conversation (at most 20, up to the message being answered) and the display names of the people who wrote them.",
      "This project uses Google's free tier. Under Google's terms for that tier, Google may use submitted prompts and responses to improve its products and machine-learning technologies, and human reviewers may read them. Do not share secrets, other people's private details, or anything you would not want a stranger to read.",
    ],
  },
  {
    title: "What we store about you",
    body: [
      "Your email address and a hashed password (used only to sign you in), your display name, and the messages you send. Invite links are stored only as one-way hashes and expire after three days.",
      "We do not use analytics or advertising trackers. The site sets the cookies it needs to keep you signed in.",
    ],
  },
  {
    title: "Deleting things",
    body: [
      "Deleting messages, conversations or your account from inside the app is not supported in this version. Messages cannot be edited or removed by anyone. If you need your data removed, contact the person who runs this instance.",
    ],
  },
  {
    title: "Limits you may notice",
    body: [
      "Conversations hold up to five people and messages up to 1000 characters. Sending is limited to 20 messages a minute per person. If the AI provider is busy or over its quota, a message may go unanswered and show a note with a Retry button.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <main className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
        <p className={eyebrow}>Privacy and data</p>
        <h1 className="mt-3 font-display text-5xl leading-tight sm:text-6xl">What happens to what you write.</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          HiveMind is a small project run for friends. This page says plainly what it does with your data, including the parts that are not ideal.
        </p>
        <div className="mt-10 border-t border-border">
          {SECTIONS.map((s) => (
            <section key={s.title} className="grid gap-3 border-b border-border py-8 sm:grid-cols-[13rem_1fr] sm:gap-8" data-reveal>
              <h2 className="font-display text-2xl leading-snug">{s.title}</h2>
              <div className="space-y-4 leading-relaxed">
                {s.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </MarketingShell>
  );
}
