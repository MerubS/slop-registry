#!/usr/bin/env node
// Runs the day-2 pipeline against a local API and writes docs/day2-results.md
// from the responses. This file does not call OpenAI. The API does, so
// OPENAI_API_KEY has to be in the API's environment before you start it.
//
//   pnpm dev
//   pnpm run:pipeline aviator-co/av
//
// Optional environment variables:
//   API_URL              default http://127.0.0.1:43124
//   PIPELINE_LIMIT       default 500
//   PIPELINE_THRESHOLD   default 0.82
//   PIPELINE_INCLUDE_BOTS  set to true to classify bot comments too

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoArg = process.argv.slice(2).find((arg) => arg !== '--');
const usage = `Usage: pnpm run:pipeline owner/repo
Example: pnpm run:pipeline aviator-co/av

The API has to be running first (pnpm dev), with Postgres up and OPENAI_API_KEY set.`;

if (!repoArg || repoArg === '--help' || repoArg === '-h') {
  console.log(usage);
  process.exit(repoArg ? 0 : 1);
}

const match = repoArg.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);
if (!match) {
  console.error(`Expected owner/repo, got ${repoArg}`);
  console.error(usage);
  process.exit(1);
}

const owner = match[1];
const repo = match[2];
const fullName = `${owner}/${repo}`;
const apiUrl = (process.env.API_URL || 'http://127.0.0.1:43124').replace(/\/$/, '');
const limit = positiveInt(process.env.PIPELINE_LIMIT, 500, 'PIPELINE_LIMIT');
const threshold = thresholdValue(process.env.PIPELINE_THRESHOLD);
const includeBots = process.env.PIPELINE_INCLUDE_BOTS === 'true';
const root = fileURLToPath(new URL('..', import.meta.url));
const outPath = resolve(root, 'docs/day2-results.md');
const startedAt = new Date();

const steps = [];

const ingest = await request(
  'POST',
  `/repos/${owner}/${repo}/ingest?limit=${limit}`,
);
steps.push(ingest);
requireOk(ingest, 'ingest');

const classifyPath =
  `/repos/${owner}/${repo}/classify` + (includeBots ? '?includeBots=true' : '');
const classify = await request('POST', classifyPath);
steps.push(classify);
requireOk(classify, 'classify');

const cluster = await request(
  'POST',
  `/repos/${owner}/${repo}/cluster?threshold=${threshold}`,
);
steps.push(cluster);
requireOk(cluster, 'cluster');

const invariants = await request(
  'POST',
  `/repos/${owner}/${repo}/invariants?threshold=${threshold}`,
);
steps.push(invariants);
requireOk(invariants, 'invariants');

const summary = await request('GET', `/repos/${owner}/${repo}/summary`);
steps.push(summary);
requireOk(summary, 'summary');

const classifications = await request(
  'GET',
  `/repos/${owner}/${repo}/classifications`,
);
steps.push(classifications);
requireOk(classifications, 'classifications');

const yamlExport = await request('GET', `/repos/${owner}/${repo}/invariants.yaml`);
steps.push(yamlExport);
requireOk(yamlExport, 'invariants.yaml');

const markdownExport = await request('GET', `/repos/${owner}/${repo}/invariants.md`);
steps.push(markdownExport);
requireOk(markdownExport, 'invariants.md');

const summaryBody = summary.json;
const classifyBody = classify.json;
const clusterBody = cluster.json;
const humanBuckets = summaryBody.buckets.human;
const allBuckets = summaryBody.buckets.all;
const humanNonNoise =
  humanBuckets.deterministic +
  humanBuckets.execution_testable +
  humanBuckets.judgment;

const classifiedHumans = (classifications.json.comments || []).filter(
  (comment) => comment.isBot === false,
);
const sample = pickRandom(classifiedHumans, 10);

const markdown = render({
  startedAt,
  fullName,
  limit,
  threshold,
  includeBots,
  apiUrl,
  steps,
  summaryBody,
  classifyBody,
  clusterBody,
  invariantsBody: invariants.json,
  humanBuckets,
  allBuckets,
  humanNonNoise,
  sample,
  samplePool: classifiedHumans.length,
  yamlStatus: yamlExport.status,
  markdownStatus: markdownExport.status,
});

writeFileSync(outPath, markdown);
console.log(`\nWrote ${outPath}`);

function positiveInt(raw, fallback, name) {
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    console.error(`${name} must be a positive integer, got ${raw}`);
    process.exit(1);
  }
  const value = Number(raw);
  if (value < 1) {
    console.error(`${name} must be a positive integer, got ${raw}`);
    process.exit(1);
  }
  return value;
}

function thresholdValue(raw) {
  if (raw === undefined || raw === '') return '0.82';
  if (!/^\d+(\.\d+)?$/.test(raw) || Number(raw) < 0 || Number(raw) > 1) {
    console.error(`PIPELINE_THRESHOLD must be a number from 0 to 1, got ${raw}`);
    process.exit(1);
  }
  return raw;
}

async function request(method, path) {
  const url = `${apiUrl}${path}`;
  console.log(`\n${method} ${url}`);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { Accept: 'application/json, text/yaml, text/markdown, text/plain' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Could not reach ${url} (${message}).`);
    console.error('');
    console.error('Start the stack, then run this again:');
    console.error('  cp .env.example .env   # then set OPENAI_API_KEY');
    console.error('  ln -sfn ../../.env apps/api/.env');
    console.error('  docker compose up -d');
    console.error('  pnpm db:migrate');
    console.error('  pnpm dev');
    process.exit(1);
  }

  const text = await response.text();
  console.log(`HTTP ${response.status}`);
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { method, path, url, status: response.status, text, json };
}

function requireOk(step, name) {
  if (step.status >= 200 && step.status < 300) return;
  console.error(`\n${name} failed with HTTP ${step.status}.`);
  console.error(step.text.slice(0, 2000));
  console.error('\nNo results file was written.');
  process.exit(1);
}

function pickRandom(items, count) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swap];
    copy[swap] = current;
  }
  return copy.slice(0, count);
}

function render(input) {
  const date = input.startedAt.toISOString().slice(0, 10);
  const lines = [];
  lines.push(`# Day 2 pipeline: ${input.fullName}`);
  lines.push('');
  lines.push(
    `Run started **${input.startedAt.toISOString()}** (date ${date}). The API was \`${input.apiUrl}\`. Limit ${input.limit}. Cluster threshold ${input.threshold}. Bot comments were ${input.includeBots ? 'included' : 'excluded'} from classification.`,
  );
  lines.push('');
  lines.push(
    'Every number below is copied from an API response in this run. Nothing in this file was typed in by hand. A failed step stops the script before it writes the file.',
  );
  lines.push('');
  lines.push('## Calls');
  lines.push('');
  for (const step of input.steps) {
    lines.push(`\`${step.method} ${step.path}\` → HTTP ${step.status}`);
    lines.push('');
  }

  lines.push('## Classify');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(input.classifyBody, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Human-only bucket split');
  lines.push('');
  lines.push(
    "Ankit Jain's benchmark, from The New Stack on Sep 18, 2026, is 45% deterministic, 30% execution-testable, and 25% judgment. That split is three ways, so the benchmark column below uses human comments that are not noise as the denominator. Noise is its own row and is not forced into the 45/30/25.",
  );
  lines.push('');
  lines.push(
    `Human comments in this window: ${input.summaryBody.human}. Human comments excluding noise: ${input.humanNonNoise}. Unlabeled human comments: ${input.humanBuckets.unlabeled}.`,
  );
  lines.push('');
  lines.push(
    '| Bucket | Human count | Share of human comments | Share of human comments excluding noise | Ankit benchmark |',
  );
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  lines.push(bucketRow('deterministic', input.humanBuckets, input.summaryBody.human, input.humanNonNoise, '45%'));
  lines.push(bucketRow('execution_testable', input.humanBuckets, input.summaryBody.human, input.humanNonNoise, '30%'));
  lines.push(bucketRow('judgment', input.humanBuckets, input.summaryBody.human, input.humanNonNoise, '25%'));
  lines.push(
    `| noise | ${input.humanBuckets.noise} | ${percent(input.humanBuckets.noise, input.summaryBody.human)} | reported separately | not part of the 45/30/25 split |`,
  );
  lines.push(
    `| unlabeled | ${input.humanBuckets.unlabeled} | ${percent(input.humanBuckets.unlabeled, input.summaryBody.human)} | not classified |  |`,
  );
  lines.push('');

  lines.push('## All comments, including bots');
  lines.push('');
  lines.push(
    `Total ${input.summaryBody.total}, human ${input.summaryBody.human}, bot ${input.summaryBody.bot}, bot share ${input.summaryBody.botShare}.`,
  );
  lines.push('');
  lines.push('| Bucket | Count |');
  lines.push('| --- | ---: |');
  for (const name of ['deterministic', 'execution_testable', 'judgment', 'noise', 'unlabeled']) {
    lines.push(`| ${name} | ${input.allBuckets[name]} |`);
  }
  lines.push('');

  lines.push('## Clusters');
  lines.push('');
  lines.push(
    `Threshold ${input.clusterBody.threshold}. Comments considered (non-noise, with an embedding): ${input.clusterBody.commentsConsidered}. Embedded on this run: ${input.clusterBody.embeddedThisRun}. Already embedded before this run: ${input.clusterBody.alreadyEmbedded}. Clusters kept (2 or more comments from 2 or more pull requests): **${input.clusterBody.clusterCount}**.`,
  );
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(input.clusterBody, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Draft invariants');
  lines.push('');
  lines.push(
    `Drafted ${input.invariantsBody.drafted} of ${input.invariantsBody.clusterCount} clusters (at most 10). Model \`${input.invariantsBody.model}\`.`,
  );
  lines.push('');
  const drafted = input.invariantsBody.invariants || [];
  if (drafted.length === 0) {
    lines.push('This run stored no draft invariants.');
    lines.push('');
  } else {
    drafted.forEach((invariant, index) => {
      lines.push(`### ${index + 1}. ${invariant.title}`);
      lines.push('');
      lines.push(`- Category: \`${invariant.category}\``);
      lines.push(`- File glob: \`${invariant.fileGlob}\``);
      lines.push(`- Cluster size: ${invariant.clusterSize}`);
      lines.push(`- Assertion: ${invariant.assertion}`);
      lines.push('- Evidence:');
      if (!invariant.evidence || invariant.evidence.length === 0) {
        lines.push('  - No source URL was stored.');
      } else {
        for (const link of invariant.evidence) {
          lines.push(
            `  - [Comment ${link.commentId}](${link.htmlUrl}) on PR #${link.prNumber}`,
          );
        }
      }
      lines.push('');
    });
  }

  lines.push(
    `Export checks: \`GET /repos/${input.fullName}/invariants.yaml\` HTTP ${input.yamlStatus}, \`GET /repos/${input.fullName}/invariants.md\` HTTP ${input.markdownStatus}.`,
  );
  lines.push('');

  lines.push('## Ten classifications for a spot-check');
  lines.push('');
  lines.push(
    `${input.sample.length} rows drawn at random from ${input.samplePool} classified human comments. Running the script again picks a different ten. This is a reading list, not an accuracy score.`,
  );
  lines.push('');
  if (input.sample.length === 0) {
    lines.push('No classified human comments were returned.');
    lines.push('');
  } else {
    lines.push('| Comment | PR | Author | Bucket | Category | Reason | Excerpt |');
    lines.push('| --- | ---: | --- | --- | --- | --- | --- |');
    for (const comment of input.sample) {
      const link = `[${comment.id}](${comment.htmlUrl})`;
      lines.push(
        `| ${link} | ${comment.prNumber} | ${cell(comment.author)} | ${cell(comment.bucket)} | ${cell(comment.category)} | ${cell(comment.reason)} | ${cell(excerpt(comment.body))} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Summary response');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(input.summaryBody, null, 2));
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function bucketRow(name, buckets, humanTotal, nonNoise, benchmark) {
  return `| ${name} | ${buckets[name]} | ${percent(buckets[name], humanTotal)} | ${percent(buckets[name], nonNoise)} | ${benchmark} |`;
}

function percent(count, total) {
  if (!total) return 'n/a';
  return `${((count / total) * 100).toFixed(1)}%`;
}

function excerpt(body) {
  return String(body ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function cell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}
