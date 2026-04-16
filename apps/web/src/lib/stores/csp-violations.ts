import { writable } from 'svelte/store';

export type CspViolationRecord = {
  blockedURI: string;
  columnNumber: number;
  violatedDirective: string;
  effectiveDirective: string;
  lineNumber: number;
  originalPolicy: string;
  sourceFile: string;
  statusCode: number;
  timestamp: string;
};

function createCspViolationStore() {
  const { subscribe, set, update } = writable<CspViolationRecord[]>([]);

  return {
    subscribe,
    clear() {
      set([]);
    },
    report(event: SecurityPolicyViolationEvent) {
      update((violations) => [
        ...violations,
        {
          blockedURI: event.blockedURI,
          columnNumber: event.columnNumber,
          violatedDirective: event.violatedDirective,
          effectiveDirective: event.effectiveDirective,
          lineNumber: event.lineNumber,
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
