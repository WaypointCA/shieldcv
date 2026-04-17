import type { Entity } from '@shieldcv/ai';
import type { ResumeDocument } from '@shieldcv/resume';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'their',
  'them',
  'this',
  'to',
  'with',
  'will',
  'you',
  'your',
  'we',
  'job',
  'role',
  'team',
  'candidate',
  'candidates',
  'experience',
  'preferred',
  'strongly',
  'wanted',
  'should',
  'must',
]);

export type AtsAnalysis = {
  score: number;
  foundKeywords: string[];
  missingKeywords: string[];
  suggestions: Array<{ keyword: string; suggestion: string }>;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTerm(value: string): string {
  return normalizeWhitespace(value.toLowerCase().replace(/[^a-z0-9+#./ -]+/g, ' ')).replace(
    /^[^a-z0-9+]+|[^a-z0-9+]+$/g,
    '',
  );
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeTerm(value);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalizeWhitespace(value));
  }

  return result;
}

export function resumeToPlainText(resume: ResumeDocument): string {
  return [
    resume.basics.name,
    resume.basics.label,
    resume.basics.summary,
    resume.basics.email,
    resume.work.flatMap((item) => [item.name, item.position, item.summary, ...item.highlights]).join(' '),
    resume.education.flatMap((item) => [item.institution, item.area, item.studyType, ...item.courses]).join(' '),
    resume.skills.flatMap((item) => [item.name, item.level, ...item.keywords]).join(' '),
    resume.projects.flatMap((item) => [item.name, item.description, item.entity, item.type, ...item.roles, ...item.highlights, ...item.keywords]).join(' '),
    resume.certifications.flatMap((item) => [item.name, item.issuer]).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
}

export function extractSimpleKeywords(jobDescription: string): string[] {
  const tokens = jobDescription
    .split(/\s+/)
    .map((token) => normalizeTerm(token))
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token) && /[a-z]/.test(token));

  return dedupe(tokens);
}

export function extractEntityKeywords(entities: Entity[]): string[] {
  return dedupe(
    entities
      .map((entity) => entity.text)
      .map((text) => normalizeWhitespace(text))
      .filter((text) => normalizeTerm(text).length >= 3),
  );
}

export function keywordAppearsInText(keyword: string, text: string): boolean {
  const normalizedKeyword = normalizeTerm(keyword);
  const normalizedText = normalizeTerm(text);

  if (!normalizedKeyword || !normalizedText) {
    return false;
  }

  if (normalizedKeyword.includes(' ')) {
    return normalizedText.includes(normalizedKeyword);
  }

  return new RegExp(`(^|\\W)${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`, 'i').test(
    normalizedText,
  );
}

export function suggestResumePlacement(resume: ResumeDocument, keyword: string): string {
  const workItem = resume.work.find((item) => item.name.trim()) ?? resume.work[0];

  if (workItem) {
    return `Consider adding "${keyword}" to your work experience at ${workItem.name || 'your most relevant role'}.`;
  }

  const project = resume.projects.find((item) => item.name.trim()) ?? resume.projects[0];

  if (project) {
    return `Consider adding "${keyword}" to your project section for ${project.name || 'a relevant project'}.`;
  }

  if (resume.basics.summary.trim()) {
    return `Consider adding "${keyword}" to your professional summary.`;
  }

  return `Consider adding "${keyword}" to a resume bullet that reflects real experience with it.`;
}

export function buildAtsAnalysis(
  resume: ResumeDocument,
  jobDescription: string,
  entityKeywords: string[],
  similarity: number,
): AtsAnalysis {
  const resumeText = resumeToPlainText(resume);
  const keywords = dedupe([...entityKeywords, ...extractSimpleKeywords(jobDescription)]);
  const foundKeywords = keywords.filter((keyword) => keywordAppearsInText(keyword, resumeText));
  const missingKeywords = keywords.filter((keyword) => !keywordAppearsInText(keyword, resumeText));
  const score = Math.max(0, Math.min(100, Math.round(similarity * 100)));

  return {
    score,
    foundKeywords,
    missingKeywords,
    suggestions: missingKeywords.map((keyword) => ({
      keyword,
      suggestion: suggestResumePlacement(resume, keyword),
    })),
  };
}
