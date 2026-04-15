(() => {
  if (!window.trustedTypes?.createPolicy) {
    return;
  }

  const rejectAssignment = (kind) => {
    throw new TypeError(`ShieldCV blocked unsafe Trusted Types ${kind} assignment.`);
  };

  const createScriptURL = (input) => {
    const url = new URL(input, window.location.href);
    const isAiWorker =
      url.origin === window.location.origin &&
      (url.pathname.startsWith('/_app/immutable/workers/') ||
        (url.pathname.startsWith('/@fs/') && url.pathname.endsWith('/packages/ai/src/worker.ts')));

    if (isAiWorker) {
      return url.href;
    }

    return rejectAssignment('script URL');
  };

  try {
    window.trustedTypes.createPolicy('default', {
      createHTML: () => rejectAssignment('HTML'),
      createScript: () => rejectAssignment('script'),
      createScriptURL,
    });
  } catch {
    // The policy may already exist after a reload or prerendered transition.
  }

  try {
    window.trustedTypes.createPolicy('dompurify', {
      createHTML: (input) => {
        if (!window.DOMPurify?.sanitize) {
          throw new TypeError('DOMPurify is unavailable for Trusted Types sanitization.');
        }

        return window.DOMPurify.sanitize(input, { RETURN_TRUSTED_TYPE: false });
      },
    });
  } catch {
    // Ignore duplicate policy creation and keep the first registered policy.
  }
})();
