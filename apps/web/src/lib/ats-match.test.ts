import { describe, expect, it } from 'vitest';
import { createBlankResume } from '@shieldcv/resume';
import {
  buildAtsAnalysis,
  extractEntityKeywords,
  extractSimpleKeywords,
  keywordAppearsInText,
  resumeToPlainText,
} from './ats-match';

describe('ATS match helpers', () => {
  it('builds searchable plain text from a resume', () => {
    const resume = createBlankResume('resume-1');
    resume.basics.summary = 'Telemetry nurse with HIPAA-safe communication.';
    resume.skills.push({ id: 'skill-1', name: 'Kubernetes', level: 'advanced', keywords: ['containers'] });

    const text = resumeToPlainText(resume);

    expect(text).toContain('Telemetry nurse');
    expect(text).toContain('Kubernetes');
  });

  it('extracts filtered keywords', () => {
    expect(extractSimpleKeywords('Candidates should have Kubernetes and Python experience with the team.')).toEqual([
      'kubernetes',
      'python',
    ]);
  });

  it('deduplicates entity keywords', () => {
    expect(
      extractEntityKeywords([
        { text: 'Kubernetes', label: 'ORG', start: 0, end: 10, score: 0.9 },
        { text: 'Kubernetes', label: 'ORG', start: 15, end: 25, score: 0.8 },
      ]),
    ).toEqual(['Kubernetes']);
  });

  it('matches keywords case-insensitively', () => {
    expect(keywordAppearsInText('kubernetes', 'Built Kubernetes clusters')).toBe(true);
    expect(keywordAppearsInText('patient privacy', 'Focused on patient privacy and education')).toBe(true);
  });

  it('produces found and missing keywords with suggestions', () => {
    const resume = createBlankResume('resume-2');
    resume.work.push({
      id: 'work-1',
      name: 'Mercy Hospital',
      position: 'Student Nurse',
      url: '',
      startDate: '2025-01',
      endDate: '2025-05',
      summary: 'Provided bedside education and telemetry support.',
      highlights: ['Coordinated discharge teaching for adult cardiac patients.'],
    });

    const analysis = buildAtsAnalysis(
      resume,
      'Need telemetry, bedside education, Kubernetes, and discharge teaching experience.',
      ['telemetry', 'bedside education', 'Kubernetes'],
      0.72,
    );

    expect(analysis.score).toBe(72);
    expect(analysis.foundKeywords).toEqual(expect.arrayContaining(['telemetry', 'bedside education']));
    expect(analysis.missingKeywords).toContain('Kubernetes');
    expect(analysis.suggestions[0]?.suggestion).toContain('Mercy Hospital');
  });
});
