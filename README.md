# Slop Registry

Slop Registry pulls a public GitHub repo's pull-request review comments, separates human comments from bots, and drafts the recurring ones as team rules ("invariants"). The name comes from Ankit Jain's line about building an "AI slop registry": the review comments a team keeps repeating.

Day 1 fetches the comments and counts humans against bots. Day 2 classifies each comment, clusters the ones that recur, and drafts invariants with links back to the source comments. The measured day-1 run on `aviator-co/av` is in [docs/day1-results.md](docs/day1-results.md). How the code fits together, and the answers you will want in an interview, are in [docs/EXPLAINER.md](docs/EXPLAINER.md).

`docs/day2-results.md` is not in the repo until you run the pipeline on a machine that has an OpenAI key. The script writes that file from the API responses. Do not fill it in by hand.

## Run it locally

You need Node 22 or newer, pnpm, and Docker. The OpenAI client package requires Node 22.

```bash
pnpm install
cp .env.example .env
ln -sfn ../../.env apps/api/.env
docker compose up -d
pnpm db:migrate
pnpm dev
```

The `ln` target is relative to `apps/api`, so `apps/api/.env` points at the root `.env`. Prisma reads that file. The API process loads the same file on startup.

Then open:

- Web: [http://127.0.0.1:43123](http://127.0.0.1:43123)
- API: [http://127.0.0.1:43124](http://127.0.0.1:43124)
- Postgres: `localhost:54329` (user `slop`, password `slop`, database `slop_registry`)

`pnpm dev` starts the web app and the API together. `pnpm dev:web` and `pnpm dev:api` start one of them.

The page has an `owner/repo` field and a limit (default 500). It calls `POST /repos/:owner/:repo/ingest`, then `GET /repos/:owner/:repo/summary`. The button does not call the model. Classification is the pipeline below.

## Run the real day-2 pipeline

Set `OPENAI_API_KEY` in the root `.env`, restart `pnpm dev` so the API sees it, then in another terminal:

```bash
pnpm run:pipeline aviator-co/av
```

That one command calls, in order:

1. `POST /repos/aviator-co/av/ingest?limit=500`
2. `POST /repos/aviator-co/av/classify` (top-level human comments only)
3. `POST /repos/aviator-co/av/cluster?threshold=0.6`
4. `POST /repos/aviator-co/av/invariants?threshold=0.6`
5. `GET /repos/aviator-co/av/summary`

It also reads the classifications and the two exports, then writes [docs/day2-results.md](docs/day2-results.md). The script talks only to the local API. It does not read the OpenAI key. If a step fails, it prints the error and does not write the file.

Optional environment variables for that script: `API_URL` (default `http://127.0.0.1:43124`), `PIPELINE_LIMIT` (default `500`), `PIPELINE_THRESHOLD` (default `0.6`), `PIPELINE_INCLUDE_BOTS=true`.

Restart `pnpm dev` after pulling this code so the API process is the new one. `pnpm db:migrate` applies the thread columns and, in a later migration, clears embeddings only. Run 2 labels stay, so classify is a cache read. The cleared vectors are rebuilt from the comment body. Ingest still does not clear labels or embeddings after that.

```bash
pnpm db:migrate
pnpm run:pipeline aviator-co/av
```

## Call the API directly

```bash
curl -sS -X POST "http://127.0.0.1:43124/repos/aviator-co/av/ingest?limit=500"
curl -sS -X POST "http://127.0.0.1:43124/repos/aviator-co/av/classify"
curl -sS -X POST "http://127.0.0.1:43124/repos/aviator-co/av/cluster?threshold=0.6"
curl -sS -X POST "http://127.0.0.1:43124/repos/aviator-co/av/invariants?threshold=0.6"
curl -sS "http://127.0.0.1:43124/repos/aviator-co/av/summary"
curl -sS "http://127.0.0.1:43124/repos/aviator-co/av/invariants.yaml"
curl -sS "http://127.0.0.1:43124/repos/aviator-co/av/invariants.md"
```

Ingest returns `{ fullName, requested, received, totalStored }`. `received` is how many comments this call got from GitHub, after the limit. `totalStored` is how many rows Postgres has for that repo after the upsert. A second call with the same comments should leave `totalStored` unchanged.

Summary returns the day-1 counts (`total`, `human`, `bot`, `botShare`, top authors) plus `buckets.human`, `buckets.all`, `repliesExcluded`, and `invariants` with evidence URLs. `total`, `human`, and `bot` count every stored comment. The bucket split does not: thread replies are reported in `repliesExcluded` (`human` and `all`) and left out of the buckets. `botShare` is a fraction from 0 to 1. The top lists are at most 10 logins. If this repo has never been ingested, summary returns 404.

`limit` defaults to 500 and must be from 1 to 2000. GitHub is asked for 100 comments per page, newest first (`sort=created&direction=desc`).

Classify labels top-level comments whose `bucket` is still null. A top-level comment has no `in_reply_to_id`. Replies are context for that comment, along with the diff hunk, and they are not labeled. The response includes `skippedReplies`. Human comments only, unless you pass `includeBots=true`. A comment that already has a bucket is not sent to the model again. Each label has a bucket (`deterministic`, `execution_testable`, `judgment`, `noise`), one of Verify's nine categories, and a reason of 20 words or fewer. Noise is only "LGTM", thanks, an acknowledgement, or a pure typo fix. A concrete suggestion is classified as the rule that change implies. The chat model is `OPENAI_MODEL`, default `gpt-4o-mini`, temperature 0. Requests run `CLASSIFY_CONCURRENCY` at a time (default 4) and retry on HTTP 429.

Cluster embeds top-level non-noise comments with `text-embedding-3-small` into the pgvector column. The embedded text is the comment body, plus a short excerpt of the changed diff lines that is never longer than the comment. The path is not in the vector. Grouping is complete linkage: every pair in a cluster is at or above `threshold` (default 0.6, still overridable). A cluster is kept when it has at least two comments from at least two pull requests. The response includes `similarity`: max, median, and how many cross-PR pairs sit at or above 0.6, 0.7, and 0.8. Comments that already have an embedding are not embedded again.

Invariants asks the model which comments in a cluster state the same specific rule, drops the rest, and drafts only when two supporting comments from two pull requests remain. The file glob and the evidence links use those supporting comments. `supportCount` is how many comments state the rule. `prCount` is how many pull requests they span ("seen in N pull requests"). At most 10 verified drafts are stored. Running it again replaces this repo's drafts instead of appending a second copy.

## Tests

```bash
pnpm test
pnpm lint
pnpm build
```

`pnpm test` runs the API unit tests. They do not need Docker, GitHub, or an OpenAI key. The model and the embedding client are not called. The tests cover the label schema, the "already labeled" cache, the clustering threshold, the two-pull-request rule, and file-glob suggestion. The Postgres proof for ingest is the day-1 run: ingesting `aviator-co/av` twice left the stored count at 500.

## Environment

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. Must match the user, password, database, and host port in `docker-compose.yml`. |
| `GITHUB_TOKEN` | no | Sent as `Authorization: Bearer` when it is non-empty. Unset means unauthenticated GitHub, which is 60 requests per hour. A token that can read public repos raises that to 5,000 per hour. |
| `OPENAI_API_KEY` | for day 2 | Classify, embeddings, and invariant drafts read this. Unit tests do not. |
| `OPENAI_MODEL` | no | Chat model for labels and drafts. Default `gpt-4o-mini`. |
| `CLASSIFY_CONCURRENCY` | no | Parallel classification calls. Default 4. Integer from 1 to 16. |
| `PORT` | no | API port. Default `43124`. |
| `WEB_ORIGIN` | no | Extra CORS origin. `http://127.0.0.1:43123` and `http://localhost:43123` are always allowed. |
| `NEXT_PUBLIC_API_URL` | no | Where the page sends requests. Default `http://127.0.0.1:43124`, also set in `apps/web/.env.development`. |

Do not commit a real token or API key. `.env` is gitignored.

## Layout

```text
apps/web          Next.js 14 page. One form, then the summary.
apps/api          NestJS API. Ingest, classify, cluster, invariants, summary.
apps/api/prisma   Schema, the init migration (pgvector), and the thread migration.
docker-compose.yml   Postgres 16 with pgvector, host port 54329.
scripts/run-pipeline.mjs   Writes docs/day2-results.md from a live API run.
docs/EXPLAINER.md    Walkthrough, decisions, interview questions.
docs/day1-results.md Measured aviator-co/av ingest.
```

## Limits

The GitHub endpoint used here is diff review comments, not the review summary body and not issue comments. Public repos only. Labels are a model's judgment at temperature 0, cached on the row. Thread replies are not classified. Clusters require every pair to meet the threshold, and a draft is kept only when the model can point at two comments from two pull requests that state that rule. Drafts are not active Verify rules. Details are in the explainer.
