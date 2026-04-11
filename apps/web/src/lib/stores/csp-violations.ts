import { writable } from 'svelte/store';

export type CspViolationRecord = {
  blockedURI: string;
  violatedDirective: string;
  effectiveDirective: string;
  originalPolicy: string;
  sourceFile: string;
  statusCode: number;
  timestamp: string;
};

function createCspViolationStore() {
  const { subscribe, update } = writable<CspViolationRecord[]>([]);

  return {
    subscribe,
    report(event: SecurityPolicyViolationEvent) {
      update((violations) => [
        ...violations,
        {
          blockedURI: event.blockedURI,
          violatedDirective: event.violatedDirective,
          effectiveDirective: event.effectiveDirective,
          originalPolicy: event.originalPolicy,
          sourceFile: event.sourceFile,
          statusCode: event.statusCode,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
  };
}

export const cspViolations = createCspViolationStore();
