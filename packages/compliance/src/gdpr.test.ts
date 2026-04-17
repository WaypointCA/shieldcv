import { describe, expect, it, vi } from 'vitest';

import {
  calculateDeadline,
  createApplicationRecord,
  createTrackerApplicationRecord,
  generateDsarEmail,
  generateErasureEmail,
  getGdprEducation,
} from './gdpr';

describe('GDPR helpers', () => {
  it('createApplicationRecord returns valid record with UUID', () => {
    const randomUUID = vi.fn(() => '550e8400-e29b-41d4-a716-446655440000');
    vi.stubGlobal('crypto', { randomUUID });

    const record = createApplicationRecord('LinkedIn', 'Acme');

    expect(record).toEqual(
      expect.objectContaining({
        id: '550e8400-e29b-41d4-a716-446655440000',
        platform: 'LinkedIn',
        company: 'Acme',
        dsarSent: false,
        erasureRequested: false,
      }),
    );
    expect(randomUUID).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('generateDsarEmail produces correct subject and body', () => {
    const record = {
      id: 'app-1',
      platform: 'Workday',
      company: 'Northwind Defense',
      dateApplied: '2026-04-01T00:00:00.000Z',
      dsarSent: false,
      erasureRequested: false,
      notes: '',
    };

    const email = generateDsarEmail(record, 'Avery Student', 'avery@example.com');

    expect(email.subject).toBe('Data Subject Access Request pursuant to GDPR Article 15');
    expect(email.body).toContain('Article 15');
    expect(email.body).toContain('Northwind Defense');
    expect(email.body).toContain('You are required to respond within 30 days');
  });

  it('createTrackerApplicationRecord extends the base record with tracker fields', () => {
    const randomUUID = vi.fn(() => '550e8400-e29b-41d4-a716-446655440001');
    vi.stubGlobal('crypto', { randomUUID });

    const record = createTrackerApplicationRecord('LinkedIn', 'Acme', 'Security Analyst');

    expect(record).toEqual(
      expect.objectContaining({
        id: '550e8400-e29b-41d4-a716-446655440001',
        platform: 'LinkedIn',
        company: 'Acme',
        positionTitle: 'Security Analyst',
        status: 'applied',
        dsarSent: false,
        erasureRequested: false,
      }),
    );
    vi.unstubAllGlobals();
  });

  it('generateErasureEmail produces correct subject and body', () => {
    const record = {
      id: 'app-1',
      platform: 'Greenhouse',
      company: 'Orbit Labs',
      dateApplied: '2026-04-01T00:00:00.000Z',
      dsarSent: false,
      erasureRequested: false,
      notes: '',
    };

    const email = generateErasureEmail(record, 'Avery Student', 'avery@example.com');

    expect(email.subject).toBe('Right to Erasure Request pursuant to GDPR Article 17');
    expect(email.body).toContain('Article 17');
    expect(email.body).toContain('Orbit Labs');
    expect(email.body).toContain('You are required to respond within 30 days');
  });

  it('calculateDeadline returns date 30 days from input', () => {
    expect(calculateDeadline('2026-04-01T00:00:00.000Z')).toBe('2026-05-01T00:00:00.000Z');
  });

  it('getGdprEducation returns complete content including AI Act info', () => {
    const education = getGdprEducation();

    expect(education.overview).toContain('GDPR');
    expect(education.rights.length).toBeGreaterThanOrEqual(8);
    expect(education.aiActInfo.effectiveDate).toBe('2026-08-02');
    expect(education.aiActInfo.hiringClassification).toContain('high-risk');
    expect(education.commonPlatforms.length).toBeGreaterThanOrEqual(8);
  });

  it('DSAR email mentions Article 15', () => {
    const email = generateDsarEmail(
      {
        id: 'app-2',
        platform: 'Indeed',
        company: 'Contoso',
        dateApplied: '2026-03-05T00:00:00.000Z',
        dsarSent: false,
        erasureRequested: false,
        notes: '',
      },
      'Avery Student',
      'avery@example.com',
    );

    expect(email.body).toContain('Article 15');
  });

  it('Erasure email mentions Article 17', () => {
    const email = generateErasureEmail(
      {
        id: 'app-3',
        platform: 'LinkedIn',
        company: 'Fabrikam',
        dateApplied: '2026-02-02T00:00:00.000Z',
        dsarSent: false,
        erasureRequested: false,
        notes: '',
      },
      'Avery Student',
      'avery@example.com',
    );

    expect(email.body).toContain('Article 17');
  });
});
