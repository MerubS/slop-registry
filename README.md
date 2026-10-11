# Slop Registry

Slop Registry pulls a public GitHub repo's pull-request review comments and shows how many came from bots. The name comes from Ankit Jain's line about building an "AI slop registry": the review comments a team keeps repeating, which later become rules.

This repo is Day 1 of that prototype. You give it `owner/repo`. It fetches recent review comments from GitHub, stores them in Postgres, and returns a human-vs-bot summary. It does not classify comments or draft invariants yet.

The measured run on `aviator-co/av` is in [docs/day1-results.md](docs/day1-results.md). How the code fits together, and the answers you will want in an interview, are in [docs/EXPLAINER.md](docs/EXPLAINER.md).

## Run it locally

You need Node 20 or newer, pnpm, and Docker.

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

The page has an `owner/repo` field and a limit (default 500). It calls `POST /repos/:owner/:repo/ingest`, then `GET /repos/:owner/:repo/summary`, and shows the counts.

## Call the API directly

```bash
curl -sS -X POST "http://127.0.0.1:43124/repos/aviator-co/av/ingest?limit=500"
curl -sS "http://127.0.0.1:43124/repos/aviator-co/av/summary"
```

Ingest returns:

```json
{ "fullName": "aviator-co/av", "requested": 500, "received": 500, "totalStored": 500 }
```

`received` is how many comments this call got from GitHub, after the limit. `totalStored` is how many rows Postgres has for that repo after the upsert. A second call with the same comments should leave `totalStored` unchanged.

Summary returns `{ total, human, bot, botShare, topBotLogins, topHumanAuthors }`. `botShare` is a fraction from 0 to 1. The top lists are at most 10 logins. If this repo has never been ingested, summary returns 404.

`limit` defaults to 500 and must be from 1 to 2000. GitHub is asked for 100 comments per page, newest first (`sort=created&direction=desc`).

## Tests

```bash
pnpm test
```

That runs the API unit tests. They cover `isBot`, Link-header parsing, and ingest idempotency. They do not need Docker or GitHub. The idempotency test uses an in-memory map keyed by comment id. The Postgres proof is the day-1 run: ingesting `aviator-co/av` twice left the stored count at 500.

## Environment

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. Must match the user, password, database, and host port in `docker-compose.yml`. |
| `GITHUB_TOKEN` | no | Sent as `Authorization: Bearer` when it is non-empty. Unset means unauthenticated GitHub, which is 60 requests per hour. A token that can read public repos raises that to 5,000 per hour. |
| `OPENAI_API_KEY` | no | Unused on day 1. Classification will read it later. |
| `PORT` | no | API port. Default `43124`. |
| `WEB_ORIGIN` | no | Extra CORS origin. `http://127.0.0.1:43123` and `http://localhost:43123` are always allowed. |
| `NEXT_PUBLIC_API_URL` | no | Where the page sends requests. Default `http://127.0.0.1:43124`, also set in `apps/web/.env.development`. |

Do not commit a real token. `.env` is gitignored.

## Layout

```text
apps/web          Next.js 14 page. One form, then the summary.
apps/api          NestJS API. Ingest and summary.
apps/api/prisma   Schema and the init migration (pgvector included).
docker-compose.yml   Postgres 16 with pgvector, host port 54329.
docs/EXPLAINER.md    Walkthrough, decisions, interview questions.
docs/day1-results.md Measured aviator-co/av output.
```

## Day 1 limits

Comments are stored and counted. They are not classified, embedded, or turned into invariants. The GitHub endpoint used here is diff review comments, not the review summary body and not issue comments. Public repos only. Details and the trade-offs are in the explainer.
