import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchProfile } from '../entities/search-profile.entity';
import { TenderEmbedding } from '../../vectorization/entities/tender-embedding.entity';
import { Tender } from '../../tenders/entities/tender.entity';
import { EmbeddingService } from '../../vectorization/services/embedding.service';
import { LlmService } from '../../ai/services/llm.service';

export interface SmartSearchResult {
  tender: Tender;
  /** Final composite score (0-1) */
  score: number;
  /** Cosine similarity to inclusion criteria */
  inclusionSimilarity: number;
  /** Cosine similarity to exclusion criteria (lower is better) */
  exclusionSimilarity: number;
  /** LLM re-ranking verdict (if used) */
  llmVerdict?: string;
  /** LLM relevance score (if used) */
  llmScore?: number;
}

const DEFAULT_RERANKING_PROMPT = `Eres un analista de licitaciones públicas. Tu empresa se dedica a: {{inclusionCriteria}}

Tu empresa NO puede optar a licitaciones que requieran: {{exclusionCriteria}}

Analiza esta licitación y determina si es relevante para tu empresa:

TÍTULO: {{tenderTitle}}
DESCRIPCIÓN: {{tenderDescription}}

Responde SOLO en este formato JSON:
{
  "relevant": true/false,
  "score": 0.0 a 1.0,
  "reason": "explicación breve",
  "risks": ["riesgo1", "riesgo2"]
}`;

@Injectable()
export class SmartSearchService {
  private readonly logger = new Logger(SmartSearchService.name);

  constructor(
    @InjectRepository(SearchProfile)
    private readonly profileRepo: Repository<SearchProfile>,
    @InjectRepository(TenderEmbedding)
    private readonly embeddingRepo: Repository<TenderEmbedding>,
    @InjectRepository(Tender)
    private readonly tenderRepo: Repository<Tender>,
    private readonly embeddingService: EmbeddingService,
    private readonly llmService: LlmService,
  ) {}

  /**
   * Execute a smart vectorial search against all tender embeddings.
   *
   * Flow:
   * 1. Get the search profile (with cached inclusion/exclusion embeddings)
   * 2. Compare all tender embeddings against inclusion/exclusion vectors
   * 3. Compute composite score = inclusionWeight * inclusionSim - exclusionWeight * exclusionSim
   * 4. Filter by thresholds
   * 5. Optionally: re-rank top-N with LLM for deeper analysis
   */
  async search(
    profileId?: string,
    limit = 50,
    useLlmReranking?: boolean,
  ): Promise<SmartSearchResult[]> {
    // 1. Get profile
    const profile = await this.getProfile(profileId);

    // 2. Ensure embeddings are cached
    await this.ensureProfileEmbeddings(profile);

    // 3. Get all tender embeddings
    const allEmbeddings = await this.embeddingRepo.find();
    if (allEmbeddings.length === 0) {
      this.logger.warn('No tender embeddings found. Run embedding batch first.');
      return [];
    }

    // 4. Score each tender
    const scored = allEmbeddings.map((te) => {
      const inclusionSim = profile.inclusionEmbedding
        ? this.cosineSimilarity(te.embedding, profile.inclusionEmbedding)
        : 0;

      const exclusionSim =
        profile.exclusionEmbedding
          ? this.cosineSimilarity(te.embedding, profile.exclusionEmbedding)
          : 0;

      // Composite score: high inclusion similarity + low exclusion similarity
      const score =
        profile.inclusionWeight * inclusionSim -
        profile.exclusionWeight * exclusionSim;

      return {
        tenderId: te.tenderId,
        score: Math.max(0, Math.min(1, score)),
        inclusionSimilarity: inclusionSim,
        exclusionSimilarity: exclusionSim,
      };
    });

    // 5. Filter by thresholds
    const filtered = scored.filter((s) => {
      const passesInclusion =
        s.inclusionSimilarity >= profile.inclusionThreshold;
      const passesExclusion =
        !profile.exclusionEmbedding ||
        s.exclusionSimilarity < profile.exclusionThreshold;
      return passesInclusion && passesExclusion;
    });

    // 6. Sort by composite score descending
    filtered.sort((a, b) => b.score - a.score);

    // 7. Fetch tender details for top results
    const topResults = filtered.slice(
      0,
      useLlmReranking ?? profile.useLlmReranking
        ? profile.llmRerankingTopN
        : limit,
    );

    const tenderIds = topResults.map((r) => r.tenderId);
    const tenders = await this.tenderRepo
      .createQueryBuilder('t')
      .whereInIds(tenderIds)
      .andWhere('t.isDismissed = false')
      .getMany();

    const tenderMap = new Map(tenders.map((t) => [t.id, t]));

    let results: SmartSearchResult[] = topResults
      .filter((r) => tenderMap.has(r.tenderId))
      .map((r) => ({
        tender: tenderMap.get(r.tenderId),
        score: r.score,
        inclusionSimilarity: r.inclusionSimilarity,
        exclusionSimilarity: r.exclusionSimilarity,
      }));

    // 8. Optional LLM re-ranking
    if (useLlmReranking ?? profile.useLlmReranking) {
      results = await this.llmRerank(results, profile);
      results.sort((a, b) => (b.llmScore ?? b.score) - (a.llmScore ?? a.score));
    }

    return results.slice(0, limit);
  }

  /**
   * LLM re-ranking: send each tender to the LLM for deeper relevance analysis.
   */
  private async llmRerank(
    results: SmartSearchResult[],
    profile: SearchProfile,
  ): Promise<SmartSearchResult[]> {
    const promptTemplate =
      profile.llmRerankingPrompt || DEFAULT_RERANKING_PROMPT;

    const reranked: SmartSearchResult[] = [];

    // Process in batches of 5 to avoid rate limiting
    for (let i = 0; i < results.length; i += 5) {
      const batch = results.slice(i, i + 5);
      const promises = batch.map(async (result) => {
        try {
          const prompt = promptTemplate
            .replace(/\{\{tenderTitle\}\}/g, result.tender.title || '')
            .replace(
              /\{\{tenderDescription\}\}/g,
              (result.tender.description || '').slice(0, 2000),
            )
            .replace(
              /\{\{inclusionCriteria\}\}/g,
              profile.inclusionPrompt,
            )
            .replace(
              /\{\{exclusionCriteria\}\}/g,
              profile.exclusionPrompt || 'N/A',
            );

          const response = await this.llmService.complete({
            systemPrompt:
              'Eres un analista experto en licitaciones públicas españolas. Responde siempre en JSON válido.',
            prompt,
            temperature: 0.1,
            maxTokens: 500,
          });

          const parsed = this.parseLlmResponse(response.text);

          return {
            ...result,
            llmVerdict: parsed.reason,
            llmScore: parsed.relevant
              ? parsed.score * result.score
              : result.score * 0.1,
          };
        } catch (error) {
          this.logger.warn(
            `LLM re-ranking failed for tender ${result.tender.id}: ${error.message}`,
          );
          return result;
        }
      });

      const batchResults = await Promise.all(promises);
      reranked.push(...batchResults);
    }

    return reranked;
  }

  private parseLlmResponse(text: string): {
    relevant: boolean;
    score: number;
    reason: string;
  } {
    try {
      // Extract JSON from the response (LLM might wrap it in markdown)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          relevant: Boolean(parsed.relevant),
          score: Math.max(0, Math.min(1, Number(parsed.score) || 0)),
          reason: String(parsed.reason || ''),
        };
      }
    } catch {
      // fallthrough
    }
    return { relevant: false, score: 0.5, reason: 'Failed to parse LLM response' };
  }

  /**
   * Ensure the search profile has cached embedding vectors.
   * Regenerates if prompts changed.
   */
  async ensureProfileEmbeddings(profile: SearchProfile): Promise<void> {
    let needsSave = false;

    if (!profile.inclusionEmbedding && profile.inclusionPrompt) {
      this.logger.log(
        `Generating inclusion embedding for profile "${profile.name}"`,
      );
      profile.inclusionEmbedding = await this.embeddingService.generateEmbedding(
        profile.inclusionPrompt,
      );
      needsSave = true;
    }

    if (!profile.exclusionEmbedding && profile.exclusionPrompt) {
      this.logger.log(
        `Generating exclusion embedding for profile "${profile.name}"`,
      );
      profile.exclusionEmbedding = await this.embeddingService.generateEmbedding(
        profile.exclusionPrompt,
      );
      needsSave = true;
    }

    if (needsSave) {
      await this.profileRepo.save(profile);
    }
  }

  private async getProfile(profileId?: string): Promise<SearchProfile> {
    if (profileId) {
      const profile = await this.profileRepo.findOne({
        where: { id: profileId },
      });
      if (!profile)
        throw new NotFoundException(`Search profile ${profileId} not found`);
      return profile;
    }

    const active = await this.profileRepo.findOne({
      where: { isActive: true },
    });
    if (!active) {
      throw new NotFoundException(
        'No active search profile found. Create one first.',
      );
    }
    return active;
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
