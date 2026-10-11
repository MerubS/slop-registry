# Day 1 ingest: aviator-co/av

Run on **2026-10-11**, times in UTC. `GITHUB_TOKEN` was unset, so GitHub was called unauthenticated. Limit was 500. Postgres was the local `pgvector/pgvector:pg16` container from `docker-compose.yml`.

Nothing below is estimated. The JSON blocks are the response bodies. Status lines are the HTTP status from those calls.

## First ingest

Started `2026-10-11T01:45:15Z`. Response returned by `2026-10-11T01:45:33Z`.

```bash
curl -sS -X POST "http://127.0.0.1:43124/repos/aviator-co/av/ingest?limit=500"
```

`HTTP/1.1 201 Created`

```json
{
    "fullName": "aviator-co/av",
    "requested": 500,
    "received": 500,
    "totalStored": 500
}
```

`201` is Nest's default for `@Post`. It does not mean all 500 rows were new inserts. `totalStored` is the count in Postgres after the upsert.

## Summary

`2026-10-11T01:45:40Z`

```bash
curl -sS "http://127.0.0.1:43124/repos/aviator-co/av/summary"
```

`HTTP/1.1 200 OK`

```json
{
    "fullName": "aviator-co/av",
    "total": 500,
    "human": 345,
    "bot": 155,
    "botShare": 0.31,
    "topBotLogins": [
        {
            "login": "gemini-code-assist[bot]",
            "count": 151
        },
        {
            "login": "coderabbitai[bot]",
            "count": 3
        },
        {
            "login": "aviator-app[bot]",
            "count": 1
        }
    ],
    "topHumanAuthors": [
        {
            "login": "draftcode",
            "count": 84
        },
        {
            "login": "twavv",
            "count": 76
        },
        {
            "login": "jainankit",
            "count": 62
        },
        {
            "login": "tulioz",
            "count": 36
        },
        {
            "login": "Konboi",
            "count": 23
        },
        {
            "login": "ErichKramer",
            "count": 21
        },
        {
            "login": "Brookke",
            "count": 13
        },
        {
            "login": "vaskevich",
            "count": 8
        },
        {
            "login": "amartani",
            "count": 6
        },
        {
            "login": "brain-crystal",
            "count": 3
        }
    ]
}
```

`botShare` is a fraction from 0 to 1, rounded to 4 decimal places. 155 / 500 = 0.31.

`topHumanAuthors` is the top 10. Ties break by `localeCompare` on the login. `brain-crystal` and `Chafid` both have 3 comments. `brain-crystal` sorts first, so `Chafid` is not in this list. The SQL below shows the rest.

## Second ingest (idempotency)

Same command again, immediately after the summary. The API log recorded the second pull finishing at 01:45:54 UTC. Summary fetched again at `2026-10-11T01:45:54Z`.

`HTTP/1.1 201 Created`

```json
{
    "fullName": "aviator-co/av",
    "requested": 500,
    "received": 500,
    "totalStored": 500
}
```

The second summary body was the same JSON as the first: `total` 500, `human` 345, `bot` 155, `botShare` 0.31, same top lists.

## Database cross-check

```sql
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE "isBot") AS bot,
       COUNT(*) FILTER (WHERE NOT "isBot") AS human
FROM "ReviewComment";
```

```text
 total | bot | human
-------+-----+-------
   500 | 155 |   345
```

```sql
SELECT "isBot", author, COUNT(*)
FROM "ReviewComment"
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC, 2 ASC;
```

```text
 isBot |         author          | count
-------+-------------------------+-------
 t     | gemini-code-assist[bot] |   151
 t     | coderabbitai[bot]       |     3
 t     | aviator-app[bot]        |     1
 f     | draftcode               |    84
 f     | twavv                   |    76
 f     | jainankit               |    62
 f     | tulioz                  |    36
 f     | Konboi                  |    23
 f     | ErichKramer             |    21
 f     | Brookke                 |    13
 f     | vaskevich               |     8
 f     | amartani                |     6
 f     | brain-crystal           |     3
 f     | Chafid                  |     3
 f     | btjfsu                  |     2
 f     | davi-maciel             |     2
 f     | doratzeng               |     2
 f     | simsinght               |     2
 f     | willschnicke-silkline   |     2
```

Every bot login in this pull ends in `[bot]`. `bucket` and `embedding` were null on all 500 rows.

```sql
SELECT MIN("createdAt") AS oldest,
       MAX("createdAt") AS newest,
       COUNT(DISTINCT "prNumber") AS pull_requests
FROM "ReviewComment";
```

```text
       oldest        |       newest        | pull_requests
---------------------+---------------------+---------------
 2023-05-31 02:41:40 | 2026-08-27 00:27:33 |           161
```

Those timestamps are the `created_at` values GitHub sent, stored as `timestamp(3)`.

The five newest stored comments:

```text
         author          | isBot | prNumber |      createdAt
-------------------------+-------+----------+---------------------
 coderabbitai[bot]       | t     |      787 | 2026-08-27 00:27:33
 coderabbitai[bot]       | t     |      778 | 2026-07-26 08:38:44
 gemini-code-assist[bot] | t     |      773 | 2026-07-10 01:59:50
 coderabbitai[bot]       | t     |      756 | 2026-07-09 01:01:35
 jainankit               | f     |      766 | 2026-07-08 02:33:25
```

Four of the five newest comments are bots. Across the whole 500, bots are 155 / 500. The recent tail and the 500-comment window are different facts.

## Rate limit on this run

Unauthenticated. The API log for each page:

```text
Fetched 100 comments (100/500 toward the limit). Rate limit remaining: 58
Fetched 100 comments (200/500 toward the limit). Rate limit remaining: 57
Fetched 100 comments (300/500 toward the limit). Rate limit remaining: 56
Fetched 100 comments (400/500 toward the limit). Rate limit remaining: 55
Fetched 100 comments (500/500 toward the limit). Rate limit remaining: 54
```

Second pull:

```text
Fetched 100 comments (100/500 toward the limit). Rate limit remaining: 51
Fetched 100 comments (200/500 toward the limit). Rate limit remaining: 50
Fetched 100 comments (300/500 toward the limit). Rate limit remaining: 49
Fetched 100 comments (400/500 toward the limit). Rate limit remaining: 48
Fetched 100 comments (500/500 toward the limit). Rate limit remaining: 47
```

Remaining dropped by three between the two pulls, and this process did not log a GitHub call in that gap. This machine's IP is shared, so other clients can spend the same unauthenticated budget. No backoff ran. Both pulls finished.

## What this run did not count

Earlier the same day, one request with `per_page=2` returned a `Link` header whose `rel="last"` URL ended in `page=424`. That means the repo had more review comments than this 500. This run did not walk the rest of the pages, so there is no measured total for the whole history here.

## Errors

The two ingests and both summary calls succeeded. No error body was returned.
