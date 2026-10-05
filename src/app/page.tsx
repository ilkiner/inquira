import Link from "next/link";
import Script from "next/script";
import { clinic } from "@/lib/clinic-config";

// Demo page that looks like a clinic website with the widget embedded,
// exactly the way a real clinic would add it.
export default function Home() {
  return (
    <main>
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
          <p className="text-sm font-medium text-teal-700">
            {clinic.city} · {clinic.country}
          </p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
            {clinic.name}
          </h1>
          <p className="mt-4 max-w-xl text-slate-600">
            This is a demo clinic site. Click the chat button in the corner and ask what a patient would ask — in
            English, Turkish, Russian, German, Arabic or Azerbaijani.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2 text-sm text-slate-600">
            {[
              "How much is a hair transplant?",
              "Сколько стоит имплант?",
              "Ich brauche 8 Kronen, was kostet das?",
              "Burun estetiği için ne kadar kalmam gerekir?",
            ].map((q) => (
              <li key={q} className="rounded-full bg-slate-100 px-3 py-1">
                “{q}”
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-12 sm:grid-cols-3">
        {[
          ["Answers in seconds, 24/7", "Patients compare several clinics at night. The first good answer usually wins."],
          ["Qualifies every inquiry", "Treatment, timeframe, country and contact details land in a clean lead record."],
          ["Hands over warm leads", "Your coordinator gets a Telegram alert and takes over with one click."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="font-medium">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-24">
        <div className="rounded-xl bg-slate-900 p-5 text-sm text-slate-200">
          <p className="mb-2 text-slate-400">Add it to any website with one line:</p>
          <code className="break-all">{'<script src="https://your-domain/embed.js" async></script>'}</code>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Coordinators work from the{" "}
          <Link href="/dashboard" className="font-medium text-teal-700 underline">
            dashboard
          </Link>
          .
        </p>
      </section>

      <Script src="/embed.js" strategy="afterInteractive" />
    </main>
  );
}
