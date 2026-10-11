import {
  renderInvariantsMarkdown,
  renderInvariantsYaml,
} from './export-invariants';
import { InvariantView } from './load-invariants';

const sample: InvariantView = {
  id: 'inv_1',
  title: 'Say "no" to direct writes',
  assertion: 'Writes to the users table must go through the repository.',
  category: 'functional_correctness',
  fileGlob: 'pkg/**/*.go',
  clusterSize: 2,
  sourceCommentIds: ['11', '22'],
  evidence: [
    {
      commentId: '11',
      prNumber: 4,
      htmlUrl: 'https://github.com/aviator-co/av/pull/4#discussion_r11',
    },
    {
      commentId: '22',
      prNumber: 9,
      htmlUrl: 'https://github.com/aviator-co/av/pull/9#discussion_r22',
    },
  ],
};

describe('invariant exports', () => {
  it('quotes a title that contains a colon and a double quote', () => {
    const yaml = renderInvariantsYaml('aviator-co/av', [sample]);
    expect(yaml).toContain('title: "Say \\"no\\" to direct writes"');
    expect(yaml).toContain('file_path_glob: "pkg/**/*.go"');
    expect(yaml).toContain(
      'url: "https://github.com/aviator-co/av/pull/4#discussion_r11"',
    );
    expect(yaml).toContain('cluster_size: 2');
  });

  it('links each source comment in the markdown', () => {
    const markdown = renderInvariantsMarkdown('aviator-co/av', [sample]);
    expect(markdown).toContain(
      '[Comment 11](https://github.com/aviator-co/av/pull/4#discussion_r11)',
    );
    expect(markdown).toContain('across 2 pull requests');
    expect(markdown).toContain('`pkg/**/*.go`');
  });
});
