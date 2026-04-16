import type { ResumeDocument } from '@shieldcv/resume';

export interface CmmcFinding {
  text: string;
  field: string;
  start: number;
  end: number;
  category: CmmcCategory;
  severity: 'high' | 'medium' | 'low';
  explanation: string;
  guidance: string;
}

export type CmmcCategory =
  | 'cui_marking'
  | 'itar_ear'
  | 'program_name'
  | 'technical_data'
  | 'clearance_level'
  | 'facility_detail';

export interface CmmcEducationContent {
  overview: string;
  nistControls: Array<{
    id: string;
    family: string;
    title: string;
    relevance: string;
  }>;
  cuiCategories: Array<{
    name: string;
    description: string;
    resumeRisk: string;
  }>;
  safeDescriptionPatterns: string[];
}

type FieldText = {
  field: string;
  text: string;
};

type Rule = {
  category: CmmcCategory;
  severity: CmmcFinding['severity'];
  regex: RegExp;
  explanation: string;
  guidance: string;
};

const PROGRAM_GUIDANCE =
  'Swap the named system for a broader description such as "supported a major DoD air and missile defense program" unless your employer has confirmed the name is approved for public release.';
const FACILITY_GUIDANCE =
  'Remove the specific facility, building, or unit reference and use a generalized description like "supported operations in a secure government environment."';

const RULES: Rule[] = [
  {
    category: 'cui_marking',
    severity: 'high',
    regex:
      /\b(?:CUI|FOUO|For Official Use Only|Controlled Unclassified(?: Information)?|NOFORN|REL TO\b[^,.;\n]*)\b/gi,
    explanation:
      'This looks like an explicit marking used to label controlled or dissemination-limited government information.',
    guidance:
      'Do not copy government handling markings into a resume. Replace them with a plain-language summary of the work, without reproducing the marked text.',
  },
  {
    category: 'itar_ear',
    severity: 'high',
    regex:
      /\b(?:ITAR|EAR|export[- ]controlled|USML|CCL|Technical Assistance Agreement|TAA)\b/gi,
    explanation:
      'This language suggests export-controlled work, technical data, or licensing restrictions that should be reviewed carefully before public disclosure.',
    guidance:
      'Describe the domain at a higher level, such as "supported export-controlled aerospace work," and avoid including regulated technical details or agreement names.',
  },
  {
    category: 'program_name',
    severity: 'medium',
    regex:
      /\b(?:JPATS|JSTARS|AEGIS|Patriot|THAAD|F-35|F-22|B-21|B-2|B-52|KC-46|Sentinel|Minuteman(?:\s+III)?|Abrams|Stryker|Apache|Black Hawk|MQ-9(?:\s+Reaper)?|Global Hawk|P-8\s+Poseidon)\b/gi,
    explanation:
      'Naming a recognizable defense platform or mission program can reveal more about the underlying work than you intend.',
    guidance: PROGRAM_GUIDANCE,
  },
  {
    category: 'technical_data',
    severity: 'high',
    regex:
      /\b(?:classified|secret|top secret|TS\/SCI|SAP|SCI|NATO SECRET)\b/gi,
    explanation:
      'This wording points to classified status, compartmented access, or protected technical data that should not be described casually in resume bullets.',
    guidance:
      'Remove classification labels from accomplishment bullets and focus on cleared-team impact, system engineering scope, or mission outcomes at an unclassified level.',
  },
  {
    category: 'clearance_level',
    severity: 'low',
    regex:
      /\b(?:Secret clearance|Top Secret clearance|TS\/SCI clearance|active Secret|active Top Secret|held a Secret clearance|held a Top Secret clearance)\b/gi,
    explanation:
      'Security clearances are often acceptable to mention, but the wording should stay accurate, current, and separate from sensitive program details.',
    guidance:
      'If the clearance is current and approved to disclose, keep it factual and concise, for example "Active Secret clearance." Avoid pairing it with mission-sensitive specifics.',
  },
  {
    category: 'facility_detail',
    severity: 'medium',
    regex:
      /\b(?:SCIF(?:\s+[A-Z0-9-]+)?|Sensitive Compartmented Information Facility|Building\s+\d{1,4}[A-Z]?|Bldg\.?\s+\d{1,4}[A-Z]?|Room\s+\d{2,4}[A-Z]?|Unit\s+\d{1,4}[A-Z]?|Detachment\s+\d{1,4}|Squadron\s+\d{1,4}|Battalion\s+\d{1,4}|Company\s+[A-Z])\b/gi,
    explanation:
      'This kind of location or unit detail can make a secure facility, organization, or mission environment easier to identify.',
    guidance: FACILITY_GUIDANCE,
  },
];

type Resume = ResumeDocument;

function collectNarrativeFields(resume: Resume): FieldText[] {
  const fields: FieldText[] = [];

  if (resume.basics.summary.trim()) {
    fields.push({ field: 'basics.summary', text: resume.basics.summary });
  }

  resume.work.forEach((workItem, index) => {
    if (workItem.summary.trim()) {
      fields.push({ field: `work[${index}].summary`, text: workItem.summary });
    }

    workItem.highlights.forEach((highlight, highlightIndex) => {
      if (highlight.trim()) {
        fields.push({ field: `work[${index}].highlights[${highlightIndex}]`, text: highlight });
      }
    });
  });

  resume.education.forEach((educationItem, index) => {
    if (educationItem.area.trim()) {
      fields.push({ field: `education[${index}].area`, text: educationItem.area });
    }

    educationItem.courses.forEach((course, courseIndex) => {
      if (course.trim()) {
        fields.push({ field: `education[${index}].courses[${courseIndex}]`, text: course });
      }
    });
  });

  resume.projects.forEach((project, index) => {
    if (project.description.trim()) {
      fields.push({ field: `projects[${index}].description`, text: project.description });
    }

    project.highlights.forEach((highlight, highlightIndex) => {
      if (highlight.trim()) {
        fields.push({ field: `projects[${index}].highlights[${highlightIndex}]`, text: highlight });
      }
    });
  });

  resume.certifications.forEach((certification, index) => {
    if (certification.name.trim()) {
      fields.push({ field: `certifications[${index}].name`, text: certification.name });
    }

    if (certification.issuer.trim()) {
      fields.push({ field: `certifications[${index}].issuer`, text: certification.issuer });
    }
  });

  return fields;
}

export async function scanForCui(resume: Resume): Promise<CmmcFinding[]> {
  const findings: CmmcFinding[] = [];

  for (const { field, text } of collectNarrativeFields(resume)) {
    for (const rule of RULES) {
      const matches = text.matchAll(rule.regex);

      for (const match of matches) {
        const value = match[0];
        const start = match.index as number;

        findings.push({
          text: value,
          field,
          start,
          end: start + value.length,
          category: rule.category,
          severity: rule.severity,
          explanation: rule.explanation,
          guidance: rule.guidance,
        });
      }
    }
  }

  return findings.sort((left, right) => {
    if (left.field !== right.field) {
      return left.field.localeCompare(right.field);
    }

    return left.start - right.start;
  });
}

export function getCmmcEducation(): CmmcEducationContent {
  return {
    overview:
      'CMMC 2.0 is the Department of Defense cybersecurity framework used across the defense industrial base to protect Federal Contract Information and Controlled Unclassified Information (CUI). For students and early-career applicants, the practical takeaway is simple: your resume should show impact without repeating markings, program identifiers, facility specifics, export-control references, or technical details that your employer expected you to keep tightly controlled.\n\nPhase 1 of CMMC 2.0 became active in November 2025, which means more organizations are formally checking how they handle sensitive defense information. Even when a detail feels harmless in a resume bullet, it may still be restricted because it reveals a protected program, a secure location, or the nature of controlled technical work.\n\nA safe defense-sector resume focuses on public, unclassified outcomes: engineering methods, collaboration, schedule ownership, testing discipline, reliability improvements, and mission support at a broad level. When in doubt, keep the accomplishment and remove the identifying detail.',
    nistControls: [
      {
        id: 'AC-3',
        family: 'Access Control',
        title: 'Enforce authorized access',
        relevance:
          'Resume bullets should not disclose information that was only accessible because you worked in a controlled environment or on a need-to-know basis.',
      },
      {
        id: 'AT-2',
        family: 'Awareness and Training',
        title: 'Security awareness training',
        relevance:
          'Students entering defense roles are expected to recognize that secure handling rules apply outside the workplace too, including on resumes and portfolios.',
      },
      {
        id: 'MP-5',
        family: 'Media Protection',
        title: 'Protect media transport',
        relevance:
          'A resume is still a medium for information transfer, so copying marked text or export-controlled details into it can create avoidable exposure.',
      },
      {
        id: 'SC-7',
        family: 'System and Communications Protection',
        title: 'Boundary protection',
        relevance:
          'Sharing sensitive system names or architecture hints in public documents can weaken the separation between controlled work and public-facing channels.',
      },
      {
        id: 'SI-4',
        family: 'System and Information Integrity',
        title: 'Monitor and protect information integrity',
        relevance:
          'Accurate, minimal, and approved language reduces the risk of leaking stale, misleading, or restricted details about defense work.',
      },
      {
        id: 'CM-8',
        family: 'Configuration Management',
        title: 'Track system components',
        relevance:
          'Specific hardware, platform, or subsystem references can identify protected environments, so broad descriptions are often safer on a resume.',
      },
      {
        id: 'PS-3',
        family: 'Personnel Security',
        title: 'Screen individuals before access',
        relevance:
          'Clearance language on a resume should be truthful and limited to what you are authorized to disclose.',
      },
    ],
    cuiCategories: [
      {
        name: 'Program and platform identifiers',
        description: 'Named weapons systems, sensors, mission sets, or internal program labels.',
        resumeRisk: 'They can reveal who you supported and narrow the scope of your work more than intended.',
      },
      {
        name: 'Export-controlled technical data',
        description: 'ITAR, EAR, USML, CCL, or agreement-specific references tied to regulated technology.',
        resumeRisk: 'These terms signal that the underlying work may include controlled technical details.',
      },
      {
        name: 'Handling markings',
        description: 'Labels such as CUI, FOUO, NOFORN, or REL TO.',
        resumeRisk: 'Repeating a marking can reproduce restricted dissemination language in a public document.',
      },
      {
        name: 'Classified environment references',
        description: 'SCIF mentions, compartment language, building details, and secure worksite identifiers.',
        resumeRisk: 'Location and facility clues can expose a protected environment or operational context.',
      },
      {
        name: 'Clearance and access descriptors',
        description: 'Secret, Top Secret, SCI, SAP, or TS/SCI terminology.',
        resumeRisk: 'Some references are acceptable, but over-sharing can imply sensitive mission context.',
      },
    ],
    safeDescriptionPatterns: [
      'Supported a major DoD aerospace program with test, integration, and documentation support.',
      'Contributed to secure systems engineering work in a regulated defense environment.',
      'Collaborated with cross-functional teams on mission-critical software and reliability improvements.',
      'Worked in accordance with export-control and information-handling requirements.',
      'Delivered analysis and reporting for a government customer in a secure operational setting.',
      'Participated in verification, validation, and configuration management for a defense platform.',
    ],
  };
}
