(() => {
  if (!window.trustedTypes?.createPolicy) {
    return;
  }

  const rejectAssignment = (kind) => {
    throw new TypeError(`ShieldCV blocked unsafe Trusted Types ${kind} assignment.`);
  };

  try {
    window.trustedTypes.createPolicy('default', {
      createHTML: () => rejectAssignment('HTML'),
      createScript: () => rejectAssignment('script'),
      createScriptURL: () => rejectAssignment('script URL'),
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
