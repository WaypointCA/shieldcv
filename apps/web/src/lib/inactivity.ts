export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

type InactivityOptions = {
  target: Document;
  timeoutMs?: number;
  onTimeout: () => void | Promise<void>;
};

type InactivityController = {
  start: () => void;
  stop: () => void;
  reset: () => void;
  isRunning: () => boolean;
};

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'scroll'] as const;

export function createInactivityTimer({
  target,
  timeoutMs = INACTIVITY_TIMEOUT_MS,
  onTimeout,
}: InactivityOptions): InactivityController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(): void {
    clearTimer();
    timer = setTimeout(() => {
      running = false;
      clearTimer();
      removeListeners();
      void onTimeout();
    }, timeoutMs);
  }

  function handleActivity(): void {
    if (!running) {
      return;
    }

    schedule();
  }

  function addListeners(): void {
    for (const eventName of ACTIVITY_EVENTS) {
      target.addEventListener(eventName, handleActivity, { passive: true, capture: true });
    }
  }

  function removeListeners(): void {
    for (const eventName of ACTIVITY_EVENTS) {
      target.removeEventListener(eventName, handleActivity, true);
    }
  }

  return {
    start(): void {
      if (running) {
        schedule();
        return;
      }

      running = true;
      addListeners();
      schedule();
    },
    stop(): void {
      running = false;
      clearTimer();
      removeListeners();
    },
    reset(): void {
      if (running) {
        schedule();
      }
    },
    isRunning(): boolean {
      return running;
    },
  };
}
