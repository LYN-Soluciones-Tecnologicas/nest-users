import { Injectable } from '@nestjs/common';
import { Tender } from '../entities/tender.entity';
import {
  OcdsRelease,
  OcdsReleasePackage,
  OcdsPublisher,
  OcdsTender,
  OcdsPlanning,
} from '../../common/ocds';

/**
 * Builds valid OCDS release and release package JSON from Tender entities.
 *
 * Follows the OCDS 1.1 schema:
 * https://standard.open-contracting.org/latest/en/schema/
 */
@Injectable()
export class OcdsExportService {
  private readonly publisher: OcdsPublisher = {
    name: 'LYN Soluciones Tecnológicas',
    scheme: 'ES-DIR3',
    uid: 'LYN-ST',
  };

  /**
   * Build a single OCDS release from a Tender entity.
   */
  buildRelease(tender: Tender): OcdsRelease {
    const tenderObj: OcdsTender = {
      id: tender.externalId,
      title: tender.title || null,
      description: tender.description || null,
      status: tender.ocdsStatus || null,
      procuringEntity: tender.procuringEntity || undefined,
      items: tender.items?.length ? tender.items : undefined,
      value: tender.value || undefined,
      procurementMethod: tender.procurementMethod || null,
      procurementMethodDetails: tender.procurementMethodDetails || null,
      mainProcurementCategory: tender.mainProcurementCategory || null,
      awardCriteria: tender.awardCriteria || null,
      awardCriteriaDetails: tender.awardCriteriaDetails || null,
      eligibilityCriteria: tender.eligibilityCriteria || null,
      submissionMethod: tender.submissionMethod || undefined,
      tenderPeriod: tender.tenderPeriod || undefined,
      numberOfTenderers: tender.numberOfTenderers || null,
      documents: tender.documents?.length ? tender.documents : undefined,
      milestones: tender.milestones?.length ? tender.milestones : undefined,
      amendments: tender.amendments?.length ? tender.amendments : undefined,
    };

    // Build planning if we have budget info
    let planning: OcdsPlanning | undefined;
    if (tender.value) {
      planning = {
        budget: {
          amount: tender.value,
        },
      };
    }

    const release: OcdsRelease = {
      ocid: tender.ocid || `ocds-lyn-${tender.id}`,
      id: `${tender.ocid || tender.id}-${tender.updatedAt?.toISOString() || new Date().toISOString()}`,
      date: tender.publicationDate?.toISOString() || tender.createdAt?.toISOString() || new Date().toISOString(),
      tag: tender.releaseTag || ['tender'],
      initiationType: 'tender',
      language: tender.language || 'es',
      parties: tender.parties?.length ? tender.parties : undefined,
      buyer: tender.procuringEntity || undefined,
      planning,
      tender: tenderObj,
    };

    return release;
  }

  /**
   * Build an OCDS release package from multiple tenders.
   */
  buildReleasePackage(
    tenders: Tender[],
    baseUri: string,
  ): OcdsReleasePackage {
    const releases = tenders.map((t) => this.buildRelease(t));

    return {
      uri: baseUri,
      version: '1.1',
      publishedDate: new Date().toISOString(),
      releases,
      publisher: this.publisher,
      license: 'https://opendatacommons.org/licenses/pddl/1.0/',
    };
  }
}
