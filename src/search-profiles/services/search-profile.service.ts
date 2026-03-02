import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchProfile } from '../entities/search-profile.entity';
import {
  CreateSearchProfileDto,
  UpdateSearchProfileDto,
} from '../dto/search-profile.dto';
import { EmbeddingService } from '../../vectorization/services/embedding.service';

@Injectable()
export class SearchProfileService {
  constructor(
    @InjectRepository(SearchProfile)
    private readonly profileRepo: Repository<SearchProfile>,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async create(dto: CreateSearchProfileDto): Promise<SearchProfile> {
    // Deactivate other profiles
    await this.profileRepo.update({}, { isActive: false });

    const profile = this.profileRepo.create(dto);
    profile.isActive = true;

    // Generate embeddings immediately
    if (dto.inclusionPrompt) {
      profile.inclusionEmbedding =
        await this.embeddingService.generateEmbedding(dto.inclusionPrompt);
    }
    if (dto.exclusionPrompt) {
      profile.exclusionEmbedding =
        await this.embeddingService.generateEmbedding(dto.exclusionPrompt);
    }

    return this.profileRepo.save(profile);
  }

  async update(
    id: string,
    dto: UpdateSearchProfileDto,
  ): Promise<SearchProfile> {
    const profile = await this.findById(id);

    // Regenerate embeddings if prompts changed
    if (dto.inclusionPrompt && dto.inclusionPrompt !== profile.inclusionPrompt) {
      profile.inclusionEmbedding =
        await this.embeddingService.generateEmbedding(dto.inclusionPrompt);
    }
    if (dto.exclusionPrompt && dto.exclusionPrompt !== profile.exclusionPrompt) {
      profile.exclusionEmbedding =
        await this.embeddingService.generateEmbedding(dto.exclusionPrompt);
    }

    Object.assign(profile, dto);
    return this.profileRepo.save(profile);
  }

  async findById(id: string): Promise<SearchProfile> {
    const profile = await this.profileRepo.findOne({ where: { id } });
    if (!profile) throw new NotFoundException(`Profile ${id} not found`);
    return profile;
  }

  async getActive(): Promise<SearchProfile> {
    const profile = await this.profileRepo.findOne({
      where: { isActive: true },
    });
    if (!profile) throw new NotFoundException('No active search profile');
    return profile;
  }

  async list(): Promise<SearchProfile[]> {
    return this.profileRepo.find({ order: { createdAt: 'DESC' } });
  }

  async activate(id: string): Promise<SearchProfile> {
    await this.profileRepo.update({}, { isActive: false });
    const profile = await this.findById(id);
    profile.isActive = true;
    return this.profileRepo.save(profile);
  }

  async delete(id: string): Promise<void> {
    const profile = await this.findById(id);
    await this.profileRepo.remove(profile);
  }
}
