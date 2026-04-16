import { describe, expect, it } from 'vitest';
import { createBlankResume } from '@shieldcv/resume';
import {
  assertResumeWithinSizeLimit,
  MAX_RESUME_SIZE,
  measureResumeSize,
  ResumeSizeError,
} from './resume-vault';

describe('resume vault size guard', () => {
  it('accepts resumes that fit within the configured size limit', () => {
    const resume = createBlankResume('resume-within-limit');
    resume.basics.summary = 'A concise summary.';

    expect(() => assertResumeWithinSizeLimit(resume)).not.toThrow();
  });

  it('rejects resumes that exceed the configured size limit before storage writes', () => {
    const resume = createBlankResume('resume-too-large');
    resume.basics.summary = 'A'.repeat(MAX_RESUME_SIZE);

    const size = measureResumeSize(resume);

    expect(size).toBeGreaterThan(MAX_RESUME_SIZE);

    try {
      assertResumeWithinSizeLimit(resume);
      throw new Error('Expected ResumeSizeError to be thrown.');
    } catch (error) {
      expect(error).toBeInstanceOf(ResumeSizeError);
      expect((error as ResumeSizeError).size).toBe(size);
      expect((error as ResumeSizeError).limit).toBe(MAX_RESUME_SIZE);
      expect((error as ResumeSizeError).message).toContain('Input exceeds maximum size');
    }
  });
});
