import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  BUCKETS,
  CATEGORIES,
  CommentLabel,
  parseClassification,
} from './labels';
import { openAiModelName } from './model-name';
import { CLASSIFY_SYSTEM_PROMPT, commentPrompt } from './prompt';
import { retryOnRateLimit } from './rate-limit-retry';

// The model sees this looser object. The 20-word cap is applied afterwards
// by parseClassification, because a JSON schema cannot express "20 words"
// in a way the API will enforce.
const ModelOutput = z.object({
  bucket: z.enum(BUCKETS),
  category: z.enum(CATEGORIES),
  reason: z.string(),
});

type StructuredModel = {
  invoke: (input: [string, string][]) => Promise<unknown>;
};

@Injectable()
export class OpenAiClassifier {
  private readonly logger = new Logger(OpenAiClassifier.name);
  private structured: StructuredModel | null = null;

  modelName(): string {
    return openAiModelName();
  }

  async classify(input: {
    path: string | null;
    body: string;
  }): Promise<CommentLabel> {
    const structured = await this.ensureModel();
    // The client is constructed with maxRetries: 0, so a 429 is not swallowed
    // by LangChain. retryOnRateLimit is the policy this code is responsible for.
    return retryOnRateLimit(async () => {
      const raw = await structured.invoke([
        ['system', CLASSIFY_SYSTEM_PROMPT],
        ['human', commentPrompt(input)],
      ]);
      return parseClassification(raw);
    });
  }

  private async ensureModel(): Promise<StructuredModel> {
    if (this.structured) return this.structured;
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is unset. Classification needs it. Add it to the repo-root .env and restart the API.',
      );
    }

    const { ChatOpenAI } = await import('@langchain/openai');
    const model = new ChatOpenAI({
      model: openAiModelName(),
      temperature: 0,
      // 0 so a 429 reaches retryOnRateLimit instead of LangChain's default
      // of six hidden retries.
      maxRetries: 0,
    });
    this.structured = model.withStructuredOutput(ModelOutput);
    this.logger.log(
      `Classification model: ${openAiModelName()} (temperature 0)`,
    );
    return this.structured;
  }
}
