"use client";

import { useState, type FormEvent } from "react";

/** Placeholder reservation form: validates locally, submits nowhere. */
export default function ReserveForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("That address doesn't look quite right.");
      return;
    }
    setError("");
    setDone(true);
  }

  if (done) {
    return (
      <p className="text-lede text-ink" role="status">
        Thank you — you&rsquo;re on the list for Batch 04.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-md">
      <div className="flex items-center gap-2 rounded-full border border-line bg-ground/40 p-1.5 pl-5 backdrop-blur-sm transition-colors duration-500 focus-within:border-ink/40">
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@studio.com"
          className="min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-faint focus:outline-none"
          aria-invalid={!!error}
          aria-describedby={error ? "email-error" : undefined}
        />
        <button type="submit" className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-body font-medium text-ground transition-opacity duration-300 hover:opacity-85">
          Reserve
        </button>
      </div>
      <p id="email-error" className="mt-3 min-h-5 pl-5 text-body text-accent" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
