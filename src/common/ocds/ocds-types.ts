/**
 * Open Contracting Data Standard (OCDS) type definitions.
 * Based on OCDS 1.1 schema: https://standard.open-contracting.org/latest/en/schema/
 *
 * These types are used for:
 * - Typing JSONB columns in the Tender entity
 * - Building valid OCDS release exports
 * - Ensuring compatibility with the standard
 */

// ─── Codelists ────────────────────────────────────────────────────────────────

export enum OcdsTenderStatus {
  PLANNING = 'planning',
  PLANNED = 'planned',
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  UNSUCCESSFUL = 'unsuccessful',
  COMPLETE = 'complete',
  WITHDRAWN = 'withdrawn',
}

export enum OcdsProcurementMethod {
  OPEN = 'open',
  SELECTIVE = 'selective',
  LIMITED = 'limited',
  DIRECT = 'direct',
}

export enum OcdsProcurementCategory {
  GOODS = 'goods',
  WORKS = 'works',
  SERVICES = 'services',
}

export enum OcdsReleaseTag {
  PLANNING = 'planning',
  PLANNING_UPDATE = 'planningUpdate',
  TENDER = 'tender',
  TENDER_AMENDMENT = 'tenderAmendment',
  TENDER_UPDATE = 'tenderUpdate',
  TENDER_CANCELLATION = 'tenderCancellation',
  AWARD = 'award',
  AWARD_UPDATE = 'awardUpdate',
  AWARD_CANCELLATION = 'awardCancellation',
  CONTRACT = 'contract',
  CONTRACT_UPDATE = 'contractUpdate',
  CONTRACT_AMENDMENT = 'contractAmendment',
  IMPLEMENTATION = 'implementation',
  IMPLEMENTATION_UPDATE = 'implementationUpdate',
  CONTRACT_TERMINATION = 'contractTermination',
}

export enum OcdsAwardStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  UNSUCCESSFUL = 'unsuccessful',
}

export enum OcdsContractStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  TERMINATED = 'terminated',
}

export enum OcdsMilestoneStatus {
  SCHEDULED = 'scheduled',
  MET = 'met',
  NOT_MET = 'notMet',
  PARTIALLY_MET = 'partiallyMet',
}

// ─── Organization roles (open codelist) ───────────────────────────────────────

export enum OcdsPartyRole {
  BUYER = 'buyer',
  PROCURING_ENTITY = 'procuringEntity',
  SUPPLIER = 'supplier',
  TENDERER = 'tenderer',
  FUNDER = 'funder',
  ENQUIRER = 'enquirer',
  PAYER = 'payer',
  PAYEE = 'payee',
  REVIEW_BODY = 'reviewBody',
}

// ─── Building blocks ──────────────────────────────────────────────────────────

export interface OcdsValue {
  amount: number | null;
  currency: string | null;
}

export interface OcdsPeriod {
  startDate?: string | null;
  endDate?: string | null;
  maxExtentDate?: string | null;
  durationInDays?: number | null;
}

export interface OcdsClassification {
  scheme: string | null;
  id: string | null;
  description?: string | null;
  uri?: string | null;
}

export interface OcdsIdentifier {
  scheme?: string | null;
  id?: string | null;
  legalName?: string | null;
  uri?: string | null;
}

export interface OcdsAddress {
  streetAddress?: string | null;
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryName?: string | null;
}

export interface OcdsContactPoint {
  name?: string | null;
  email?: string | null;
  telephone?: string | null;
  faxNumber?: string | null;
  url?: string | null;
}

// ─── Item ─────────────────────────────────────────────────────────────────────

export interface OcdsUnit {
  scheme?: string | null;
  id?: string | null;
  name?: string | null;
  value?: OcdsValue;
  uri?: string | null;
}

export interface OcdsItem {
  id: string;
  description?: string | null;
  classification?: OcdsClassification;
  additionalClassifications?: OcdsClassification[];
  quantity?: number | null;
  unit?: OcdsUnit;
}

// ─── Document ─────────────────────────────────────────────────────────────────

export interface OcdsDocument {
  id: string;
  documentType?: string | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  format?: string | null;
  language?: string | null;
}

// ─── Organization ─────────────────────────────────────────────────────────────

export interface OcdsOrganization {
  id: string;
  name?: string | null;
  identifier?: OcdsIdentifier;
  additionalIdentifiers?: OcdsIdentifier[];
  address?: OcdsAddress;
  contactPoint?: OcdsContactPoint;
  roles?: string[];
  details?: Record<string, unknown>;
}

export interface OcdsOrganizationReference {
  id: string;
  name?: string | null;
}

// ─── Milestone ────────────────────────────────────────────────────────────────

export interface OcdsMilestone {
  id: string;
  title?: string | null;
  type?: string | null;
  description?: string | null;
  code?: string | null;
  dueDate?: string | null;
  dateMet?: string | null;
  dateModified?: string | null;
  status?: OcdsMilestoneStatus | null;
}

// ─── Amendment ────────────────────────────────────────────────────────────────

export interface OcdsAmendment {
  id?: string | null;
  date?: string | null;
  rationale?: string | null;
  description?: string | null;
  amendsReleaseID?: string | null;
  releaseID?: string | null;
}

// ─── Budget ───────────────────────────────────────────────────────────────────

export interface OcdsBudget {
  id?: string | null;
  description?: string | null;
  amount?: OcdsValue;
  project?: string | null;
  projectID?: string | null;
  uri?: string | null;
}

// ─── Planning ─────────────────────────────────────────────────────────────────

export interface OcdsPlanning {
  rationale?: string | null;
  budget?: OcdsBudget;
  documents?: OcdsDocument[];
  milestones?: OcdsMilestone[];
}

// ─── Tender (sub-object within a release) ─────────────────────────────────────

export interface OcdsTender {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: OcdsTenderStatus | null;
  procuringEntity?: OcdsOrganizationReference;
  items?: OcdsItem[];
  value?: OcdsValue;
  minValue?: OcdsValue;
  procurementMethod?: OcdsProcurementMethod | null;
  procurementMethodDetails?: string | null;
  procurementMethodRationale?: string | null;
  mainProcurementCategory?: OcdsProcurementCategory | null;
  additionalProcurementCategories?: string[];
  awardCriteria?: string | null;
  awardCriteriaDetails?: string | null;
  submissionMethod?: string[];
  submissionMethodDetails?: string | null;
  tenderPeriod?: OcdsPeriod;
  enquiryPeriod?: OcdsPeriod;
  hasEnquiries?: boolean | null;
  eligibilityCriteria?: string | null;
  awardPeriod?: OcdsPeriod;
  contractPeriod?: OcdsPeriod;
  numberOfTenderers?: number | null;
  tenderers?: OcdsOrganizationReference[];
  documents?: OcdsDocument[];
  milestones?: OcdsMilestone[];
  amendments?: OcdsAmendment[];
}

// ─── Award ────────────────────────────────────────────────────────────────────

export interface OcdsAward {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: OcdsAwardStatus | null;
  date?: string | null;
  value?: OcdsValue;
  suppliers?: OcdsOrganizationReference[];
  items?: OcdsItem[];
  contractPeriod?: OcdsPeriod;
  documents?: OcdsDocument[];
  amendments?: OcdsAmendment[];
}

// ─── Contract ─────────────────────────────────────────────────────────────────

export interface OcdsContract {
  id: string;
  awardID: string;
  title?: string | null;
  description?: string | null;
  status?: OcdsContractStatus | null;
  period?: OcdsPeriod;
  value?: OcdsValue;
  items?: OcdsItem[];
  dateSigned?: string | null;
  documents?: OcdsDocument[];
  milestones?: OcdsMilestone[];
  amendments?: OcdsAmendment[];
}

// ─── Related Process ──────────────────────────────────────────────────────────

export interface OcdsRelatedProcess {
  id: string;
  relationship?: string[];
  title?: string | null;
  scheme?: string | null;
  identifier?: string | null;
  uri?: string | null;
}

// ─── Release (top-level object) ───────────────────────────────────────────────

export interface OcdsRelease {
  ocid: string;
  id: string;
  date: string;
  tag: string[];
  initiationType: 'tender';
  parties?: OcdsOrganization[];
  buyer?: OcdsOrganizationReference;
  planning?: OcdsPlanning;
  tender?: OcdsTender;
  awards?: OcdsAward[];
  contracts?: OcdsContract[];
  language?: string | null;
  relatedProcesses?: OcdsRelatedProcess[];
}

// ─── Release Package (collection of releases) ────────────────────────────────

export interface OcdsPublisher {
  name: string;
  scheme?: string | null;
  uid?: string | null;
  uri?: string | null;
}

export interface OcdsReleasePackage {
  uri: string;
  version: string;
  extensions?: string[];
  publishedDate: string;
  releases: OcdsRelease[];
  publisher: OcdsPublisher;
  license?: string | null;
  publicationPolicy?: string | null;
}
