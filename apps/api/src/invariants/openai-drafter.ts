import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { CATEGORIES } from '../classify/labels';
import { openAiModelName } from '../classify/model-name';
import { retryOnRateLimit } from '../classify/rate-limit-retry';
import { InvariantDraft, draftPrompt, parseDraft } from './draft';

type StructuredModel = {
  invoke: (input: [string, string][]) => Promise<unknown>;
};

const DRAFT_SYSTEM_PROMPT =
  'You draft one software-team invariant from recurring pull-request review comments. State the rule. Do not describe the current implementation.';

@Injectable()
export class OpenAiDrafter {
  private readonly logger = new Logger(OpenAiDrafter.name);
  private structured: StructuredModel | null = null;

  modelName(): string {
    return openAiModelName();
  }

  async draft(input: {
    fileGlob: string;
    clusterSize: number;
    comments: Array<{ prNumber: number; path: string | null; body: string }>;
  }): Promise<InvariantDraft> {
    const structured = await this.ensureModel();
    return retryOnRateLimit(async () => {
      const raw = await structured.invoke([
        ['system', DRAFT_SYSTEM_PROMPT],
        ['human', draftPrompt(input)],
      ]);
      return parseDraft(raw);
    });
  }

  private async ensureModel(): Promise<StructuredModel> {
    if (this.structured) return this.structured;
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is unset. Drafting invariants needs it. Add it to the repo-root .env and restart the API.',
      );
    }

    const { ChatOpenAI } = await import('@langchain/openai');
    const model = new ChatOpenAI({
      model: openAiModelName(),
      temperature: 0,
      // Same as classification: our retry helper owns the 429 wait.
      maxRetries: 0,
    });
    this.structured = model.withStructuredOutput(
      z.object({
        title: z.string(),
        assertion: z.string(),
        category: z.enum(CATEGORIES),
      }),
    );
    this.logger.log(`Invariant model: ${openAiModelName()} (temperature 0)`);
    return this.structured;
  }
}
