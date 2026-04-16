import { beforeEach, describe, expect, it, vi } from 'vitest';

const { extractEntities } = vi.hoisted(() => ({
  extractEntities: vi.fn(),
}));

vi.mock('@shieldcv/ai', () => ({
  extractEntities,
}));

import type { ResumeDocument } from '@shieldcv/resume';

import {
  getAllIdentifiers,
  getIdentifierInfo,
  scanForPhi,
  summarizeScan,
  type PhiFinding,
  type HipaaIdentifier,
} from './hipaa';
import { problematicResume } from './fixtures/problematic-resume';

function createResume(summary: string): ResumeDocument {
  return {
    id: 'resume-1',
    updatedAt: '2026-04-16T00:00:00.000Z',
    basics: {
      name: 'Avery Student',
      label: 'Nursing Student',
      email: 'avery.student@example.com',
      phone: '(212) 555-0100',
      url: '',
      summary,
      location: {
        city: 'New York',
        region: 'NY',
        countryCode: 'US',
      },
      profiles: [],
    },
    work: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
  };
}

describe('HIPAA PHI scanner', () => {
  beforeEach(() => {
    extractEntities.mockReset();
    extractEntities.mockResolvedValue([]);
  });

  it('detects a patient name in a work summary via NER', async () => {
    const resume = {
      ...createResume(''),
      work: [
        {
          id: 'work-1',
          name: 'Clinical Rotation',
          position: 'Student Nurse',
          url: '',
          startDate: '2025-01',
          endDate: '2025-05',
          summary: 'Supported medication teaching for Jane Doe during evening rounds.',
          highlights: [],
        },
      ],
    };

    extractEntities.mockImplementation(async (text: string) => {
      if (!text.includes('Jane Doe')) {
        return [];
      }

      const start = text.indexOf('Jane Doe');
      return [{ text: 'Jane Doe', label: 'PERSON', start, end: start + 8, score: 0.99 }];
    });

    const findings = await scanForPhi(resume);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: 'name',
          severity: 'medium',
          field: 'work[0].summary',
          text: 'Jane Doe',
          citation: '45 CFR § 164.514(b)(2)(i)(A)',
        }),
      ]),
    );
    expect(findings[0]?.suggestion).toContain('the patient');
  });

  it('detects an SSN pattern via regex', async () => {
    const findings = await scanForPhi(createResume('Documented a form containing SSN 123-45-6789.'));
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: 'ssn',
          severity: 'high',
          text: '123-45-6789',
        }),
      ]),
    );
  });

  it('detects phone and fax patterns without double-counting fax as a phone', async () => {
    const findings = await scanForPhi(
      createResume('Reference line: (415) 555-0188. Fax: 415-555-0119 for the case packet.'),
    );

    expect(findings.filter((finding) => finding.identifier === 'phone')).toHaveLength(1);
    expect(findings.filter((finding) => finding.identifier === 'fax')).toHaveLength(1);
  });

  it('detects email addresses', async () => {
    const findings = await scanForPhi(createResume('Shared the clinical reference at jane.doe@clinical-notes.example.'));
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: 'email',
          text: 'jane.doe@clinical-notes.example',
        }),
      ]),
    );
  });

  it('detects specific dates in MM/DD/YYYY format', async () => {
    const findings = await scanForPhi(createResume('Reviewed DOB 03/14/1980 before bedside teaching.'));
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: 'date',
          severity: 'medium',
          text: '03/14/1980',
        }),
      ]),
    );
  });

  it('detects MRN-like patterns', async () => {
    const findings = await scanForPhi(createResume('Audited a fictional note with MRN: 00A123456 for class discussion.'));
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: 'mrn',
          severity: 'high',
          text: 'MRN: 00A123456',
        }),
      ]),
    );
  });

  it('detects location and exact-date entities while skipping broad semester dates', async () => {
    const resume = createResume('Completed Spring 2025 rotation in San Francisco on March 14, 2025.');

    extractEntities.mockResolvedValue([
      {
        text: 'Spring 2025',
        label: 'DATE',
        start: 10,
        end: 21,
        score: 0.8,
      },
      {
        text: 'San Francisco',
        label: 'LOCATION',
        start: 34,
        end: 47,
        score: 0.94,
      },
      {
        text: 'March 14, 2025',
        label: 'DATE',
        start: 51,
        end: 65,
        score: 0.97,
      },
    ]);

    const findings = await scanForPhi(resume);

    expect(findings.filter((finding) => finding.identifier === 'date')).toHaveLength(1);
    expect(findings.filter((finding) => finding.identifier === 'geographic')).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'San Francisco' })]),
    );
  });

  it('detects hospital plus unit context as another unique identifier', async () => {
    const resume = createResume('Completed rounds at Mercy Hospital telemetry unit bed 12B.');

    extractEntities.mockResolvedValue([
      {
        text: 'Mercy Hospital',
        label: 'ORG',
        start: 20,
        end: 34,
        score: 0.9,
      },
    ]);

    const findings = await scanForPhi(resume);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: 'other_unique',
          severity: 'high',
        }),
      ]),
    );
  });

  it('detects ages over 89 as another unique identifier', async () => {
    const findings = await scanForPhi(createResume('Provided comfort measures for a 95-year-old patient during rounds.'));
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: 'other_unique',
          text: '95-year-old',
        }),
      ]),
    );
  });

  it('returns an empty array for a clean resume', async () => {
    const findings = await scanForPhi(createResume('Completed a 12-week adult medical-surgical practicum and supported patient education.'));
    expect(findings).toEqual([]);
  });

  it('ignores entities that fall below the configured minimum score', async () => {
    extractEntities.mockResolvedValue([
      {
        text: 'Jane Doe',
        label: 'PERSON',
        start: 14,
        end: 22,
        score: 0.2,
      },
      {
        text: 'Example Corp',
        label: 'ORG',
        start: 0,
        end: 12,
        score: 0.9,
      },
    ]);

    const findings = await scanForPhi(createResume('Observed care for Jane Doe during a simulation.'), { minScore: 0.5 });

    expect(findings).toEqual([]);
  });

  it('includes severity, explanation, suggestion, and citation on each finding', async () => {
    extractEntities.mockResolvedValue([
      {
        text: 'Jane Doe',
        label: 'PERSON',
        start: 14,
        end: 22,
        score: 0.99,
      },
    ]);

    const findings = await scanForPhi(createResume('Observed care for Jane Doe in a clinical simulation.'));

    expect(findings[0]).toMatchObject({
      severity: 'medium',
      explanation: expect.stringContaining('HIPAA Safe Harbor'),
      suggestion: expect.stringContaining('the patient'),
      citation: '45 CFR § 164.514(b)(2)(i)(A)',
    });
  });

  it('returns all 18 identifier descriptions', () => {
    const identifiers = getAllIdentifiers();
    expect(identifiers).toHaveLength(18);
    expect(new Set(identifiers.map((identifier) => identifier.id)).size).toBe(18);
  });

  it('returns valid content for every identifier info lookup', () => {
    const identifiers = getAllIdentifiers().map((identifier) => identifier.id);

    for (const identifier of identifiers) {
      const info = getIdentifierInfo(identifier);
      expect(info.title.length).toBeGreaterThan(0);
      expect(info.description.length).toBeGreaterThan(0);
      expect(info.examples.length).toBeGreaterThan(0);
      expect(info.citation).toContain('45 CFR');
    }
  });

  it('produces multiple findings for the problematic demo fixture', async () => {
    extractEntities.mockImplementation(async (text: string) => {
      const entities = [];

      if (text.includes('Jane Doe')) {
        const start = text.indexOf('Jane Doe');
        entities.push({ text: 'Jane Doe', label: 'PERSON', start, end: start + 8, score: 0.99 });
      }

      if (text.includes('Springfield, IL')) {
        const start = text.indexOf('Springfield, IL');
        entities.push({ text: 'Springfield, IL', label: 'LOCATION', start, end: start + 15, score: 0.92 });
      }

      if (text.includes('03/14/1980')) {
        const start = text.indexOf('03/14/1980');
        entities.push({ text: '03/14/1980', label: 'DATE', start, end: start + 10, score: 0.98 });
      }

      if (text.includes('St. Mercy Hospital')) {
        const start = text.indexOf('St. Mercy Hospital');
        entities.push({ text: 'St. Mercy Hospital', label: 'ORG', start, end: start + 18, score: 0.91 });
      }

      return entities;
    });

    const findings = await scanForPhi(problematicResume);
    expect(findings.length).toBeGreaterThanOrEqual(5);
  });

  it('scans certification narrative fields too', async () => {
    const resume = {
      ...createResume(''),
      certifications: [
        {
          id: 'cert-1',
          name: 'Clinical reference shared by jane.doe@clinical-notes.example',
          issuer: 'Rotation office',
          date: '2025-05',
          url: '',
        },
      ],
    };

    const findings = await scanForPhi(resume);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'certifications[0].name',
          identifier: 'email',
        }),
      ]),
    );
  });

  it('summarizes scan results for audit integration', () => {
    const identifiers = ['ssn', 'name', 'name'] satisfies HipaaIdentifier[];
    const findings: PhiFinding[] = identifiers.map((identifier, index) => ({
      identifier,
      text: `finding-${index}`,
      field: 'basics.summary',
      start: index,
      end: index + 1,
      severity: identifier === 'ssn' ? 'high' : 'medium',
      explanation: 'why',
      suggestion: 'rewrite',
      citation: '45 CFR § 164.514(b)(2)(i)',
    }));

    const summary = summarizeScan('resume-1', findings);

    expect(summary.resumeId).toBe('resume-1');
    expect(summary.findingsCount).toBe(3);
    expect(summary.highCount).toBe(1);
    expect(summary.mediumCount).toBe(2);
    expect(summary.lowCount).toBe(0);
    expect(summary.identifiersFound).toEqual(['ssn', 'name']);
    expect(summary.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

});
