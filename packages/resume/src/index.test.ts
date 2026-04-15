import { describe, expect, it } from 'vitest';

import {
  createBlankResume,
  normalizeResumeDocument,
  ResumeSchema,
  resumeBasicsSchema,
  resumeCertificationSchema,
  resumeDocumentSchema,
  resumeEducationSchema,
  resumeLocationSchema,
  resumeProfileSchema,
  resumeProjectSchema,
  resumeSkillSchema,
  resumeWorkSchema,
} from './index';

const fullyPopulatedResume = {
  id: 'resume-full',
  basics: {
    name: 'Ada Lovelace',
    label: 'Computing Pioneer',
    email: 'ada@example.com',
    phone: '+1 555 010 0101',
    url: 'https://example.com',
    summary: 'Builds rigorous systems.',
    location: {
      city: 'London',
      region: 'England',
      countryCode: 'GB',
    },
    profiles: [
      {
        network: 'GitHub',
        username: 'ada',
        url: 'https://github.com/ada',
      },
    ],
  },
  work: [
    {
      id: 'work-1',
      name: 'Analytical Engines Ltd',
      position: 'Mathematician',
      url: 'https://example.com/work',
      startDate: '1842',
      endDate: '1843',
      summary: 'Translated and expanded notes.',
      highlights: ['Authored the first algorithm'],
    },
  ],
  education: [
    {
      id: 'education-1',
      institution: 'Private Study',
      url: 'https://example.com/education',
      area: 'Mathematics',
      studyType: 'Mentorship',
      startDate: '1832',
      endDate: '1843',
      score: 'Excellent',
      courses: ['Logic', 'Analysis'],
    },
  ],
  skills: [
    {
      id: 'skill-1',
      name: 'Mathematics',
      level: 'Expert',
      keywords: ['logic', 'analysis'],
    },
  ],
  projects: [
    {
      id: 'project-1',
      name: 'Engine Notes',
      description: 'Explained computational machinery.',
      highlights: ['Published Note G'],
      keywords: ['computation'],
      startDate: '1842',
      endDate: '1843',
      url: 'https://example.com/project',
      roles: ['Author'],
      entity: 'Scientific Memoirs',
      type: 'Publication',
    },
  ],
  certifications: [
    {
      id: 'cert-1',
      name: 'Local-First Security',
      issuer: 'ShieldCV',
      date: '2026-04-15',
      url: 'https://example.com/cert',
    },
  ],
  updatedAt: '2026-04-15T00:00:00.000Z',
};

describe('@shieldcv/resume schemas', () => {
  it('ResumeSchema validates a minimal valid resume', () => {
    expect(ResumeSchema.parse({ id: 'resume-minimal', updatedAt: '2026-04-15T00:00:00.000Z' })).toEqual({
      id: 'resume-minimal',
      basics: {
        name: '',
        label: '',
        email: '',
        phone: '',
        url: '',
        summary: '',
        location: {
          city: '',
          region: '',
          countryCode: '',
        },
        profiles: [],
      },
      work: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      updatedAt: '2026-04-15T00:00:00.000Z',
    });
  });

  it('ResumeSchema rejects resumes missing required fields', () => {
    expect(() => ResumeSchema.parse({ updatedAt: '2026-04-15T00:00:00.000Z' })).toThrow();
    expect(() => ResumeSchema.parse({ id: 'resume-missing-updated-at' })).toThrow();
  });

  it('ResumeSchema accepts a fully populated resume', () => {
    expect(ResumeSchema.parse(fullyPopulatedResume)).toEqual(fullyPopulatedResume);
  });

  it('createBlankResume returns a value that passes schema validation', () => {
    const resume = createBlankResume();

    expect(resume.id).toEqual(expect.any(String));
    expect(ResumeSchema.parse(resume)).toEqual(resume);
  });

  it('createBlankResume accepts an optional id parameter', () => {
    expect(createBlankResume('custom-id').id).toBe('custom-id');
  });

  it('normalizes resume documents and exercises exported nested schemas', () => {
    expect(normalizeResumeDocument(fullyPopulatedResume)).toEqual(fullyPopulatedResume);
    expect(resumeDocumentSchema.parse(fullyPopulatedResume)).toEqual(fullyPopulatedResume);
    expect(resumeBasicsSchema.parse(fullyPopulatedResume.basics)).toEqual(fullyPopulatedResume.basics);
    expect(resumeLocationSchema.parse(fullyPopulatedResume.basics.location)).toEqual(
      fullyPopulatedResume.basics.location
    );
    expect(resumeProfileSchema.parse(fullyPopulatedResume.basics.profiles[0])).toEqual(
      fullyPopulatedResume.basics.profiles[0]
    );
    expect(resumeWorkSchema.parse(fullyPopulatedResume.work[0])).toEqual(fullyPopulatedResume.work[0]);
    expect(resumeEducationSchema.parse(fullyPopulatedResume.education[0])).toEqual(
      fullyPopulatedResume.education[0]
    );
    expect(resumeSkillSchema.parse(fullyPopulatedResume.skills[0])).toEqual(
      fullyPopulatedResume.skills[0]
    );
    expect(resumeProjectSchema.parse(fullyPopulatedResume.projects[0])).toEqual(
      fullyPopulatedResume.projects[0]
    );
    expect(resumeCertificationSchema.parse(fullyPopulatedResume.certifications[0])).toEqual(
      fullyPopulatedResume.certifications[0]
    );
  });
});
