import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Tender } from '../entities/tender.entity';
import { SearchTendersDto } from '../dto/search-tenders.dto';

@Injectable()
export class TendersService {
  private readonly logger = new Logger(TendersService.name);

  constructor(
    @InjectRepository(Tender)
    private readonly tenderRepo: Repository<Tender>,
  ) {}

  async search(dto: SearchTendersDto) {
    const qb = this.tenderRepo.createQueryBuilder('t');

    if (dto.q) {
      qb.andWhere(
        '(t.title ILIKE :q OR t.description ILIKE :q OR t.contractingAuthority ILIKE :q)',
        { q: `%${dto.q}%` },
      );
    }

    if (dto.status) {
      qb.andWhere('t.status = :status', { status: dto.status });
    }

    if (dto.contractType) {
      qb.andWhere('t.contractType = :contractType', {
        contractType: dto.contractType,
      });
    }

    if (dto.sourceId) {
      qb.andWhere('t.sourceId = :sourceId', { sourceId: dto.sourceId });
    }

    if (dto.cpvCodes?.length) {
      qb.andWhere('t.cpvCodes && :cpvCodes', { cpvCodes: dto.cpvCodes });
    }

    if (dto.minBudget !== undefined) {
      qb.andWhere('t.budgetAmount >= :minBudget', {
        minBudget: dto.minBudget,
      });
    }

    if (dto.maxBudget !== undefined) {
      qb.andWhere('t.budgetAmount <= :maxBudget', {
        maxBudget: dto.maxBudget,
      });
    }

    if (dto.includeMinorContracts === false) {
      qb.andWhere('t.isMinorContract = false');
    }

    if (dto.savedOnly) {
      qb.andWhere('t.isSaved = true');
    }

    if (dto.hideDismissed !== false) {
      qb.andWhere('t.isDismissed = false');
    }

    const allowedSortFields = [
      'publicationDate',
      'submissionDeadline',
      'budgetAmount',
      'relevanceScore',
      'title',
      'createdAt',
    ];
    const sortField = allowedSortFields.includes(dto.sortBy)
      ? dto.sortBy
      : 'publicationDate';

    qb.orderBy(`t.${sortField}`, dto.sortDir || 'DESC');

    const page = dto.page || 1;
    const limit = dto.limit || 20;
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<Tender> {
    const tender = await this.tenderRepo.findOne({ where: { id } });
    if (!tender) throw new NotFoundException(`Tender ${id} not found`);
    return tender;
  }

  async saveTender(id: string): Promise<Tender> {
    const tender = await this.findById(id);
    tender.isSaved = true;
    tender.isDismissed = false;
    return this.tenderRepo.save(tender);
  }

  async dismissTender(id: string): Promise<Tender> {
    const tender = await this.findById(id);
    tender.isDismissed = true;
    return this.tenderRepo.save(tender);
  }

  async getStats() {
    const total = await this.tenderRepo.count();
    const saved = await this.tenderRepo.count({ where: { isSaved: true } });
    const dismissed = await this.tenderRepo.count({
      where: { isDismissed: true },
    });

    const bySource = await this.tenderRepo
      .createQueryBuilder('t')
      .select('t.sourceId', 'sourceId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.sourceId')
      .getRawMany();

    const byStatus = await this.tenderRepo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.status')
      .getRawMany();

    return { total, saved, dismissed, bySource, byStatus };
  }
}
