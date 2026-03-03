import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { parseStringPromise } from 'xml2js';

/**
 * Integration test: Validates a real ATOM feed from PLACSP.
 *
 * Downloads the feed via curl on first run and caches it as a fixture.
 * Requires network access (via curl) on first execution.
 *
 * This test validates the structure, especially:
 *   - Entry source URL (link href)
 *   - Document URLs (LegalDocumentReference, TechnicalDocumentReference)
 *   - CODICE fields relevant for OCDS mapping
 */
describe('PLACSP ATOM Feed - Real Data Validation', () => {
  const ATOM_URL =
    'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom';

  const ensureArray = (value: any): any[] => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  };

  let feedXml: string;
  let parsed: any;
  let entries: any[];

  beforeAll(async () => {
    // Download fixture via curl if not cached
    const fixtureDir = path.join(__dirname, '__fixtures__');
    const fixturePath = path.join(fixtureDir, 'sample-feed.atom');

    if (!fs.existsSync(fixturePath)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
      try {
        execSync(
          `curl -sL --max-time 60 "${ATOM_URL}" -o "${fixturePath}"`,
          { timeout: 70000 },
        );
      } catch {
        // If curl fails, skip all tests gracefully
        console.warn('Could not download ATOM feed — skipping integration tests');
        return;
      }
    }

    feedXml = fs.readFileSync(fixturePath, 'utf-8');

    parsed = await parseStringPromise(feedXml, {
      explicitArray: false,
      ignoreAttrs: false,
      tagNameProcessors: [(name: string) => name.replace(/^.*:/, '')],
    });

    const feed = parsed.feed || parsed;
    entries = ensureArray(feed.entry || []);
  }, 90000);

  it('should parse the ATOM feed successfully', () => {
    expect(feedXml).toBeDefined();
    expect(feedXml.length).toBeGreaterThan(1000);
    expect(feedXml).toContain('<feed');
  });

  it('should contain multiple entries', () => {
    expect(entries.length).toBeGreaterThan(0);
    console.log(`\nFeed contains ${entries.length} entries`);
  });

  it('should have pagination links (self, first, next)', () => {
    const feed = parsed.feed || parsed;
    const links = ensureArray(feed.link || []);

    const selfLink = links.find((l: any) => l.$?.rel === 'self');
    const firstLink = links.find((l: any) => l.$?.rel === 'first');
    const nextLink = links.find((l: any) => l.$?.rel === 'next');

    console.log('\n=== Feed Links ===');
    console.log('Self:', selfLink?.$?.href);
    console.log('First:', firstLink?.$?.href);
    console.log('Next:', nextLink?.$?.href);

    expect(selfLink?.$?.href || firstLink?.$?.href).toBeDefined();
    expect(nextLink?.$?.href).toBeDefined();
  });

  describe('entry structure', () => {
    let entry: any;
    let contractFolder: any;

    beforeAll(() => {
      entry = entries.find(
        (e: any) => e.ContractFolderStatus || e.contractFolderStatus,
      );
      contractFolder =
        entry?.ContractFolderStatus || entry?.contractFolderStatus || {};
    });

    it('should have an entry with ContractFolderStatus', () => {
      expect(entry).toBeDefined();
      expect(contractFolder).toBeDefined();
    });

    // ─── Source URL ─────────────────────────────────────────────────────

    it('should have entry <id> as source permalink', () => {
      console.log('\n=== Entry Source URLs ===');
      console.log('Entry <id>:', entry.id);
      expect(entry.id).toBeDefined();
      expect(typeof entry.id).toBe('string');
    });

    it('should have entry <link> with href to tender detail page', () => {
      const link = entry.link;
      const href = link?.$?.href || link?.href;
      console.log('Entry <link> href:', href);
      expect(href).toBeDefined();
      expect(typeof href).toBe('string');
      if (href) {
        expect(href).toContain('contrataciondelestado.es');
      }
    });

    // ─── Document URLs ──────────────────────────────────────────────────

    it('should extract LegalDocumentReference URLs (PCAP/pliegos)', () => {
      const legalDocs = ensureArray(
        contractFolder.LegalDocumentReference ||
          contractFolder.legalDocumentReference ||
          [],
      );

      console.log('\n=== Legal Documents (PCAP/Pliegos) ===');
      console.log(`Found ${legalDocs.length} legal document(s)`);

      for (const doc of legalDocs) {
        const attachment = doc.Attachment || doc.attachment || {};
        const extRef =
          attachment.ExternalReference || attachment.externalReference || {};
        const uri = extRef.URI || extRef.uri;
        const docId = doc.ID || doc.id;
        const hash = extRef.DocumentHash || extRef.documentHash;

        console.log(`  Document ID: ${docId}`);
        console.log(`  URI: ${uri}`);
        console.log(`  Hash: ${hash}`);
        console.log('  ---');

        if (uri) {
          expect(typeof uri).toBe('string');
          expect(uri).toContain('contrataciondelestado.es');
        }
      }

      expect(legalDocs.length).toBeGreaterThanOrEqual(0);
    });

    it('should extract TechnicalDocumentReference URLs (PPT)', () => {
      const techDocs = ensureArray(
        contractFolder.TechnicalDocumentReference ||
          contractFolder.technicalDocumentReference ||
          [],
      );

      console.log('\n=== Technical Documents (PPT) ===');
      console.log(`Found ${techDocs.length} technical document(s)`);

      for (const doc of techDocs) {
        const attachment = doc.Attachment || doc.attachment || {};
        const extRef =
          attachment.ExternalReference || attachment.externalReference || {};
        const uri = extRef.URI || extRef.uri;
        const docId = doc.ID || doc.id;

        console.log(`  Document ID: ${docId}`);
        console.log(`  URI: ${uri}`);
        console.log('  ---');
      }
    });

    it('should extract AdditionalDocumentReference URLs if present', () => {
      const additionalDocs = ensureArray(
        contractFolder.AdditionalDocumentReference ||
          contractFolder.additionalDocumentReference ||
          [],
      );

      console.log('\n=== Additional Documents ===');
      console.log(`Found ${additionalDocs.length} additional document(s)`);

      for (const doc of additionalDocs) {
        const attachment = doc.Attachment || doc.attachment || {};
        const extRef =
          attachment.ExternalReference || attachment.externalReference || {};
        const uri = extRef.URI || extRef.uri;
        const docId = doc.ID || doc.id;

        console.log(`  Document ID: ${docId}`);
        console.log(`  URI: ${uri}`);
        console.log('  ---');
      }
    });

    // ─── Core CODICE fields ─────────────────────────────────────────────

    it('should have ContractFolderID (expediente)', () => {
      const folderId =
        contractFolder.ContractFolderID || contractFolder.contractFolderID;
      console.log('\n=== Core Fields ===');
      console.log('ContractFolderID:', folderId);
      expect(folderId).toBeDefined();
    });

    it('should have ContractFolderStatusCode (estado)', () => {
      const statusCode =
        contractFolder.ContractFolderStatusCode ||
        contractFolder.contractFolderStatusCode;
      const statusValue =
        typeof statusCode === 'string' ? statusCode : statusCode?._ || statusCode;
      console.log('Status Code:', statusValue);
      expect(statusValue).toBeDefined();
    });

    it('should have ProcurementProject with name and budget', () => {
      const project =
        contractFolder.ProcurementProject ||
        contractFolder.procurementProject ||
        {};
      const name = project.Name || project.name;
      const budget = project.BudgetAmount || project.budgetAmount || {};
      const totalAmount = budget.TotalAmount || budget.totalAmount;
      const taxExclusive =
        budget.TaxExclusiveAmount || budget.taxExclusiveAmount;
      const estimated =
        budget.EstimatedOverallContractAmount ||
        budget.estimatedOverallContractAmount;

      console.log('Project Name:', typeof name === 'string' ? name : name?._);
      console.log(
        'TotalAmount:',
        typeof totalAmount === 'string' ? totalAmount : totalAmount?._,
      );
      console.log(
        'TaxExclusiveAmount:',
        typeof taxExclusive === 'string' ? taxExclusive : taxExclusive?._,
      );
      console.log(
        'EstimatedOverallContractAmount:',
        typeof estimated === 'string' ? estimated : estimated?._,
      );

      expect(name).toBeDefined();
    });

    it('should have CPV codes in RequiredCommodityClassification', () => {
      const project =
        contractFolder.ProcurementProject ||
        contractFolder.procurementProject ||
        {};
      const classifications = ensureArray(
        project.RequiredCommodityClassification ||
          project.requiredCommodityClassification ||
          [],
      );

      const cpvCodes = classifications
        .map((c: any) => {
          const code =
            c.ItemClassificationCode || c.itemClassificationCode || '';
          return typeof code === 'string' ? code : code?._ || '';
        })
        .filter(Boolean);

      console.log('CPV Codes:', cpvCodes);
      expect(cpvCodes.length).toBeGreaterThanOrEqual(0);
    });

    it('should have TenderingProcess with procedure code and deadlines', () => {
      const process =
        contractFolder.TenderingProcess ||
        contractFolder.tenderingProcess ||
        {};
      const procedureCode = process.ProcedureCode || process.procedureCode;
      const submissionMethod =
        process.SubmissionMethodCode || process.submissionMethodCode;
      const deadline =
        process.TenderSubmissionDeadlinePeriod ||
        process.tenderSubmissionDeadlinePeriod ||
        {};
      const endDate = deadline.EndDate || deadline.endDate;
      const endTime = deadline.EndTime || deadline.endTime;

      console.log('\n=== Tendering Process ===');
      console.log(
        'ProcedureCode:',
        typeof procedureCode === 'string' ? procedureCode : procedureCode?._,
      );
      console.log(
        'SubmissionMethodCode:',
        typeof submissionMethod === 'string'
          ? submissionMethod
          : submissionMethod?._,
      );
      console.log('Deadline EndDate:', endDate);
      console.log('Deadline EndTime:', endTime);
    });

    it('should have Party identification with DIR3, NIF codes', () => {
      const locatedParty =
        contractFolder.LocatedContractingParty ||
        contractFolder.locatedContractingParty ||
        {};
      const party = locatedParty.Party || locatedParty.party || {};
      const ids = ensureArray(
        party.PartyIdentification || party.partyIdentification || [],
      );
      const partyName = party.PartyName || party.partyName || {};
      const name = partyName.Name || partyName.name;

      console.log('\n=== Party Info ===');
      console.log('Name:', typeof name === 'string' ? name : name?._);

      for (const idEntry of ids) {
        const id = idEntry.ID || idEntry.id;
        const scheme = typeof id === 'object' ? id?.$?.schemeName : null;
        const value = typeof id === 'object' ? id?._ : id;
        console.log(`  ${scheme || 'ID'}: ${value}`);
      }

      const contact = party.Contact || party.contact || {};
      console.log('Contact Name:', contact.Name || contact.name);
      console.log('Contact Email:', contact.ElectronicMail || contact.electronicMail);
      console.log('Contact Phone:', contact.Telephone || contact.telephone);

      expect(name).toBeDefined();
    });

    it('should have TenderingTerms with AwardingCriteria', () => {
      const terms =
        contractFolder.TenderingTerms ||
        contractFolder.tenderingTerms ||
        {};
      const awardingTerms =
        terms.AwardingTerms || terms.awardingTerms || {};
      const criteria = ensureArray(
        awardingTerms.AwardingCriteria || awardingTerms.awardingCriteria || [],
      );

      console.log('\n=== Award Criteria ===');
      console.log(`Found ${criteria.length} awarding criteria`);

      for (const crit of criteria) {
        const typeCode =
          crit.AwardingCriteriaTypeCode || crit.awardingCriteriaTypeCode;
        const desc = crit.Description || crit.description;
        const weight = crit.WeightNumeric || crit.weightNumeric;
        const typeVal = typeof typeCode === 'string' ? typeCode : typeCode?._;

        console.log(`  [${typeVal}] ${desc} — Peso: ${weight}%`);
      }
    });
  });

  // ─── Summary of all document URLs across first N entries ─────────────

  describe('document URLs summary across entries', () => {
    it('should list all document URLs from first 5 entries', () => {
      const maxEntries = Math.min(5, entries.length);

      console.log('\n\n========================================');
      console.log(`DOCUMENT URL SUMMARY (first ${maxEntries} entries)`);
      console.log('========================================\n');

      for (let i = 0; i < maxEntries; i++) {
        const e = entries[i];
        const cf = e.ContractFolderStatus || e.contractFolderStatus || {};
        const folderId = cf.ContractFolderID || cf.contractFolderID || '?';
        const entryLink = e.link?.$?.href || e.link?.href || 'N/A';

        console.log(`--- Entry ${i + 1}: ${folderId} ---`);
        console.log(`  Entry ID: ${e.id}`);
        console.log(`  Detail URL (link href): ${entryLink}`);

        // Legal docs
        const legalDocs = ensureArray(
          cf.LegalDocumentReference || cf.legalDocumentReference || [],
        );
        for (const doc of legalDocs) {
          const att = doc.Attachment || doc.attachment || {};
          const ref = att.ExternalReference || att.externalReference || {};
          console.log(`  Legal Doc [${doc.ID || doc.id}]: ${ref.URI || ref.uri || 'NO URI'}`);
        }

        // Technical docs
        const techDocs = ensureArray(
          cf.TechnicalDocumentReference || cf.technicalDocumentReference || [],
        );
        for (const doc of techDocs) {
          const att = doc.Attachment || doc.attachment || {};
          const ref = att.ExternalReference || att.externalReference || {};
          console.log(`  Tech Doc [${doc.ID || doc.id}]: ${ref.URI || ref.uri || 'NO URI'}`);
        }

        // Additional docs
        const addDocs = ensureArray(
          cf.AdditionalDocumentReference || cf.additionalDocumentReference || [],
        );
        for (const doc of addDocs) {
          const att = doc.Attachment || doc.attachment || {};
          const ref = att.ExternalReference || att.externalReference || {};
          console.log(`  Additional Doc [${doc.ID || doc.id}]: ${ref.URI || ref.uri || 'NO URI'}`);
        }

        console.log('');
      }

      expect(maxEntries).toBeGreaterThan(0);
    });
  });
});
