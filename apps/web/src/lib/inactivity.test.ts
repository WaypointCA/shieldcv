import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInactivityTimer } from './inactivity';

describe('createInactivityTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('fires after the configured timeout', async () => {
    const onTimeout = vi.fn();
    const timer = createInactivityTimer({
      target: document,
      timeoutMs: 1_000,
      onTimeout,
    });

    timer.start();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(timer.isRunning()).toBe(false);
  });

  it('resets when activity occurs', async () => {
    const onTimeout = vi.fn();
    const timer = createInactivityTimer({
      target: document,
      timeoutMs: 1_000,
      onTimeout,
    });

    timer.start();
    await vi.advanceTimersByTimeAsync(800);
    document.dispatchEvent(new Event('mousemove'));
    await vi.advanceTimersByTimeAsync(800);

    expect(onTimeout).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('stops cleanly', async () => {
    const onTimeout = vi.fn();
    const timer = createInactivityTimer({
      target: document,
      timeoutMs: 1_000,
      onTimeout,
    });

    timer.start();
    timer.stop();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onTimeout).not.toHaveBeenCalled();
    expect(timer.isRunning()).toBe(false);
  });
});
