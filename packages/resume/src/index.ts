import { z } from 'zod';

export const resumeLocationSchema = z.object({
  city: z.string().trim().default(''),
  region: z.string().trim().default(''),
  countryCode: z.string().trim().default(''),
});

export const resumeProfileSchema = z.object({
  network: z.string().trim().default(''),
  username: z.string().trim().default(''),
  url: z.url().or(z.literal('')).default(''),
});

export const resumeBasicsSchema = z.object({
  name: z.string().trim().default(''),
  label: z.string().trim().default(''),
  email: z.email().or(z.literal('')).default(''),
  phone: z.string().trim().default(''),
  url: z.url().or(z.literal('')).default(''),
  summary: z.string().trim().default(''),
  location: resumeLocationSchema.default({ city: '', region: '', countryCode: '' }),
  profiles: z.array(resumeProfileSchema).default([]),
});

export const resumeWorkSchema = z.object({
  id: z.string().trim().default(''),
  name: z.string().trim().default(''),
  position: z.string().trim().default(''),
  url: z.url().or(z.literal('')).default(''),
  startDate: z.string().trim().default(''),
  endDate: z.string().trim().default(''),
  summary: z.string().trim().default(''),
  highlights: z.array(z.string().trim()).default([]),
});

export const resumeEducationSchema = z.object({
  id: z.string().trim().default(''),
  institution: z.string().trim().default(''),
  url: z.url().or(z.literal('')).default(''),
  area: z.string().trim().default(''),
  studyType: z.string().trim().default(''),
  startDate: z.string().trim().default(''),
  endDate: z.string().trim().default(''),
  score: z.string().trim().default(''),
  courses: z.array(z.string().trim()).default([]),
});

export const resumeSkillSchema = z.object({
  id: z.string().trim().default(''),
  name: z.string().trim().default(''),
  level: z.string().trim().default(''),
  keywords: z.array(z.string().trim()).default([]),
});

export const resumeProjectSchema = z.object({
  id: z.string().trim().default(''),
  name: z.string().trim().default(''),
  description: z.string().trim().default(''),
  highlights: z.array(z.string().trim()).default([]),
  keywords: z.array(z.string().trim()).default([]),
  startDate: z.string().trim().default(''),
  endDate: z.string().trim().default(''),
  url: z.url().or(z.literal('')).default(''),
  roles: z.array(z.string().trim()).default([]),
  entity: z.string().trim().default(''),
  type: z.string().trim().default(''),
});

export const resumeCertificationSchema = z.object({
  id: z.string().trim().default(''),
  name: z.string().trim().default(''),
  issuer: z.string().trim().default(''),
  date: z.string().trim().default(''),
  url: z.url().or(z.literal('')).default(''),
});

export const resumeDocumentSchema = z.object({
  id: z.string().trim(),
  basics: resumeBasicsSchema.default({
    name: '',
    label: '',
    email: '',
    phone: '',
    url: '',
    summary: '',
    location: { city: '', region: '', countryCode: '' },
    profiles: [],
  }),
  work: z.array(resumeWorkSchema).default([]),
  education: z.array(resumeEducationSchema).default([]),
  skills: z.array(resumeSkillSchema).default([]),
  projects: z.array(resumeProjectSchema).default([]),
  certifications: z.array(resumeCertificationSchema).default([]),
  updatedAt: z.string().trim(),
});

export const ResumeSchema = resumeDocumentSchema;

export type ResumeLocation = z.infer<typeof resumeLocationSchema>;
export type ResumeProfile = z.infer<typeof resumeProfileSchema>;
export type ResumeBasics = z.infer<typeof resumeBasicsSchema>;
export type ResumeWork = z.infer<typeof resumeWorkSchema>;
export type ResumeEducation = z.infer<typeof resumeEducationSchema>;
export type ResumeSkill = z.infer<typeof resumeSkillSchema>;
export type ResumeProject = z.infer<typeof resumeProjectSchema>;
export type ResumeCertification = z.infer<typeof resumeCertificationSchema>;
export type ResumeDocument = z.infer<typeof resumeDocumentSchema>;

export function createBlankResume(id: string = globalThis.crypto.randomUUID()): ResumeDocument {
  return resumeDocumentSchema.parse({
    id,
    updatedAt: new Date().toISOString(),
  });
}

export function normalizeResumeDocument(input: unknown): ResumeDocument {
  return resumeDocumentSchema.parse(input);
}
