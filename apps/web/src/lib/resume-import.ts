import { normalizeResumeDocument, type ResumeDocument } from '@shieldcv/resume';

function parseEmail(text: string): string {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
}

function parsePhone(text: string): string {
  return text.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}/)?.[0] ?? '';
}

function parseUrl(text: string): string {
  return text.match(/https?:\/\/[^\s]+/i)?.[0] ?? '';
}

function splitSection(sectionText: string): string[] {
  return sectionText
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-•*]+/, '').trim())
    .filter(Boolean);
}

function sectionBetween(lines: string[], titles: string[]): string[] {
  const upperLines = lines.map((line) => line.toUpperCase());
  const startIndex = upperLines.findIndex((line) => titles.includes(line.trim()));

  if (startIndex === -1) {
    return [];
  }

  let endIndex = lines.length;

  for (let index = startIndex + 1; index < upperLines.length; index += 1) {
    if (
      ['SUMMARY', 'EXPERIENCE', 'WORK EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS', 'CERTIFICATIONS'].includes(
        upperLines[index].trim()
      )
    ) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex + 1, endIndex);
}

export function mergeImportedResume(
  currentResume: ResumeDocument,
  importedFields: Partial<ResumeDocument>
): ResumeDocument {
  return normalizeResumeDocument({
    ...currentResume,
    ...importedFields,
    basics: {
      ...currentResume.basics,
      ...(importedFields.basics ?? {}),
      location: {
        ...currentResume.basics.location,
        ...(importedFields.basics?.location ?? {}),
      },
      profiles: importedFields.basics?.profiles ?? currentResume.basics.profiles,
    },
    work: importedFields.work ?? currentResume.work,
    education: importedFields.education ?? currentResume.education,
    skills: importedFields.skills ?? currentResume.skills,
    projects: importedFields.projects ?? currentResume.projects,
    certifications: importedFields.certifications ?? currentResume.certifications,
    updatedAt: new Date().toISOString(),
  });
}

export function parsePdfTextToResume(text: string, currentResume: ResumeDocument): ResumeDocument {
  const normalizedText = text.replace(/\r/g, '');
  const lines = normalizedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const [firstLine = '', secondLine = ''] = lines;
  const summaryLines = sectionBetween(lines, ['SUMMARY', 'PROFILE']);
  const experienceLines = sectionBetween(lines, ['EXPERIENCE', 'WORK EXPERIENCE']);
  const educationLines = sectionBetween(lines, ['EDUCATION']);
  const skillLines = sectionBetween(lines, ['SKILLS']);
  const projectLines = sectionBetween(lines, ['PROJECTS']);
  const certificationLines = sectionBetween(lines, ['CERTIFICATIONS']);

  const imported: Partial<ResumeDocument> = {
    basics: {
      ...currentResume.basics,
      name: currentResume.basics.name || firstLine,
      label: currentResume.basics.label || secondLine,
      email: currentResume.basics.email || parseEmail(normalizedText),
      phone: currentResume.basics.phone || parsePhone(normalizedText),
      url: currentResume.basics.url || parseUrl(normalizedText),
      summary: summaryLines.length > 0 ? summaryLines.join(' ') : currentResume.basics.summary,
      location: currentResume.basics.location,
      profiles: currentResume.basics.profiles,
    },
  };

  if (experienceLines.length > 0) {
    imported.work = splitSection(experienceLines.join('\n')).map((line, index) => ({
      id: `${currentResume.id}-work-import-${index}`,
      name: line.includes('|') ? line.split('|')[0]?.trim() ?? line : line,
      position: line.includes('|') ? line.split('|')[1]?.trim() ?? '' : '',
      url: '',
      startDate: '',
      endDate: '',
      summary: '',
      highlights: [],
    }));
  }

  if (educationLines.length > 0) {
    imported.education = splitSection(educationLines.join('\n')).map((line, index) => ({
      id: `${currentResume.id}-education-import-${index}`,
      institution: line,
      url: '',
      area: '',
      studyType: '',
      startDate: '',
      endDate: '',
      score: '',
      courses: [],
    }));
  }

  if (skillLines.length > 0) {
    imported.skills = splitSection(skillLines.join('\n'))
      .flatMap((line) => line.split(/[,|]/))
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .map((name, index) => ({
        id: `${currentResume.id}-skill-import-${index}`,
        name,
        level: '',
        keywords: [],
      }));
  }

  if (projectLines.length > 0) {
    imported.projects = splitSection(projectLines.join('\n')).map((line, index) => ({
      id: `${currentResume.id}-project-import-${index}`,
      name: line,
      description: '',
      highlights: [],
      keywords: [],
      startDate: '',
      endDate: '',
      url: '',
      roles: [],
      entity: '',
      type: '',
    }));
  }

  if (certificationLines.length > 0) {
    imported.certifications = splitSection(certificationLines.join('\n')).map((line, index) => ({
      id: `${currentResume.id}-cert-import-${index}`,
      name: line,
      issuer: '',
      date: '',
      url: '',
    }));
  }

  return mergeImportedResume(currentResume, imported);
}
