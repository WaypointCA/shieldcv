import { describe, expect, it } from 'vitest';
import type { ResumeDocument } from '@shieldcv/resume';

import { getCmmcEducation, scanForCui } from './cmmc';

function createResume(summary: string): ResumeDocument {
  return {
    id: 'resume-cmmc',
    updatedAt: '2026-04-16T00:00:00.000Z',
    basics: {
      name: 'Avery Student',
      label: 'Systems Engineering Intern',
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

describe('CMMC educational scanner', () => {
  it('detects a CUI marking in resume text', async () => {
    const findings = await scanForCui(createResume('Prepared a status brief marked CUI for the program office.'));

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'cui_marking',
          severity: 'high',
          text: 'CUI',
        }),
      ]),
    );
  });

  it('detects an ITAR reference', async () => {
    const findings = await scanForCui(createResume('Supported ITAR review workflows for avionics design updates.'));

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'itar_ear',
          severity: 'high',
          text: 'ITAR',
        }),
      ]),
    );
  });

  it('detects a defense program name', async () => {
    const findings = await scanForCui(createResume('Contributed test automation for the THAAD integration lab.'));

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'program_name',
          severity: 'medium',
          text: 'THAAD',
        }),
      ]),
    );
  });

  it('detects a clearance level mention', async () => {
    const findings = await scanForCui(createResume('Eligible for Secret clearance and assigned to a secure team.'));

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'clearance_level',
          severity: 'low',
          text: 'Secret clearance',
        }),
      ]),
    );
  });

  it('returns empty for a clean resume', async () => {
    const findings = await scanForCui(
      createResume('Built automated test harnesses for a regulated manufacturing internship and improved reporting speed.'),
    );

    expect(findings).toEqual([]);
  });

  it('getCmmcEducation returns complete content', () => {
    const education = getCmmcEducation();

    expect(education.overview).toContain('CMMC 2.0');
    expect(education.nistControls.length).toBeGreaterThanOrEqual(5);
    expect(education.cuiCategories.length).toBeGreaterThanOrEqual(4);
    expect(education.safeDescriptionPatterns.length).toBeGreaterThanOrEqual(4);
  });

  it('each finding has severity, explanation, and guidance', async () => {
    const findings = await scanForCui(
      createResume('Worked inside SCIF 2 and supported a Top Secret clearance onboarding package.'),
    );

    expect(findings.length).toBeGreaterThan(0);

    for (const finding of findings) {
      expect(finding.severity).toMatch(/^(high|medium|low)$/);
      expect(finding.explanation.length).toBeGreaterThan(0);
      expect(finding.guidance.length).toBeGreaterThan(0);
    }
  });

  it('sorts findings by field and position', async () => {
    const resume = {
      ...createResume('Mentioned ITAR work in the summary.'),
      work: [
        {
          id: 'work-1',
          name: 'Defense Lab',
          position: 'Intern',
          url: '',
          startDate: '2025-01',
          endDate: '2025-05',
          summary: 'Supported THAAD integration and CUI document review.',
          highlights: ['Prepared ITAR notes for the integration lead.'],
        },
      ],
    };

    const findings = await scanForCui(resume);

    expect(findings.map((finding) => `${finding.field}:${finding.text}`)).toEqual([
      'basics.summary:ITAR',
      'work[0].highlights[0]:ITAR',
      'work[0].summary:THAAD',
      'work[0].summary:CUI',
    ]);
  });

  it('scans education, projects, and certifications narrative fields', async () => {
    const resume = {
      ...createResume(''),
      education: [
        {
          id: 'edu-1',
          institution: 'State University',
          url: '',
          area: 'Controlled Unclassified Information handling workshop',
          studyType: 'BS',
          startDate: '2022-08',
          endDate: '2026-05',
          score: '',
          courses: ['ITAR compliance practicum'],
        },
      ],
      projects: [
        {
          id: 'project-1',
          name: 'Capstone',
          description: 'Built a simulation around the Patriot launcher workflow.',
          highlights: ['Prepared material for Building 12 reviewers.'],
          keywords: [],
          startDate: '2025-09',
          endDate: '2026-04',
          url: '',
          roles: [],
          entity: '',
          type: '',
        },
      ],
      certifications: [
        {
          id: 'cert-1',
          name: 'Secret clearance briefing',
          issuer: 'SCIF operations office',
          date: '2025-06',
          url: '',
        },
      ],
    };

    const findings = await scanForCui(resume);

    expect(findings.map((finding) => finding.field)).toEqual(
      expect.arrayContaining([
        'education[0].area',
        'education[0].courses[0]',
        'projects[0].description',
        'projects[0].highlights[0]',
        'certifications[0].name',
        'certifications[0].issuer',
      ]),
    );
  });
});
