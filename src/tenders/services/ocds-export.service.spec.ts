import { OcdsExportService } from './ocds-export.service';
import { Tender, TenderStatus, ContractType } from '../entities/tender.entity';
import {
  OcdsTenderStatus,
  OcdsProcurementMethod,
  OcdsProcurementCategory,
} from '../../common/ocds';

/**
 * Tests for the OCDS export service.
 * Validates that tender data is correctly transformed into valid OCDS releases.
 */
describe('OcdsExportService', () => {
  let service: OcdsExportService;

  const sampleTender: Partial<Tender> = {
    id: 'uuid-123',
    ocid: 'ocds-placspnacional-EXP-001',
    externalId: 'EXP-001',
    sourceId: 'placsp-nacional',
    title: 'Desarrollo de plataforma web',
    description: 'Servicio de desarrollo de software a medida',
    contractingAuthority: 'Ayuntamiento de Madrid',
    cpvCodes: ['72200000'],
    budgetAmount: 120000,
    currency: 'EUR',
    status: TenderStatus.OPEN,
    contractType: ContractType.SERVICES,
    ocdsStatus: OcdsTenderStatus.ACTIVE,
    procurementMethod: OcdsProcurementMethod.OPEN,
    procurementMethodDetails: 'Abierto',
    mainProcurementCategory: OcdsProcurementCategory.SERVICES,
    value: { amount: 120000, currency: 'EUR' },
    tenderPeriod: {
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-03-15T12:00:00.000Z',
    },
    items: [
      {
        id: '1',
        classification: { scheme: 'CPV', id: '72200000', description: null },
      },
    ],
    procuringEntity: { id: 'ayuntamiento-de-madrid', name: 'Ayuntamiento de Madrid' },
    parties: [
      {
        id: 'ayuntamiento-de-madrid',
        name: 'Ayuntamiento de Madrid',
        roles: ['procuringEntity'],
      },
    ],
    documents: [
      { id: '1', url: 'https://example.com/pliego.pdf' },
    ],
    milestones: [],
    amendments: [],
    awardCriteria: 'ratedCriteria',
    awardCriteriaDetails: 'Criterios múltiples',
    eligibilityCriteria: 'Solvencia técnica y económica',
    submissionMethod: ['electronicSubmission'],
    numberOfTenderers: null,
    releaseTag: ['tender'],
    language: 'es',
    publicationDate: new Date('2026-01-01T00:00:00.000Z'),
    submissionDeadline: new Date('2026-03-15T12:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-15T00:00:00.000Z'),
  };

  beforeEach(() => {
    service = new OcdsExportService();
  });

  describe('buildRelease', () => {
    it('should build a valid OCDS release with all required fields', () => {
      const release = service.buildRelease(sampleTender as Tender);

      expect(release.ocid).toBe('ocds-placspnacional-EXP-001');
      expect(release.id).toContain('ocds-placspnacional-EXP-001');
      expect(release.date).toBe('2026-01-01T00:00:00.000Z');
      expect(release.tag).toEqual(['tender']);
      expect(release.initiationType).toBe('tender');
      expect(release.language).toBe('es');
    });

    it('should include tender object with OCDS fields', () => {
      const release = service.buildRelease(sampleTender as Tender);

      expect(release.tender).toBeDefined();
      expect(release.tender.id).toBe('EXP-001');
      expect(release.tender.title).toBe('Desarrollo de plataforma web');
      expect(release.tender.status).toBe(OcdsTenderStatus.ACTIVE);
      expect(release.tender.procurementMethod).toBe(OcdsProcurementMethod.OPEN);
      expect(release.tender.mainProcurementCategory).toBe(OcdsProcurementCategory.SERVICES);
    });

    it('should include value in tender and planning.budget', () => {
      const release = service.buildRelease(sampleTender as Tender);

      expect(release.tender.value).toEqual({ amount: 120000, currency: 'EUR' });
      expect(release.planning).toBeDefined();
      expect(release.planning.budget.amount).toEqual({ amount: 120000, currency: 'EUR' });
    });

    it('should include items with CPV classification', () => {
      const release = service.buildRelease(sampleTender as Tender);

      expect(release.tender.items).toHaveLength(1);
      expect(release.tender.items[0].classification.scheme).toBe('CPV');
      expect(release.tender.items[0].classification.id).toBe('72200000');
    });

    it('should include parties with roles', () => {
      const release = service.buildRelease(sampleTender as Tender);

      expect(release.parties).toHaveLength(1);
      expect(release.parties[0].name).toBe('Ayuntamiento de Madrid');
      expect(release.parties[0].roles).toContain('procuringEntity');
    });

    it('should include procuring entity as buyer', () => {
      const release = service.buildRelease(sampleTender as Tender);

      expect(release.buyer).toEqual({
        id: 'ayuntamiento-de-madrid',
        name: 'Ayuntamiento de Madrid',
      });
    });

    it('should include documents', () => {
      const release = service.buildRelease(sampleTender as Tender);

      expect(release.tender.documents).toHaveLength(1);
      expect(release.tender.documents[0].url).toBe('https://example.com/pliego.pdf');
    });

    it('should include tender period', () => {
      const release = service.buildRelease(sampleTender as Tender);

      expect(release.tender.tenderPeriod).toEqual({
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-03-15T12:00:00.000Z',
      });
    });

    it('should include award criteria and eligibility', () => {
      const release = service.buildRelease(sampleTender as Tender);

      expect(release.tender.awardCriteria).toBe('ratedCriteria');
      expect(release.tender.eligibilityCriteria).toBe('Solvencia técnica y económica');
    });

    it('should handle minimal tender with no OCDS fields', () => {
      const minimal: Partial<Tender> = {
        id: 'uuid-min',
        externalId: 'MIN-001',
        title: 'Minimal',
        createdAt: new Date('2026-01-01'),
      };

      const release = service.buildRelease(minimal as Tender);

      expect(release.ocid).toContain('uuid-min');
      expect(release.tag).toEqual(['tender']);
      expect(release.initiationType).toBe('tender');
      expect(release.tender.id).toBe('MIN-001');
    });
  });

  describe('buildReleasePackage', () => {
    it('should build a valid OCDS release package', () => {
      const pkg = service.buildReleasePackage(
        [sampleTender as Tender],
        '/api/tenders/ocds/releases',
      );

      expect(pkg.version).toBe('1.1');
      expect(pkg.uri).toBe('/api/tenders/ocds/releases');
      expect(pkg.releases).toHaveLength(1);
      expect(pkg.publisher.name).toBe('LYN Soluciones Tecnológicas');
      expect(pkg.publishedDate).toBeDefined();
      expect(pkg.license).toBe('https://opendatacommons.org/licenses/pddl/1.0/');
    });

    it('should include multiple releases for multiple tenders', () => {
      const tender2: Partial<Tender> = {
        ...sampleTender,
        id: 'uuid-456',
        ocid: 'ocds-placspnacional-EXP-002',
        externalId: 'EXP-002',
        title: 'Otro proyecto',
      };

      const pkg = service.buildReleasePackage(
        [sampleTender as Tender, tender2 as Tender],
        '/api/tenders/ocds/releases',
      );

      expect(pkg.releases).toHaveLength(2);
      expect(pkg.releases[0].ocid).toBe('ocds-placspnacional-EXP-001');
      expect(pkg.releases[1].ocid).toBe('ocds-placspnacional-EXP-002');
    });
  });
});
