import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Tender } from '../../tenders/entities/tender.entity';
import { EmbeddingService } from '../../vectorization/services/embedding.service';

export interface EmbeddingJobData {
  tenderId?: string;
  batchSize?: number;
}

@Processor('embedding')
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(
    private readonly embeddingService: EmbeddingService,
    @InjectRepository(Tender)
    private readonly tenderRepo: Repository<Tender>,
  ) {
    super();
  }

  async process(job: Job<EmbeddingJobData>): Promise<any> {
    this.logger.log(`Processing embedding job: ${job.name} (${job.id})`);

    switch (job.name) {
      case 'embed-tender':
        return this.embedSingle(job.data);
      case 'embed-batch':
        return this.embedBatch(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async embedSingle(data: EmbeddingJobData) {
    if (!data.tenderId) throw new Error('tenderId required');

    const tender = await this.tenderRepo.findOne({
      where: { id: data.tenderId },
    });
    if (!tender) throw new Error(`Tender ${data.tenderId} not found`);

    const text = tender.embeddingText || tender.title;
    await this.embeddingService.embedTender(tender.id, text);

    return { tenderId: tender.id, embedded: true };
  }

  private async embedBatch(data: EmbeddingJobData) {
    const batchSize = data.batchSize || 100;

    // Find tenders with embeddingText but no embedding yet
    const tenders = await this.tenderRepo
      .createQueryBuilder('t')
      .where('t.embeddingText IS NOT NULL')
      .andWhere(
        `t.id NOT IN (SELECT "tenderId" FROM tender_embeddings)`,
      )
      .take(batchSize)
      .getMany();

    const items = tenders.map((t) => ({
      tenderId: t.id,
      text: t.embeddingText || t.title,
    }));

    const count = await this.embeddingService.embedBatch(items);
    this.logger.log(`Embedded ${count}/${tenders.length} tenders`);

    return { embedded: count, total: tenders.length };
  }
}
