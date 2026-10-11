import { Injectable, Logger } from '@nestjs/common';
import { retryOnRateLimit } from '../classify/rate-limit-retry';

type EmbeddingClient = {
  embedDocuments: (texts: string[]) => Promise<number[][]>;
};

@Injectable()
export class OpenAiEmbedder {
  private readonly logger = new Logger(OpenAiEmbedder.name);
  private client: EmbeddingClient | null = null;

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const client = await this.ensureClient();
    return retryOnRateLimit(() => client.embedDocuments(texts));
  }

  private async ensureClient(): Promise<EmbeddingClient> {
    if (this.client) return this.client;
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is unset. Embeddings need it. Add it to the repo-root .env and restart the API.',
      );
    }

    const { OpenAIEmbeddings } = await import('@langchain/openai');
    // maxRetries: 0 so a 429 is handled by retryOnRateLimit, same as classify.
    // batchSize is how many texts LangChain puts in one HTTP call. We also
    // slice to 64 in ClusterService so a failed batch can be retried
    // without re-sending rows we already stored.
    this.client = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      maxRetries: 0,
      batchSize: 64,
    });
    this.logger.log('Embedding model: text-embedding-3-small');
    return this.client;
  }
}
