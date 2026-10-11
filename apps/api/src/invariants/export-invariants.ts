import { InvariantView } from './load-invariants';

// A small writer for this one document. Every string is quoted, so a title
// with a colon or a quote cannot break the YAML. This is not a general
// YAML library.
export function renderInvariantsYaml(
  fullName: string,
  invariants: InvariantView[],
): string {
  const lines = [
    '# Draft invariants from Slop Registry.',
    '# These are not active Verify rules. An admin still has to promote them.',
    `repo: ${yamlQuote(fullName)}`,
    'invariants:',
  ];

  if (invariants.length === 0) {
    lines.push('  []');
    return `${lines.join('\n')}\n`;
  }

  for (const invariant of invariants) {
    lines.push(`  - title: ${yamlQuote(invariant.title)}`);
    lines.push(`    assertion: ${yamlQuote(invariant.assertion)}`);
    lines.push(`    category: ${yamlQuote(invariant.category ?? '')}`);
    lines.push(`    file_path_glob: ${yamlQuote(invariant.fileGlob ?? '**')}`);
    lines.push(`    cluster_size: ${invariant.clusterSize}`);
    lines.push(`    support_count: ${invariant.supportCount}`);
    lines.push(`    pr_count: ${invariant.prCount}`);
    lines.push('    source_comment_ids:');
    if (invariant.sourceCommentIds.length === 0) {
      lines.push('      []');
    } else {
      for (const id of invariant.sourceCommentIds) {
        lines.push(`      - ${id}`);
      }
    }
    lines.push('    evidence:');
    if (invariant.evidence.length === 0) {
      lines.push('      []');
    } else {
      for (const link of invariant.evidence) {
        lines.push(`      - comment_id: ${link.commentId}`);
        lines.push(`        pr_number: ${link.prNumber}`);
        lines.push(`        url: ${yamlQuote(link.htmlUrl)}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

export function renderInvariantsMarkdown(
  fullName: string,
  invariants: InvariantView[],
): string {
  const lines = [
    `# Draft invariants for ${fullName}`,
    '',
    'These are drafts mined from recurring human review comments. They are not active rules.',
    '',
  ];

  if (invariants.length === 0) {
    lines.push('No draft invariants for this repo yet.');
    lines.push('');
    return lines.join('\n');
  }

  invariants.forEach((invariant, index) => {
    const seenIn =
      invariant.prCount ||
      new Set(invariant.evidence.map((link) => link.prNumber)).size;
    lines.push(`## ${index + 1}. ${invariant.title}`);
    lines.push('');
    lines.push(`**Category:** ${invariant.category ?? 'unset'}`);
    lines.push('');
    lines.push(`**File glob:** \`${invariant.fileGlob ?? '**'}\``);
    lines.push('');
    lines.push(
      `**Seen in ${seenIn} pull requests.** ${invariant.supportCount || invariant.clusterSize} comments state this rule.`,
    );
    lines.push('');
    lines.push(`> ${invariant.assertion.replace(/\s+/g, ' ')}`);
    lines.push('');
    lines.push('Evidence:');
    lines.push('');
    if (invariant.evidence.length === 0) {
      lines.push('- No source comment URL was stored.');
    } else {
      for (const link of invariant.evidence) {
        lines.push(
          `- [Comment ${link.commentId}](${link.htmlUrl}) on PR #${link.prNumber}`,
        );
      }
    }
    lines.push('');
  });

  return lines.join('\n');
}

function yamlQuote(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')}"`;
}
