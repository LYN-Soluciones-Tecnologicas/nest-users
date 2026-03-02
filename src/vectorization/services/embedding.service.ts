import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as https from 'https';
import { TenderEmbedding } from '../entities/tender-embedding.entity';

/**
 * Service for generating and managing vector embeddings.
 *
 * Supports two providers:
 * - 'local': Uses Transformers.js (loaded dynamically)
 * - 'jina': Uses Jina AI API (best for Spanish text)
 *
 * Embeddings are stored in tender_embeddings table.
 * When pgvector extension is available, similarity search
 * uses cosine distance for efficient nearest-neighbor queries.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly provider: string;
  private readonly jinaApiKey: string;
  private pipeline: any = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(TenderEmbedding)
    private readonly embeddingRepo: Repository<TenderEmbedding>,
  ) {
    this.provider = this.config.get<string>('embedding.provider') || 'local';
    this.jinaApiKey = this.config.get<string>('embedding.jinaApiKey') || '';
  }

  /**
   * Generate embedding for a text string.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (this.provider === 'jina' && this.jinaApiKey) {
      return this.generateJinaEmbedding(text);
    }
    return this.generateLocalEmbedding(text);
  }

  /**
   * Embed a tender's text and store the embedding.
   */
  async embedTender(
    tenderId: string,
    text: string,
    source = 'combined',
  ): Promise<TenderEmbedding> {
    const existing = await this.embeddingRepo.findOne({
      where: { tenderId },
    });

    const embedding = await this.generateEmbedding(text);

    if (existing) {
      existing.embedding = embedding;
      existing.embeddedText = text;
      existing.textSource = source;
      return this.embeddingRepo.save(existing);
    }

    return this.embeddingRepo.save(
      this.embeddingRepo.create({
        tenderId,
        embeddedText: text,
        textSource: source,
        embedding,
        dimension: embedding.length,
      }),
    );
  }

  /**
   * Find similar tenders by text query.
   * Uses cosine similarity on stored embeddings.
   */
  async findSimilar(
    queryText: string,
    limit = 10,
  ): Promise<{ tenderId: string; similarity: number }[]> {
    const queryEmbedding = await this.generateEmbedding(queryText);

    // Fetch all embeddings and compute similarity in-memory.
    // With pgvector, this would be a single SQL query:
    // SELECT tender_id, 1 - (embedding <=> $1) as similarity
    // FROM tender_embeddings ORDER BY embedding <=> $1 LIMIT $2
    const allEmbeddings = await this.embeddingRepo.find();

    const results = allEmbeddings
      .map((e) => ({
        tenderId: e.tenderId,
        similarity: this.cosineSimilarity(queryEmbedding, e.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  }

  /**
   * Batch embed multiple tenders.
   */
  async embedBatch(
    items: { tenderId: string; text: string }[],
  ): Promise<number> {
    let count = 0;
    for (const item of items) {
      try {
        await this.embedTender(item.tenderId, item.text);
        count++;
      } catch (error) {
        this.logger.error(
          `Failed to embed tender ${item.tenderId}: ${error.message}`,
        );
      }
    }
    return count;
  }

  private async generateLocalEmbedding(text: string): Promise<number[]> {
    try {
      if (!this.pipeline) {
        // Dynamic import for Transformers.js (optional dependency)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const transformers = await (Function('return import("@huggingface/transformers")')() as Promise<any>);
        this.pipeline = await transformers.pipeline(
          'feature-extraction',
          'Xenova/multilingual-e5-base',
        );
      }

      const output = await this.pipeline(text, {
        pooling: 'mean',
        normalize: true,
      });

      return Array.from(output.data);
    } catch (error) {
      this.logger.warn(
        `Local embedding failed (Transformers.js not installed?): ${error.message}. ` +
          'Falling back to simple hash-based embedding.',
      );
      return this.fallbackEmbedding(text);
    }
  }

  private async generateJinaEmbedding(text: string): Promise<number[]> {
    const payload = JSON.stringify({
      input: [text],
      model: 'jina-embeddings-v2-base-es',
    });

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.jina.ai',
          path: '/v1/embeddings',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.jinaApiKey}`,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString());
              resolve(body.data[0].embedding);
            } catch (e) {
              reject(e);
            }
          });
        },
      );

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Simple fallback embedding for when ML models aren't available.
   * Uses character-level hashing to produce a fixed-size vector.
   * NOT suitable for production similarity search.
   */
  private fallbackEmbedding(text: string): number[] {
    const dim = 384;
    const vec = new Array(dim).fill(0);
    const normalized = text.toLowerCase();

    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      const idx = (charCode * (i + 1)) % dim;
      vec[idx] += 1;
    }

    // Normalize
    const magnitude = Math.sqrt(
      vec.reduce((sum, v) => sum + v * v, 0),
    );
    if (magnitude > 0) {
      for (let i = 0; i < dim; i++) {
        vec[i] /= magnitude;
      }
    }

    return vec;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
}
