import type { ResumeDocument } from '@shieldcv/resume';

// This fixture contains INTENTIONAL PHI violations for demonstration and testing purposes.
export const problematicResume: ResumeDocument = {
  id: 'demo-problematic-resume',
  updatedAt: '2026-04-16T00:00:00.000Z',
  basics: {
    name: 'Avery Student',
    label: 'Senior Nursing Student',
    email: 'avery.student@example.com',
    phone: '(212) 555-0100',
    url: '',
    summary:
      'Completed a clinical rotation that included bedside education for Jane Doe at 412 Oak Street, Springfield, IL 62704 while coordinating discharge teaching for adult cardiac patients.',
    location: {
      city: 'New York',
      region: 'NY',
      countryCode: 'US',
    },
    profiles: [],
  },
  work: [
    {
      id: 'work-clinical-1',
      name: 'Fictional Clinical Rotation',
      position: 'Student Nurse',
      url: '',
      startDate: '2025-01',
      endDate: '2025-05',
      summary:
        'Documented postoperative care for Jane Doe at St. Mercy Hospital telemetry unit bed 12B during a medical-surgical practicum.',
      highlights: [
        'Reviewed DOB 03/14/1980 and discharge instructions with the care team before bedside teaching.',
        'Reference available from clinical preceptor at (415) 555-0188 for the patient follow-up workflow.',
      ],
    },
  ],
  education: [
    {
      id: 'education-1',
      institution: 'ShieldCV College of Nursing',
      url: '',
      area: 'Adult-Gerontology Nursing',
      studyType: 'BSN',
      startDate: '2022-08',
      endDate: '2026-05',
      score: '',
      courses: ['Clinical documentation and de-identification practice'],
    },
  ],
  skills: [],
  projects: [
    {
      id: 'project-1',
      name: 'Clinical Documentation Review',
      description:
        'Audited a fictional chart note containing MRN: 00A123456 and patient portal link https://example.org/case-files/00A123456 for a classroom quality-improvement exercise.',
      highlights: [
        'Clinical note reference shared by the instructor: jane.doe@clinical-notes.example',
        'Mapped workflow issues tied to the Springfield, IL 62704 discharge follow-up packet.',
      ],
      keywords: ['hipaa', 'de-identification'],
      startDate: '2025-03',
      endDate: '2025-04',
      url: '',
      roles: ['Student researcher'],
      entity: 'ShieldCV College of Nursing',
      type: 'Academic project',
    },
  ],
  certifications: [],
};
