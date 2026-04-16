import { extractEntities } from '@shieldcv/ai';
import type { Entity } from '@shieldcv/ai';
import type { ResumeDocument } from '@shieldcv/resume';

/**
 * Alias for the normalized resume document consumed by ShieldCV's compliance scanners.
 */
export type Resume = ResumeDocument;

/**
 * HIPAA Safe Harbor identifiers enumerated at 45 CFR § 164.514(b)(2)(i)(A)-(R).
 */
export type HipaaIdentifier =
  | 'name'
  | 'geographic'
  | 'date'
  | 'phone'
  | 'fax'
  | 'email'
  | 'ssn'
  | 'mrn'
  | 'health_plan'
  | 'account_number'
  | 'certificate_license'
  | 'vehicle_identifier'
  | 'device_identifier'
  | 'url'
  | 'ip_address'
  | 'biometric'
  | 'photo'
  | 'other_unique';

/**
 * A potential PHI issue found in resume narrative text.
 *
 * The scanner follows HIPAA's Safe Harbor de-identification rule at
 * 45 CFR § 164.514(b)(2)(i) by looking for identifiers that could make a
 * patient or encounter reasonably identifiable when described on a resume.
 */
export interface PhiFinding {
  identifier: HipaaIdentifier;
  text: string;
  field: string;
  start: number;
  end: number;
  severity: 'high' | 'medium' | 'low';
  explanation: string;
  suggestion: string;
  citation: string;
}

/**
 * Summary payload for downstream audit logging.
 *
 * The summary is intentionally lightweight so future audit storage can record
 * scan activity without persisting the underlying PHI-like text.
 */
export interface ScanResult {
  timestamp: string;
  resumeId: string;
  findingsCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  identifiersFound: HipaaIdentifier[];
}

type Severity = PhiFinding['severity'];

type IdentifierInfo = {
  title: string;
  description: string;
  examples: string[];
  citation: string;
  severity: Severity;
};

type FieldText = {
  field: string;
  text: string;
};

type RegexMatcher = {
  identifier: HipaaIdentifier;
  regex: RegExp;
};

type IndexedMatch = RegExpMatchArray & { index: number };

const IDENTIFIER_INFO: Record<HipaaIdentifier, IdentifierInfo> = {
  name: {
    title: 'Names',
    description: 'Names that directly identify a patient, family member, or other individual tied to care.',
    examples: ['Jane Doe', 'Mr. Lopez', 'patient initials used as a stand-in'],
    citation: '45 CFR § 164.514(b)(2)(i)(A)',
    severity: 'medium',
  },
  geographic: {
    title: 'Geographic Subdivisions Smaller Than a State',
    description: 'Street addresses, cities, ZIP codes, and similar location detail smaller than a state.',
    examples: ['412 Oak Street', 'Springfield, IL 62704', 'Northside neighborhood'],
    citation: '45 CFR § 164.514(b)(2)(i)(B)',
    severity: 'low',
  },
  date: {
    title: 'Dates Related to an Individual',
    description: 'Birth dates, admission dates, discharge dates, and any other date more specific than a year.',
    examples: ['03/14/1980', 'March 14, 2025', 'discharged on 4/2/25'],
    citation: '45 CFR § 164.514(b)(2)(i)(C)',
    severity: 'medium',
  },
  phone: {
    title: 'Telephone Numbers',
    description: 'Direct phone numbers connected to a patient, family member, or care contact.',
    examples: ['(415) 555-0188', '555-0100'],
    citation: '45 CFR § 164.514(b)(2)(i)(D)',
    severity: 'medium',
  },
  fax: {
    title: 'Fax Numbers',
    description: 'Fax numbers tied to a patient or a specific clinical case.',
    examples: ['Fax: 415-555-0119', 'fax line 555-0199'],
    citation: '45 CFR § 164.514(b)(2)(i)(E)',
    severity: 'medium',
  },
  email: {
    title: 'Email Addresses',
    description: 'Email addresses that can identify a patient or case contact.',
    examples: ['jane.doe@example.com', 'family-contact@hospital.example'],
    citation: '45 CFR § 164.514(b)(2)(i)(F)',
    severity: 'medium',
  },
  ssn: {
    title: 'Social Security Numbers',
    description: 'Social Security numbers and SSN formats.',
    examples: ['123-45-6789'],
    citation: '45 CFR § 164.514(b)(2)(i)(G)',
    severity: 'high',
  },
  mrn: {
    title: 'Medical Record Numbers',
    description: 'Medical record numbers, chart numbers, or MRN-style identifiers.',
    examples: ['MRN 00A123456', 'Medical Record Number 81234567'],
    citation: '45 CFR § 164.514(b)(2)(i)(H)',
    severity: 'high',
  },
  health_plan: {
    title: 'Health Plan Beneficiary Numbers',
    description: 'Member IDs, subscriber IDs, and other health plan identifiers.',
    examples: ['Member ID 123456789', 'subscriber number ABC12345'],
    citation: '45 CFR § 164.514(b)(2)(i)(I)',
    severity: 'high',
  },
  account_number: {
    title: 'Account Numbers',
    description: 'Billing, encounter, or account numbers tied to an individual.',
    examples: ['Account #9988123', 'encounter account 441102'],
    citation: '45 CFR § 164.514(b)(2)(i)(J)',
    severity: 'high',
  },
  certificate_license: {
    title: 'Certificate or License Numbers',
    description: 'Certificate or license numbers belonging to an individual patient or case record.',
    examples: ['license #A1234567', 'certificate 778812'],
    citation: '45 CFR § 164.514(b)(2)(i)(K)',
    severity: 'high',
  },
  vehicle_identifier: {
    title: 'Vehicle Identifiers and Serial Numbers',
    description: 'Vehicle identifiers, license plate numbers, and similar serial numbers.',
    examples: ['plate 8ABC123', 'VIN 1HGCM82633A123456'],
    citation: '45 CFR § 164.514(b)(2)(i)(L)',
    severity: 'medium',
  },
  device_identifier: {
    title: 'Device Identifiers and Serial Numbers',
    description: 'Medical device identifiers or device serial numbers linked to a specific patient.',
    examples: ['device ID 771882', 'serial no. SN-445210'],
    citation: '45 CFR § 164.514(b)(2)(i)(M)',
    severity: 'medium',
  },
  url: {
    title: 'Web URLs',
    description: 'URLs that point to an identifiable patient record, portal, or case artifact.',
    examples: ['https://example.org/case/123', 'portal link with a chart number'],
    citation: '45 CFR § 164.514(b)(2)(i)(N)',
    severity: 'medium',
  },
  ip_address: {
    title: 'IP Addresses',
    description: 'IP addresses assigned to an individual or device in a clinical context.',
    examples: ['10.23.14.8', '192.168.1.15'],
    citation: '45 CFR § 164.514(b)(2)(i)(O)',
    severity: 'medium',
  },
  biometric: {
    title: 'Biometric Identifiers',
    description: 'Fingerprints, voiceprints, retinal scans, or comparable biometric markers.',
    examples: ['fingerprint scan', 'voiceprint'],
    citation: '45 CFR § 164.514(b)(2)(i)(P)',
    severity: 'high',
  },
  photo: {
    title: 'Full-Face Photographic Images',
    description: 'Full-face photographs or comparable images that identify an individual.',
    examples: ['patient photo', 'full-face image'],
    citation: '45 CFR § 164.514(b)(2)(i)(Q)',
    severity: 'medium',
  },
  other_unique: {
    title: 'Other Unique Identifying Numbers, Characteristics, or Codes',
    description: 'Any other unique code or combination of detail that can reasonably identify a patient or encounter.',
    examples: ['hospital + unit + bed number', 'age over 89 with a rare condition'],
    citation: '45 CFR § 164.514(b)(2)(i)(R)',
    severity: 'high',
  },
};

const SPECIFIC_DATE_PATTERN =
  /\b(?:(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+(?:19|20)\d{2})\b/gi;
const STREET_PATTERN =
  /\b\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way)\b/gi;
const ZIP_PATTERN = /\b\d{5}(?:-\d{4})?\b/g;
const HOSPITAL_ROOM_PATTERN =
  /\b(?:[A-Z][A-Za-z.'&-]+(?:\s+[A-Z][A-Za-z.'&-]+){0,4}\s+(?:Hospital|Medical Center|Medical Centre|Clinic|Health System))[^.!?\n]{0,60}\b(?:icu|er|ed|telemetry|unit|ward|room|bed)\s+[A-Z0-9-]+\b/gi;
const AGE_OVER_89_PATTERN = /\b(?:9\d|1[0-1]\d|120)[-\s]?year[-\s]?old\b/gi;

const REGEX_MATCHERS: RegexMatcher[] = [
  { identifier: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { identifier: 'fax', regex: /\bfax[:\s]*(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/gi },
  { identifier: 'phone', regex: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g },
  { identifier: 'email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { identifier: 'url', regex: /\bhttps?:\/\/[^\s)]+/gi },
  { identifier: 'ip_address', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { identifier: 'mrn', regex: /\b(?:MRN|Medical Record Number|Medical Record|Chart Number)[:#\s-]*[A-Z0-9-]{6,12}\b/gi },
  { identifier: 'health_plan', regex: /\b(?:member|subscriber|policy|plan)\s*(?:id|number|no\.?)[:#\s-]*[A-Z0-9-]{5,}\b/gi },
  { identifier: 'account_number', regex: /\b(?:account|acct|encounter)\s*(?:number|no\.?|#)[:#\s-]*[A-Z0-9-]{5,}\b/gi },
  { identifier: 'certificate_license', regex: /\b(?:certificate|license)\s*(?:number|no\.?|#)[:#\s-]*[A-Z0-9-]{4,}\b/gi },
  { identifier: 'vehicle_identifier', regex: /\b(?:VIN|plate|license plate)[:#\s-]*[A-Z0-9-]{5,17}\b/gi },
  { identifier: 'device_identifier', regex: /\b(?:device|serial)\s*(?:id|number|no\.?|#)[:#\s-]*[A-Z0-9-]{4,}\b/gi },
  { identifier: 'biometric', regex: /\b(?:fingerprint|voiceprint|retina(?:l)? scan|iris scan|facial geometry)\b/gi },
  { identifier: 'photo', regex: /\b(?:patient photo|full-face image|full face photograph|facial photograph)\b/gi },
];

const DIRECT_REPLACEMENTS: Partial<Record<HipaaIdentifier, string>> = {
  name: 'the patient',
  geographic: 'a clinical setting',
  date: 'during the rotation',
};

function pushField(fields: FieldText[], field: string, text: string | undefined): void {
  if (text && text.trim()) {
    fields.push({ field, text });
  }
}

function collectNarrativeFields(resume: Resume): FieldText[] {
  const fields: FieldText[] = [];

  pushField(fields, 'basics.summary', resume.basics.summary);

  resume.work.forEach((workItem, index) => {
    pushField(fields, `work[${index}].summary`, workItem.summary);
    workItem.highlights.forEach((highlight, highlightIndex) => {
      pushField(fields, `work[${index}].highlights[${highlightIndex}]`, highlight);
    });
  });

  resume.education.forEach((educationItem, index) => {
    pushField(fields, `education[${index}].area`, educationItem.area);
    educationItem.courses.forEach((course, courseIndex) => {
      pushField(fields, `education[${index}].courses[${courseIndex}]`, course);
    });
  });

  resume.projects.forEach((project, index) => {
    pushField(fields, `projects[${index}].description`, project.description);
    project.highlights.forEach((highlight, highlightIndex) => {
      pushField(fields, `projects[${index}].highlights[${highlightIndex}]`, highlight);
    });
  });

  resume.certifications.forEach((certification, index) => {
    pushField(fields, `certifications[${index}].name`, certification.name);
    pushField(fields, `certifications[${index}].issuer`, certification.issuer);
  });

  return fields;
}

function createKey(field: string, identifier: HipaaIdentifier, start: number, end: number, text: string): string {
  return `${field}:${identifier}:${start}:${end}:${text.toLowerCase()}`;
}

function matchStart(match: RegExpMatchArray): number {
  return (match as IndexedMatch).index;
}

function createExplanation(identifier: HipaaIdentifier): string {
  const info = IDENTIFIER_INFO[identifier];
  return `${info.title} are listed in HIPAA Safe Harbor as identifiers that should be removed or generalized before clinical experiences are described on a resume.`;
}

function replaceRange(text: string, start: number, end: number, replacement: string): string {
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`.replace(/\s+/g, ' ').trim();
}

function createSuggestion(identifier: HipaaIdentifier, text: string, fieldText: string, start: number, end: number): string {
  const replacement = DIRECT_REPLACEMENTS[identifier];

  if (replacement) {
    return replaceRange(fieldText, start, end, replacement);
  }

  if (identifier === 'other_unique') {
    return 'Generalize the care site and remove the unique room, bed, or encounter detail. For example: completed care coordination in a teaching hospital telemetry unit.';
  }

  return `Remove "${text}" and rewrite the sentence with a generalized description of the patient or care setting instead.`;
}

function hasSpecificDateGranularity(text: string): boolean {
  return SPECIFIC_DATE_PATTERN.test(text);
}

function createFinding(field: string, fieldText: string, identifier: HipaaIdentifier, start: number, end: number): PhiFinding {
  const text = fieldText.slice(start, end);
  const info = IDENTIFIER_INFO[identifier];

  return {
    identifier,
    text,
    field,
    start,
    end,
    severity: info.severity,
    explanation: createExplanation(identifier),
    suggestion: createSuggestion(identifier, text, fieldText, start, end),
    citation: info.citation,
  };
}

function addFinding(
  findings: PhiFinding[],
  seen: Set<string>,
  field: string,
  fieldText: string,
  identifier: HipaaIdentifier,
  start: number,
  end: number,
): void {
  const text = fieldText.slice(start, end);
  const key = createKey(field, identifier, start, end, text);

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  findings.push(createFinding(field, fieldText, identifier, start, end));
}

function addRegexFindings(findings: PhiFinding[], seen: Set<string>, field: string, fieldText: string): void {
  for (const matcher of REGEX_MATCHERS) {
    for (const match of fieldText.matchAll(matcher.regex)) {
      const matchText = match[0];
      const start = matchStart(match);
      const prefix = fieldText.slice(Math.max(0, start - 6), start);

      if (matcher.identifier === 'phone' && /fax[:\s]*$/i.test(prefix)) {
        continue;
      }

      addFinding(findings, seen, field, fieldText, matcher.identifier, start, start + matchText.length);
    }
  }

  for (const match of fieldText.matchAll(STREET_PATTERN)) {
    const start = matchStart(match);
    addFinding(findings, seen, field, fieldText, 'geographic', start, start + match[0].length);
  }

  for (const match of fieldText.matchAll(ZIP_PATTERN)) {
    const start = matchStart(match);
    addFinding(findings, seen, field, fieldText, 'geographic', start, start + match[0].length);
  }

  for (const match of fieldText.matchAll(SPECIFIC_DATE_PATTERN)) {
    const start = matchStart(match);
    addFinding(findings, seen, field, fieldText, 'date', start, start + match[0].length);
  }

  for (const match of fieldText.matchAll(HOSPITAL_ROOM_PATTERN)) {
    const start = matchStart(match);
    addFinding(findings, seen, field, fieldText, 'other_unique', start, start + match[0].length);
  }

  for (const match of fieldText.matchAll(AGE_OVER_89_PATTERN)) {
    const start = matchStart(match);
    addFinding(findings, seen, field, fieldText, 'other_unique', start, start + match[0].length);
  }
}

function addEntityFindings(
  findings: PhiFinding[],
  seen: Set<string>,
  field: string,
  fieldText: string,
  entities: Entity[],
  minScore: number,
): void {
  for (const entity of entities) {
    if (entity.score < minScore) {
      continue;
    }

    if (entity.label === 'PERSON') {
      addFinding(findings, seen, field, fieldText, 'name', entity.start, entity.end);
      continue;
    }

    if (entity.label === 'LOCATION') {
      addFinding(findings, seen, field, fieldText, 'geographic', entity.start, entity.end);
      continue;
    }

    if (entity.label === 'DATE' && hasSpecificDateGranularity(entity.text)) {
      addFinding(findings, seen, field, fieldText, 'date', entity.start, entity.end);
      continue;
    }

    if (
      entity.label === 'ORG' &&
      /\b(hospital|medical center|clinic|health system)\b/i.test(entity.text) &&
      /\b(icu|er|ed|telemetry|unit|ward|room|bed)\b/i.test(fieldText)
    ) {
      addFinding(findings, seen, field, fieldText, 'other_unique', entity.start, entity.end);
    }
  }
}

/**
 * Scans narrative resume content for potential HIPAA Safe Harbor identifiers.
 *
 * The detector combines local NER from `@shieldcv/ai` with deterministic
 * pattern matching so clinical resume text can be reviewed entirely on-device
 * for the 18 identifier classes listed at 45 CFR § 164.514(b)(2)(i).
 */
export async function scanForPhi(
  resume: Resume,
  options: { minScore?: number } = {},
): Promise<PhiFinding[]> {
  const minScore = options.minScore ?? 0.5;
  const findings: PhiFinding[] = [];
  const seen = new Set<string>();
  const fields = collectNarrativeFields(resume);

  for (const field of fields) {
    addRegexFindings(findings, seen, field.field, field.text);

    const entities = await extractEntities(field.text, {
      minScore,
      labels: ['PERSON', 'LOCATION', 'DATE', 'ORG'],
    });

    addEntityFindings(findings, seen, field.field, field.text, entities, minScore);
  }

  return findings.sort((left, right) => {
    const severityOrder = { high: 0, medium: 1, low: 2 } as const;
    const severityDelta = severityOrder[left.severity] - severityOrder[right.severity];

    if (severityDelta !== 0) {
      return severityDelta;
    }

    if (left.field !== right.field) {
      return left.field.localeCompare(right.field);
    }

    return left.start - right.start;
  });
}

/**
 * Returns educational guidance for one Safe Harbor identifier class.
 *
 * This content is meant for in-product education so students can understand
 * why a finding appeared and how the cited subsection of 45 CFR § 164.514(b)
 * applies to resume writing.
 */
export function getIdentifierInfo(
  id: HipaaIdentifier,
): { title: string; description: string; examples: string[]; citation: string } {
  const info = IDENTIFIER_INFO[id];
  return {
    title: info.title,
    description: info.description,
    examples: [...info.examples],
    citation: info.citation,
  };
}

/**
 * Returns the complete Safe Harbor reference list used by the educational UI.
 *
 * Each entry maps one of the 18 identifiers to its citation in
 * 45 CFR § 164.514(b)(2)(i)(A)-(R).
 */
export function getAllIdentifiers(): Array<{
  id: HipaaIdentifier;
  title: string;
  description: string;
  citation: string;
}> {
  return (Object.keys(IDENTIFIER_INFO) as HipaaIdentifier[]).map((id) => ({
    id,
    title: IDENTIFIER_INFO[id].title,
    description: IDENTIFIER_INFO[id].description,
    citation: IDENTIFIER_INFO[id].citation,
  }));
}

/**
 * Produces a redacted scan summary for future audit-log integration.
 *
 * The result intentionally stores counts and identifier classes, not the
 * original matched strings, so later audit features can record scanning
 * activity without retaining the potentially sensitive content itself.
 */
export function summarizeScan(resumeId: string, findings: PhiFinding[]): ScanResult {
  const identifiersFound = findings.reduce<HipaaIdentifier[]>((identifiers, finding) => {
    if (!identifiers.includes(finding.identifier)) {
      identifiers.push(finding.identifier);
    }

    return identifiers;
  }, []);

  return {
    timestamp: new Date().toISOString(),
    resumeId,
    findingsCount: findings.length,
    highCount: findings.filter((finding) => finding.severity === 'high').length,
    mediumCount: findings.filter((finding) => finding.severity === 'medium').length,
    lowCount: findings.filter((finding) => finding.severity === 'low').length,
    identifiersFound,
  };
}
