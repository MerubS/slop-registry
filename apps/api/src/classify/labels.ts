import { z } from 'zod';

// The four buckets are Ankit Jain's split, plus noise.
// Noise is separate on purpose: "LGTM" is not a rule, and it should not
// land in the 45/30/25 comparison or in a cluster.
export const BUCKETS = [
  'deterministic',
  'execution_testable',
  'judgment',
  'noise',
] as const;

// Verify's nine default categories. The names match the docs so an export
// can be compared with a real invariant without a translation table.
export const CATEGORIES = [
  'functional_correctness',
  'test_coverage',
  'security',
  'performance',
  'accessibility',
  'observability',
  'backwards_compatibility',
  'documentation',
  'code_style',
] as const;

export type Bucket = (typeof BUCKETS)[number];
export type Category = (typeof CATEGORIES)[number];

export type CommentLabel = {
  bucket: Bucket;
  category: Category;
  reason: string;
};

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function clampWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

// This is the schema the tests lock down. A reason of 21 words does not parse.
// The model call uses a looser schema (see OpenAiClassifier) and then
// parseClassification, which clamps the reason so one chatty reply still
// stores a value this schema accepts.
export const ClassificationSchema = z.object({
  bucket: z.enum(BUCKETS),
  category: z.enum(CATEGORIES),
  reason: z
    .string()
    .trim()
    .min(1)
    .superRefine((reason, ctx) => {
      if (wordCount(reason) > 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'reason must be 20 words or fewer',
        });
      }
    }),
});

const LooseClassification = z.object({
  bucket: z.enum(BUCKETS),
  category: z.enum(CATEGORIES),
  reason: z.string(),
});

export function parseClassification(input: unknown): CommentLabel {
  const loose = LooseClassification.parse(input);
  const reason = clampWords(loose.reason, 20);
  return ClassificationSchema.parse({
    bucket: loose.bucket,
    category: loose.category,
    reason,
  });
}
