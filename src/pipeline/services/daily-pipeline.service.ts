import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Tender } from '../../tenders/entities/tender.entity';
import { DailyReport } from '../entities/daily-report.entity';
import { SmartSearchService } from '../../search-profiles/services/smart-search.service';
import { SearchProfileService } from '../../search-profiles/services/search-profile.service';
import { CompanyService } from '../../company/services/company.service';
import { IngestionService } from '../../sources/services/ingestion.service';
import { LlmService } from '../../ai/services/llm.service';

/**
 * Automated daily pipeline that processes tenders in 5 steps:
 *
 * Step 1 - INGEST: Fetch new tenders from all sources
 * Step 2 - DETERMINISTIC FILTER: Apply CPV codes, keywords, budget range (CompanyProfile)
 * Step 3 - STRATEGIC FIT (vectorial): Semantic inclusion/exclusion via SearchProfile
 * Step 4 - PRIORITIZE: Score and rank remaining tenders (LLM-powered)
 * Step 5 - REPORT: Generate daily summary
 *
 * Designed as MVP: 70-80% accuracy to drastically reduce manual review.
 * Iterative improvement over time.
 */
@Injectable()
export class DailyPipelineService {
  private readonly logger = new Logger(DailyPipelineService.name);

  constructor(
    @InjectRepository(Tender)
    private readonly tenderRepo: Repository<Tender>,
    @InjectRepository(DailyReport)
    private readonly reportRepo: Repository<DailyReport>,
    private readonly ingestionService: IngestionService,
    private readonly companyService: CompanyService,
    private readonly smartSearchService: SmartSearchService,
    private readonly searchProfileService: SearchProfileService,
    private readonly llmService: LlmService,
  ) {}

  /**
   * Execute the full daily pipeline.
   * Can be triggered manually or via cron job.
   */
  async run(): Promise<DailyReport> {
    const startTime = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const errors: string[] = [];

    this.logger.log(`=== DAILY PIPELINE START: ${today} ===`);

    // --- Step 1: Ingest new tenders ---
    let totalDetected = 0;
    try {
      this.logger.log('Step 1: Ingesting new tenders from all sources...');
      const ingestionResults = await this.ingestionService.ingestAll();
      totalDetected = Object.values(ingestionResults)
        .filter((n) => n > 0)
        .reduce((sum, n) => sum + n, 0);
      this.logger.log(`Step 1 complete: ${totalDetected} new tenders ingested`);
    } catch (error) {
      errors.push(`Ingestion failed: ${error.message}`);
      this.logger.error(`Step 1 failed: ${error.message}`);
    }

    // Count all tenders from last 24h as detected (including previously ingested)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const recentTenders = await this.tenderRepo.find({
      where: { createdAt: MoreThanOrEqual(yesterday) },
    });
    totalDetected = Math.max(totalDetected, recentTenders.length);

    // --- Step 2: Deterministic filter (CPV, keywords, budget) ---
    let afterDeterministicFilter: Tender[] = [];
    try {
      this.logger.log('Step 2: Applying deterministic filters (CPV, keywords, budget)...');
      afterDeterministicFilter = await this.applyDeterministicFilter();
      this.logger.log(
        `Step 2 complete: ${afterDeterministicFilter.length} tenders pass deterministic filters`,
      );
    } catch (error) {
      errors.push(`Deterministic filter failed: ${error.message}`);
      this.logger.error(`Step 2 failed: ${error.message}`);
      // Fallback: use recent tenders without filter
      afterDeterministicFilter = recentTenders;
    }

    // --- Step 3: Strategic fit (vectorial semantic filter) ---
    let afterStrategicFilter = afterDeterministicFilter.length;
    let strategicResults: {
      tender: Tender;
      score: number;
      inclusionSimilarity: number;
      exclusionSimilarity: number;
    }[] = [];

    try {
      this.logger.log('Step 3: Applying vectorial strategic fit filter...');
      const searchResults = await this.smartSearchService.search(
        undefined, // Use active profile
        200, // Get up to 200 results
        false, // No LLM re-ranking in this step (speed)
      );

      // Filter to only include tenders from the deterministic set
      const deterministicIds = new Set(
        afterDeterministicFilter.map((t) => t.id),
      );
      strategicResults = searchResults
        .filter((r) => deterministicIds.has(r.tender.id))
        .map((r) => ({
          tender: r.tender,
          score: r.score,
          inclusionSimilarity: r.inclusionSimilarity,
          exclusionSimilarity: r.exclusionSimilarity,
        }));

      afterStrategicFilter = strategicResults.length;
      this.logger.log(
        `Step 3 complete: ${afterStrategicFilter} tenders pass vectorial filter`,
      );
    } catch (error) {
      errors.push(`Strategic filter failed: ${error.message}`);
      this.logger.error(`Step 3 failed: ${error.message}`);
      // Fallback: use deterministic results with default score
      strategicResults = afterDeterministicFilter.map((t) => ({
        tender: t,
        score: 0.5,
        inclusionSimilarity: 0.5,
        exclusionSimilarity: 0,
      }));
    }

    // --- Step 4: Prioritize top opportunities ---
    let topOpportunities: DailyReport['topOpportunities'] = [];
    try {
      this.logger.log('Step 4: Prioritizing top opportunities...');
      topOpportunities = await this.prioritize(
        strategicResults.slice(0, 30),
      );
      this.logger.log(
        `Step 4 complete: ${topOpportunities.length} top opportunities identified`,
      );
    } catch (error) {
      errors.push(`Prioritization failed: ${error.message}`);
      this.logger.error(`Step 4 failed: ${error.message}`);
      // Fallback: use top strategic results without LLM analysis
      topOpportunities = strategicResults.slice(0, 10).map((r) => ({
        tenderId: r.tender.id,
        title: r.tender.title,
        score: r.score,
        reason: `Relevancia vectorial: ${(r.score * 100).toFixed(0)}%`,
        budgetAmount: r.tender.budgetAmount,
        submissionDeadline: r.tender.submissionDeadline?.toISOString(),
      }));
    }

    // --- Step 5: Generate daily summary ---
    let summary = '';
    try {
      this.logger.log('Step 5: Generating daily summary...');
      summary = await this.generateSummary(
        totalDetected,
        afterStrategicFilter,
        topOpportunities,
      );
      this.logger.log('Step 5 complete: Summary generated');
    } catch (error) {
      errors.push(`Summary generation failed: ${error.message}`);
      this.logger.error(`Step 5 failed: ${error.message}`);
      // Fallback: basic text summary
      summary = this.generateFallbackSummary(
        totalDetected,
        afterStrategicFilter,
        topOpportunities,
      );
    }

    // --- Save report ---
    const report = this.reportRepo.create({
      reportDate: today,
      totalDetected,
      afterStrategicFilter,
      afterPrioritization: topOpportunities.length,
      topOpportunities,
      summary,
      filteredTenderIds: strategicResults.map((r) => r.tender.id),
      durationMs: Date.now() - startTime,
      errors,
      status: errors.length > 0 ? 'completed_with_errors' : 'completed',
    });

    const saved = await this.reportRepo.save(report);

    this.logger.log(
      `=== DAILY PIPELINE END: ${today} (${saved.durationMs}ms) ===`,
    );
    this.logger.log(
      `Funnel: ${totalDetected} → ${afterStrategicFilter} → ${topOpportunities.length} top`,
    );

    return saved;
  }

  /**
   * Step 2: Apply deterministic filters using CompanyProfile.
   * Scores all tenders and returns those above threshold.
   */
  private async applyDeterministicFilter(): Promise<Tender[]> {
    // Score all unscored tenders
    await this.companyService.scoreTenders();

    // Get candidates above threshold
    return this.companyService.getCandidates(200);
  }

  /**
   * Step 4: LLM-powered prioritization of top candidates.
   * Asks the LLM to evaluate viability and assign final scores.
   */
  private async prioritize(
    candidates: {
      tender: Tender;
      score: number;
    }[],
  ): Promise<DailyReport['topOpportunities']> {
    if (candidates.length === 0) return [];

    // Build a summary of all candidates for the LLM
    const tenderList = candidates
      .map(
        (c, i) =>
          `${i + 1}. "${c.tender.title}" | Presupuesto: ${c.tender.budgetAmount || 'N/A'}€ | Tipo: ${c.tender.contractType} | Plazo: ${c.tender.submissionDeadline?.toISOString().split('T')[0] || 'N/A'} | Score vectorial: ${(c.score * 100).toFixed(0)}%`,
      )
      .join('\n');

    const prompt = `Eres un analista de licitaciones para LYN Soluciones Tecnológicas (PYME de desarrollo de software, web, móvil, IA, chatbots).

Analiza estas ${candidates.length} licitaciones pre-filtradas y selecciona las 10 más viables. Evalúa:
- Alineación con capacidades de la empresa
- Presupuesto razonable para una PYME
- Probabilidad de adjudicación (barreras de entrada)
- Plazo de presentación suficiente

LICITACIONES:
${tenderList}

Responde SOLO con un JSON array de máximo 10 elementos:
[
  {
    "index": 1,
    "score": 0.0-1.0,
    "reason": "explicación breve de por qué es viable"
  }
]

Ordena de mayor a menor viabilidad.`;

    try {
      const response = await this.llmService.complete({
        systemPrompt:
          'Eres un analista experto en licitaciones públicas españolas. Responde SOLO en JSON válido.',
        prompt,
        temperature: 0.2,
        maxTokens: 2000,
      });

      const jsonMatch = response.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const ranked = JSON.parse(jsonMatch[0]);
        return ranked
          .slice(0, 10)
          .map((r: any) => {
            const idx = (r.index || 1) - 1;
            const candidate = candidates[idx];
            if (!candidate) return null;
            return {
              tenderId: candidate.tender.id,
              title: candidate.tender.title,
              score: Math.max(0, Math.min(1, r.score || 0)),
              reason: r.reason || '',
              budgetAmount: candidate.tender.budgetAmount,
              submissionDeadline:
                candidate.tender.submissionDeadline?.toISOString(),
            };
          })
          .filter(Boolean);
      }
    } catch (error) {
      this.logger.warn(`LLM prioritization failed: ${error.message}`);
    }

    // Fallback: return top 10 by vectorial score
    return candidates.slice(0, 10).map((c) => ({
      tenderId: c.tender.id,
      title: c.tender.title,
      score: c.score,
      reason: 'Seleccionada por relevancia vectorial (sin análisis LLM)',
      budgetAmount: c.tender.budgetAmount,
      submissionDeadline: c.tender.submissionDeadline?.toISOString(),
    }));
  }

  /**
   * Step 5: Generate a natural language daily summary using LLM.
   */
  private async generateSummary(
    totalDetected: number,
    afterFilter: number,
    topOpportunities: DailyReport['topOpportunities'],
  ): Promise<string> {
    const topList = topOpportunities
      .map(
        (o, i) =>
          `${i + 1}. **${o.title}** — ${o.budgetAmount || 'N/A'}€ — Score: ${(o.score * 100).toFixed(0)}%\n   → ${o.reason}`,
      )
      .join('\n');

    const prompt = `Genera un informe diario de licitaciones para LYN Soluciones Tecnológicas.

Datos del día:
- Total licitaciones detectadas: ${totalDetected}
- Tras filtrado estratégico: ${afterFilter}
- Top oportunidades seleccionadas: ${topOpportunities.length}

Oportunidades top:
${topList}

Genera un informe breve en markdown con:
1. Resumen ejecutivo (2-3 frases)
2. Lista de las oportunidades top con explicación breve
3. Recomendación de acción prioritaria

Tono profesional y conciso.`;

    const response = await this.llmService.complete({
      systemPrompt:
        'Eres el asistente de análisis de licitaciones de LYN Soluciones Tecnológicas. Genera informes claros y accionables.',
      prompt,
      temperature: 0.4,
      maxTokens: 2000,
    });

    return response.text;
  }

  private generateFallbackSummary(
    totalDetected: number,
    afterFilter: number,
    topOpportunities: DailyReport['topOpportunities'],
  ): string {
    const today = new Date().toISOString().split('T')[0];
    const topList = topOpportunities
      .map(
        (o, i) =>
          `${i + 1}. **${o.title}** — ${o.budgetAmount || 'N/A'}€ — Score: ${(o.score * 100).toFixed(0)}%`,
      )
      .join('\n');

    return `# Informe diario de licitaciones — ${today}

## Resumen
- Detectadas: **${totalDetected}** licitaciones
- Tras filtrado: **${afterFilter}**
- Top oportunidades: **${topOpportunities.length}**

## Oportunidades destacadas
${topList || 'No se identificaron oportunidades viables hoy.'}

*Informe generado automáticamente (sin LLM)*`;
  }
}
