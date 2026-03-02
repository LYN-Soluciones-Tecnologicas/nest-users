import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyProfile } from '../entities/company-profile.entity';
import { Tender } from '../../tenders/entities/tender.entity';
import { CreateCompanyProfileDto } from '../dto/company-profile.dto';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(CompanyProfile)
    private readonly profileRepo: Repository<CompanyProfile>,
    @InjectRepository(Tender)
    private readonly tenderRepo: Repository<Tender>,
  ) {}

  async createProfile(dto: CreateCompanyProfileDto): Promise<CompanyProfile> {
    // Deactivate other profiles
    await this.profileRepo.update({}, { isActive: false });
    const profile = this.profileRepo.create({ ...dto, isActive: true });
    return this.profileRepo.save(profile);
  }

  async getActiveProfile(): Promise<CompanyProfile> {
    const profile = await this.profileRepo.findOne({
      where: { isActive: true },
    });
    if (!profile) throw new NotFoundException('No active company profile');
    return profile;
  }

  async updateProfile(
    id: string,
    dto: Partial<CreateCompanyProfileDto>,
  ): Promise<CompanyProfile> {
    const profile = await this.profileRepo.findOne({ where: { id } });
    if (!profile) throw new NotFoundException(`Profile ${id} not found`);
    Object.assign(profile, dto);
    return this.profileRepo.save(profile);
  }

  async listProfiles(): Promise<CompanyProfile[]> {
    return this.profileRepo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Score all tenders against the active company profile.
   * Uses CPV code matching, keyword matching, budget range, and exclusion filters.
   */
  async scoreTenders(): Promise<{ scored: number; candidates: number }> {
    const profile = await this.getActiveProfile();

    const tenders = await this.tenderRepo.find({
      where: { isDismissed: false },
    });

    let candidates = 0;

    for (const tender of tenders) {
      const score = this.calculateScore(tender, profile);
      tender.relevanceScore = score;

      if (score > 0.3) {
        candidates++;
      }

      await this.tenderRepo.save(tender);
    }

    this.logger.log(
      `Scored ${tenders.length} tenders, ${candidates} candidates found`,
    );

    return { scored: tenders.length, candidates };
  }

  /**
   * Get top candidate tenders for the active company profile.
   */
  async getCandidates(limit = 50) {
    return this.tenderRepo
      .createQueryBuilder('t')
      .where('t.relevanceScore > :minScore', { minScore: 0.3 })
      .andWhere('t.isDismissed = false')
      .orderBy('t.relevanceScore', 'DESC')
      .take(limit)
      .getMany();
  }

  private calculateScore(tender: Tender, profile: CompanyProfile): number {
    let score = 0;
    let factors = 0;

    // 1. CPV code matching (high weight)
    if (tender.cpvCodes?.length && profile.cpvCodes?.length) {
      const tenderCpvPrefixes = tender.cpvCodes.map((c) =>
        c.substring(0, 2),
      );
      const profileCpvPrefixes = profile.cpvCodes.map((c) =>
        c.substring(0, 2),
      );
      const cpvMatch = tenderCpvPrefixes.some((tc) =>
        profileCpvPrefixes.includes(tc),
      );

      // Check exact match too
      const exactMatch = tender.cpvCodes.some((tc) =>
        profile.cpvCodes.some(
          (pc) => tc.startsWith(pc.substring(0, 5)) || pc.startsWith(tc.substring(0, 5)),
        ),
      );

      if (exactMatch) {
        score += 0.4;
      } else if (cpvMatch) {
        score += 0.2;
      }
      factors++;
    }

    // 2. Keyword matching in title/description
    if (profile.keywords?.length) {
      const text =
        `${tender.title} ${tender.description || ''}`.toLowerCase();
      const matchedKeywords = profile.keywords.filter((kw) =>
        text.includes(kw.toLowerCase()),
      );
      const keywordScore = matchedKeywords.length / profile.keywords.length;
      score += keywordScore * 0.3;
      factors++;
    }

    // 3. Budget range
    if (tender.budgetAmount) {
      let budgetScore = 0;
      if (
        (!profile.minBudget || tender.budgetAmount >= profile.minBudget) &&
        (!profile.maxBudget || tender.budgetAmount <= profile.maxBudget)
      ) {
        budgetScore = 0.2;
      }
      score += budgetScore;
      factors++;
    }

    // 4. Contract type preference
    if (
      profile.preferredContractTypes?.length &&
      tender.contractType
    ) {
      const typeMatch = profile.preferredContractTypes.some(
        (pt) => tender.contractType.toLowerCase().includes(pt.toLowerCase()),
      );
      if (typeMatch) score += 0.1;
      factors++;
    }

    // 5. Exclusion filter (negative)
    if (profile.excludeKeywords?.length) {
      const text =
        `${tender.title} ${tender.description || ''}`.toLowerCase();
      const hasExcluded = profile.excludeKeywords.some((ek) =>
        text.includes(ek.toLowerCase()),
      );
      if (hasExcluded) {
        score = Math.max(0, score - 0.5);
      }
    }

    return Math.min(1, Math.max(0, score));
  }
}
