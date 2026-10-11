"use client";

import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:43124";

type AuthorCount = { login: string; count: number };

type IngestResult = {
  fullName: string;
  requested: number;
  received: number;
  totalStored: number;
};

type BucketCounts = {
  deterministic: number;
  execution_testable: number;
  judgment: number;
  noise: number;
  unlabeled: number;
};

type EvidenceLink = {
  commentId: string;
  prNumber: number;
  htmlUrl: string;
};

type InvariantCard = {
  id: string;
  title: string;
  assertion: string;
  category: string | null;
  fileGlob: string | null;
  clusterSize: number;
  evidence: EvidenceLink[];
};

type RepoSummary = {
  fullName: string;
  total: number;
  human: number;
  bot: number;
  botShare: number;
  topBotLogins: AuthorCount[];
  topHumanAuthors: AuthorCount[];
  buckets?: { human: BucketCounts; all: BucketCounts };
  repliesExcluded?: { human: number; all: number };
  invariants?: InvariantCard[];
};

export default function HomePage() {
  const [name, setName] = useState("aviator-co/av");
  const [limit, setLimit] = useState("500");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingest, setIngest] = useState<IngestResult | null>(null);
  const [summary, setSummary] = useState<RepoSummary | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIngest(null);
    setSummary(null);

    const parsed = parseRepo(name);
    if (!parsed) {
      setError("Use owner/repo, for example aviator-co/av.");
      return;
    }

    const limitNumber = Number(limit);
    if (!Number.isInteger(limitNumber) || limitNumber < 1 || limitNumber > 2000) {
      setError("Limit has to be a whole number from 1 to 2000.");
      return;
    }

    setLoading(true);
    try {
      const ingestBody = await request<IngestResult>(
        "POST",
        `/repos/${parsed.owner}/${parsed.repo}/ingest?limit=${limitNumber}`,
      );
      const summaryBody = await request<RepoSummary>(
        "GET",
        `/repos/${parsed.owner}/${parsed.repo}/summary`,
      );
      setIngest(ingestBody);
      setSummary(summaryBody);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
        Comment ingest
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Slop Registry</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--muted)]">
        Paste a public GitHub repo. This page pulls recent pull-request review
        comments, saves them, and shows the human-versus-bot counts. If a pipeline
        run has already classified the repo, the summary also shows buckets and drafts.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <label className="block text-sm font-medium">
            Repository
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="aviator-co/av"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-mono text-base outline-none ring-[var(--rust)] focus:ring-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Limit
            <input
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              inputMode="numeric"
              className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-mono text-base outline-none ring-[var(--rust)] focus:ring-2"
            />
          </label>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          GitHub returns 100 comments per page, newest first. A limit of 500 is five
          requests. No token is required for a public repo.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-[var(--rust)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--rust-dark)] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Pulling comments…" : "Pull comments"}
          </button>
          <button
            type="button"
            className="text-left text-sm text-[var(--muted)] underline-offset-4 hover:underline"
            onClick={() => {
              setName("aviator-co/av");
              setLimit("500");
            }}
          >
            Use aviator-co/av, limit 500
          </button>
        </div>
      </form>

      {loading && (
        <p className="mt-6 text-sm text-[var(--muted)]" role="status">
          Fetching review comments from GitHub, then writing them to Postgres. Five
          hundred comments usually finish within a minute.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      {!loading && !error && !summary && (
        <p className="mt-6 text-sm text-[var(--muted)]">Nothing pulled in this tab yet.</p>
      )}

      {ingest && summary && (
        <section className="mt-8 space-y-6">
          <div>
            <h2 className="text-xl font-semibold">{summary.fullName}</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              GitHub returned {ingest.received} comments this run (limit {ingest.requested}
              ). Postgres holds {ingest.totalStored} after the upsert. Run it again and
              that stored count should stay put if the same comments come back.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total" value={String(summary.total)} />
            <Stat label="Human" value={String(summary.human)} tone="human" />
            <Stat label="Bot" value={String(summary.bot)} tone="bot" />
            <Stat label="Bot share" value={formatShare(summary.botShare)} tone="bot" />
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            <AuthorList
              title="Top bot logins"
              rows={summary.topBotLogins}
              empty="No bot comments in this pull."
            />
            <AuthorList
              title="Top human authors"
              rows={summary.topHumanAuthors}
              empty="No human comments in this pull."
            />
          </div>

          <details className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">API payloads</summary>
            <pre className="mt-3 overflow-x-auto font-mono text-xs leading-relaxed">
              {JSON.stringify({ ingest, summary }, null, 2)}
            </pre>
          </details>

          {summary.buckets && (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <BucketTable
                  title="Top-level human comments"
                  counts={summary.buckets.human}
                />
                <BucketTable
                  title="Top-level comments, bots included"
                  counts={summary.buckets.all}
                />
              </div>
              {summary.repliesExcluded && (
                <p className="text-sm leading-relaxed text-[var(--muted)]">
                  Bucket tables count top-level review comments. Thread replies excluded:{" "}
                  {summary.repliesExcluded.human} human, {summary.repliesExcluded.all} including
                  bots. Total, Human, and Bot above count every stored comment.
                </p>
              )}
            </div>
          )}

          {summary.invariants && summary.invariants.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Draft invariants</h3>
              {summary.invariants.map((invariant) => (
                <article
                  key={invariant.id}
                  className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3"
                >
                  <h4 className="font-medium">{invariant.title}</h4>
                  <p className="mt-1 text-sm leading-relaxed">{invariant.assertion}</p>
                  <p className="mt-2 font-mono text-xs text-[var(--muted)]">
                    {invariant.category ?? "unset"} · {invariant.fileGlob ?? "**"} ·{" "}
                    {invariant.clusterSize} comments
                  </p>
                  {invariant.evidence.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {invariant.evidence.map((link) => (
                        <li key={link.commentId}>
                          <a
                            className="underline-offset-4 hover:underline"
                            href={link.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Comment {link.commentId}
                          </a>
                          <span className="text-[var(--muted)]"> on PR #{link.prNumber}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}

          <p className="text-sm leading-relaxed text-[var(--muted)]">
            This button only ingests. Classification, clustering, and drafts run with{" "}
            <span className="font-mono">pnpm run:pipeline owner/repo</span> once{" "}
            <span className="font-mono">OPENAI_API_KEY</span> is set. Bot share is{" "}
            {summary.botShare} as a fraction (0 to 1). Unlabeled means the classifier
            has not labeled that row yet.
          </p>
        </section>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "human" | "bot";
}) {
  const color =
    tone === "human" ? "text-[var(--pine)]" : tone === "bot" ? "text-[var(--rust)]" : "";
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl font-semibold ${color}`}>{value}</dd>
    </div>
  );
}

function AuthorList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: AuthorCount[];
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">{empty}</p>
      ) : (
        <ol className="mt-2 space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.login} className="flex items-baseline justify-between gap-3">
              <span className="truncate font-mono">{row.login}</span>
              <span className="font-mono text-[var(--muted)]">{row.count}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BucketTable({ title, counts }: { title: string; counts: BucketCounts }) {
  const rows: Array<[string, number]> = [
    ["deterministic", counts.deterministic],
    ["execution_testable", counts.execution_testable],
    ["judgment", counts.judgment],
    ["noise", counts.noise],
    ["unlabeled", counts.unlabeled],
  ];
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map(([label, count]) => (
          <li key={label} className="flex items-baseline justify-between gap-3">
            <span className="font-mono">{label}</span>
            <span className="font-mono text-[var(--muted)]">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function parseRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function formatShare(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

async function request<T>(method: "GET" | "POST", path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error(
      `Could not reach the API at ${API_URL}. Start it with pnpm dev:api and check that Postgres is up.`,
    );
  }

  const text = await response.text();
  let body: { message?: string | string[] } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { message?: string | string[] };
    } catch {
      throw new Error(text.slice(0, 300));
    }
  }
  if (!response.ok) {
    const message = body.message;
    const detail = Array.isArray(message) ? message.join(", ") : message;
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return body as T;
}
