export interface ApplicationRecord {
  id: string;
  platform: string;
  company: string;
  dateApplied: string;
  dsarSent: boolean;
  dsarSentDate?: string;
  dsarDeadline?: string;
  erasureRequested: boolean;
  erasureDate?: string;
  notes: string;
}

export type ApplicationStatus =
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export interface TrackerApplicationRecord extends ApplicationRecord {
  positionTitle: string;
  status: ApplicationStatus;
}

export interface GdprEducationContent {
  overview: string;
  rights: Array<{
    article: string;
    title: string;
    description: string;
    applicationToJobSeekers: string;
  }>;
  aiActInfo: {
    overview: string;
    effectiveDate: string;
    hiringClassification: string;
    rightToExplanation: string;
  };
  commonPlatforms: Array<{
    name: string;
    dsarUrl: string;
    privacyPolicyUrl: string;
    typicalResponseTime: string;
  }>;
}

function isoNow(): string {
  return new Date().toISOString();
}

export function calculateDeadline(sentDate: string): string {
  const deadline = new Date(sentDate);
  deadline.setUTCDate(deadline.getUTCDate() + 30);
  return deadline.toISOString();
}

export function createApplicationRecord(platform: string, company: string): ApplicationRecord {
  return {
    id: globalThis.crypto.randomUUID(),
    platform: platform.trim(),
    company: company.trim(),
    dateApplied: isoNow(),
    dsarSent: false,
    erasureRequested: false,
    notes: '',
  };
}

export function createTrackerApplicationRecord(
  platform: string,
  company: string,
  positionTitle: string,
): TrackerApplicationRecord {
  return {
    ...createApplicationRecord(platform, company),
    positionTitle: positionTitle.trim(),
    status: 'applied',
  };
}

function buildIdentityBlock(userName: string, userEmail: string): string {
  return `I am ${userName}, and I am submitting this request in my capacity as a data subject. My contact email is ${userEmail}.`;
}

function buildApplicationBlock(record: ApplicationRecord): string {
  return `This request relates to my job application and candidate data associated with ${record.company} on ${record.platform}, originally submitted on ${record.dateApplied}.`;
}

export function generateDsarEmail(
  record: ApplicationRecord,
  userName: string,
  userEmail: string,
): { subject: string; body: string } {
  return {
    subject: 'Data Subject Access Request pursuant to GDPR Article 15',
    body: `Dear Privacy Team,

${buildIdentityBlock(userName, userEmail)}

Pursuant to Article 15 of the General Data Protection Regulation (GDPR), I am requesting access to all personal data you process about me.

${buildApplicationBlock(record)}

Please provide:
- A copy of all personal data concerning me that you hold.
- The purposes for which my personal data is being processed.
- The categories of personal data concerned.
- The recipients or categories of recipients to whom my personal data has been disclosed or will be disclosed.
- The envisaged retention period for my personal data, or the criteria used to determine that period.
- The source of the personal data, if it was not collected directly from me.
- Information about any automated decision-making or profiling concerning me, including meaningful information about the logic involved and the significance and envisaged consequences of that processing.

If any of my personal data has been shared with processors, affiliates, recruiters, or prospective employers, please include that information in your response.

You are required to respond within 30 days of receipt of this request.

Please send your response electronically to ${userEmail}.

Sincerely,
${userName}`,
  };
}

export function generateErasureEmail(
  record: ApplicationRecord,
  userName: string,
  userEmail: string,
): { subject: string; body: string } {
  return {
    subject: 'Right to Erasure Request pursuant to GDPR Article 17',
    body: `Dear Privacy Team,

${buildIdentityBlock(userName, userEmail)}

Pursuant to Article 17 of the General Data Protection Regulation (GDPR), I am requesting the erasure of my personal data that you process in connection with my candidacy, job application, and any related talent records.

${buildApplicationBlock(record)}

Please delete the personal data you hold about me unless you have a specific legal obligation or overriding lawful basis requiring retention. If any data must be retained, please identify the precise categories retained, the legal basis for retention, and the expected retention period.

I also request that you inform any recipients, processors, or third parties with whom my personal data has been shared that I have exercised my right to erasure under Article 17 GDPR, to the extent required by applicable law.

Please confirm in writing once this request has been completed. If you decline any portion of this request, please explain the legal basis for that decision.

You are required to respond within 30 days of receipt of this request.

Please send your response electronically to ${userEmail}.

Sincerely,
${userName}`,
  };
}

export function getGdprEducation(): GdprEducationContent {
  return {
    overview:
      'GDPR gives people in the EU, EEA, and related jurisdictions meaningful control over how organizations collect, use, share, and retain their personal data. For job seekers, that matters because every application can create records across employer applicant tracking systems, job boards, assessment tools, recruiting agencies, and internal hiring workflows.\n\nIn practice, that means you can ask what data is being held about you, request corrections, object to certain processing, and in some situations request deletion. Even if the company you applied to is outside the EU, GDPR may still matter when the employer recruits in Europe, processes EU candidate data, or uses vendors with EU-facing obligations.\n\nA useful habit is to track where you applied, when you applied, and when you sent any privacy request. That gives you a paper trail for Article 15 access requests, Article 16 corrections, Article 17 erasure requests, and follow-up if a platform or employer misses the response window.',
    rights: [
      {
        article: 'Article 13',
        title: 'Information when data is collected',
        description: 'Organizations must explain what data they collect, why they collect it, and how long they keep it.',
        applicationToJobSeekers:
          'This is why candidate privacy notices on ATS portals matter before you submit an application.',
      },
      {
        article: 'Article 14',
        title: 'Information when data is obtained indirectly',
        description: 'If data comes from another source, the organization must still tell you what it collected and why.',
        applicationToJobSeekers:
          'Relevant when recruiters source you from LinkedIn, referrals, or talent databases rather than a direct application.',
      },
      {
        article: 'Article 15',
        title: 'Right of access',
        description: 'You can request a copy of your personal data and related processing information.',
        applicationToJobSeekers:
          'Useful after rejections or long hiring processes when you want to know what candidate records and notes exist.',
      },
      {
        article: 'Article 16',
        title: 'Right to rectification',
        description: 'You can ask for inaccurate or incomplete personal data to be corrected.',
        applicationToJobSeekers:
          'Helpful if a recruiter or platform has the wrong contact info, work history, or assessment metadata.',
      },
      {
        article: 'Article 17',
        title: 'Right to erasure',
        description: 'In certain situations, you can ask for your personal data to be deleted.',
        applicationToJobSeekers:
          'Useful when you want an old candidate profile, duplicate account, or stale application record removed.',
      },
      {
        article: 'Article 18',
        title: 'Right to restriction of processing',
        description: 'You can ask an organization to limit how it uses your data while a dispute is being resolved.',
        applicationToJobSeekers:
          'Helpful if you contest the accuracy of candidate records or object to how hiring data is being used.',
      },
      {
        article: 'Article 20',
        title: 'Right to data portability',
        description: 'You can request your data in a structured, machine-readable format in some circumstances.',
        applicationToJobSeekers:
          'This can help you retrieve profile or account data from a platform you no longer want to use.',
      },
      {
        article: 'Article 21',
        title: 'Right to object',
        description: 'You can object to certain processing, especially where it relies on legitimate interests.',
        applicationToJobSeekers:
          'Relevant for profiling, talent pooling, and re-contact for future roles after an application closes.',
      },
      {
        article: 'Article 22',
        title: 'Rights related to automated decision-making',
        description: 'You have protections when decisions with legal or similarly significant effects are made solely by automated means.',
        applicationToJobSeekers:
          'This is the key GDPR provision for screening tools, ranking systems, and AI-assisted hiring workflows.',
      },
    ],
    aiActInfo: {
      overview:
        'The EU AI Act adds a separate layer of accountability for AI systems used in employment, recruitment, and worker management. Hiring systems are treated as high-risk because they can affect access to jobs and careers.',
      effectiveDate: '2026-08-02',
      hiringClassification: 'AI systems used for recruitment, candidate evaluation, and hiring decisions are treated as high-risk systems.',
      rightToExplanation:
        'For job seekers, the practical takeaway is stronger transparency around AI-assisted screening and a growing expectation that employers explain when automated tools materially shape hiring outcomes.',
    },
    commonPlatforms: [
      {
        name: 'LinkedIn',
        dsarUrl: 'https://www.linkedin.com/help/linkedin/answer/a1339364',
        privacyPolicyUrl: 'https://www.linkedin.com/legal/privacy-policy',
        typicalResponseTime: 'Usually within 30 days after a formal request.',
      },
      {
        name: 'Indeed',
        dsarUrl: 'https://support.indeed.com/hc/en-us/articles/10652026126605-Requesting-or-Deleting-Your-Data',
        privacyPolicyUrl: 'https://www.indeed.com/legal',
        typicalResponseTime: 'About one month.',
      },
      {
        name: 'Glassdoor',
        dsarUrl: 'https://www.glassdoor.com/privacy/',
        privacyPolicyUrl: 'https://hrtechprivacy.com/brands/glassdoor#privacypolicy',
        typicalResponseTime: 'Usually within 30 days after a verified request.',
      },
      {
        name: 'Workday',
        dsarUrl: 'https://www.workday.com/en-us/privacy.html',
        privacyPolicyUrl: 'https://www.workday.com/en-us/privacy.html',
        typicalResponseTime: 'Within the time required by law; candidate data is often employer-controlled.',
      },
      {
        name: 'Greenhouse',
        dsarUrl: 'https://www.greenhouse.com/legal',
        privacyPolicyUrl: 'https://www.greenhouse.com/legal',
        typicalResponseTime: 'Often employer-controlled; many requests route through the hiring company.',
      },
      {
        name: 'Lever',
        dsarUrl: 'mailto:privacy@lever.co',
        privacyPolicyUrl: 'https://www.lever.co/privacy-notice/',
        typicalResponseTime: 'Within the time required by applicable law.',
      },
      {
        name: 'iCIMS',
        dsarUrl: 'https://www.icims.com/legal/privacy-notice-services/',
        privacyPolicyUrl: 'https://www.icims.com/legal/privacy-notice-services/',
        typicalResponseTime: 'Often employer-controlled; candidates usually contact the subscribing employer.',
      },
      {
        name: 'Handshake',
        dsarUrl: 'https://joinhandshake.com/privacy-policy/',
        privacyPolicyUrl: 'https://joinhandshake.com/privacy-policy/',
        typicalResponseTime: 'Within 30 days for EU data subject requests.',
      },
    ],
  };
}
