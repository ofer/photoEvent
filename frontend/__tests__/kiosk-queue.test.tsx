import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import KioskPage from '../app/kiosk/page';

interface Photo {
  id: string;
  name: string;
  timestamp: string;
  url: string;
  thumb: string;
}

const makePhoto = (id: string): Photo => ({
  id: `${id}.jpg`,
  name: `${id}.jpg`,
  timestamp: new Date().toISOString(),
  url: `/api/photos/${id}.jpg`,
  thumb: `/api/photos/thumb_${id}.jpg`,
});

// ============================================================
// EventSource mock
// ============================================================

let _sseOnMessage: ((event: MessageEvent) => void) | null = null;

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    let _msg: ((event: MessageEvent) => void) | null = null;
    let _open: (() => void) | null = null;

    Object.defineProperty(this, 'onmessage', {
      configurable: true, enumerable: true,
      set(h) { _msg = h; _sseOnMessage = h; },
      get() { return _msg; },
    });

    Object.defineProperty(this, 'onopen', {
      configurable: true, enumerable: true,
      set(h) { _open = h; },
      get() { return _open; },
    });

    Object.defineProperty(this, 'onerror', {
      configurable: true, enumerable: true,
      set() {},
      get() { return this.onerror; },
    });

    setTimeout(() => _open?.(), 0);
  }

  close() {}
}

function simulateSSE(photo: object) {
  const event = new MessageEvent('message', { data: JSON.stringify(photo) });
  _sseOnMessage?.(event);
}

// Advance timers in two batches to avoid fake timer limits,
// then flush all React state updates
async function flushFakeTimers() {
  // Phase 1: countdown (30s) + print delay (300ms)
  vi.advanceTimersByTime(30300);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  // Phase 2: cleanup (500ms)
  vi.advanceTimersByTime(500);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

// ============================================================
// Tests
// ============================================================

describe('KioskPage - queue behavior', () => {
  beforeEach(() => {
    vi.stubGlobal('print', vi.fn());
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            print: { paperSize: 'A4', orientation: 'landscape', margin: '10mm' },
          }),
      }),
    );
    _sseOnMessage = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders waiting state when no photos in queue', () => {
    render(<KioskPage />);
    expect(screen.getByText(/Waiting for photos/i)).toBeInTheDocument();
  });

  it('displays first photo when SSE message arrives', async () => {
    render(<KioskPage />);

    const photo = makePhoto('A');
    await act(async () => {
      simulateSSE(photo);
      await Promise.resolve();
    });

    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      `/api/frame/${photo.id}`,
    );
    expect(screen.getByText(/auto-printing/i)).toBeInTheDocument();
    expect(screen.getByText(/\b30\b/)).toBeInTheDocument();
  });

  it('enqueues second photo without interrupting first', async () => {
    vi.useFakeTimers();
    render(<KioskPage />);

    const photoA = makePhoto('A');
    const photoB = makePhoto('B');

    await act(async () => {
      simulateSSE(photoA);
      await Promise.resolve();
    });

    // Advance 10 s into the countdown
    vi.advanceTimersByTime(10000);

    // Send second photo — should be queued, not interrupting
    await act(async () => {
      simulateSSE(photoB);
      await Promise.resolve();
    });

    // Photo A should still be displayed
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      `/api/frame/${photoA.id}`,
    );

    // Queue counter shows 2 photos in queue
    expect(screen.getByText(/photos in queue/i)).toHaveTextContent('2');

    // Countdown should be ~20 (not reset to 30)
    const countdownValues = screen.getAllByText(/\b\d+\b/);
    expect(parseInt(countdownValues[0].textContent || '30', 10)).toBe(20);

    vi.useRealTimers();
  });

  it('advances to next photo after countdown reaches 0', async () => {
    vi.useFakeTimers();
    render(<KioskPage />);

    const photoA = makePhoto('A');
    const photoB = makePhoto('B');

    await act(async () => {
      simulateSSE(photoA);
      await Promise.resolve();
    });
    await act(async () => {
      simulateSSE(photoB);
      await Promise.resolve();
    });

    // Advance in batches to avoid fake timer limits
    await flushFakeTimers();

    // Should now show photo B
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      `/api/frame/${photoB.id}`,
    );

    // Countdown restarted at 30 for B
    expect(screen.getByText(/\b30\b/)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('goes idle after last photo in queue prints', async () => {
    vi.useFakeTimers();
    render(<KioskPage />);

    const photo = makePhoto('A');

    await act(async () => {
      simulateSSE(photo);
      await Promise.resolve();
    });

    await flushFakeTimers();

    // Should be back to waiting state
    expect(screen.getByText(/Waiting for photos/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('discard button advances to next queued photo', async () => {
    render(<KioskPage />);

    const photoA = makePhoto('A');
    const photoB = makePhoto('B');

    await act(async () => {
      simulateSSE(photoA);
      await Promise.resolve();
    });
    await act(async () => {
      simulateSSE(photoB);
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText('Discard'));

    // Should show photo B
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      `/api/frame/${photoB.id}`,
    );

    // Countdown restarted at 30
    expect(screen.getByText(/\b30\b/)).toBeInTheDocument();
  });

  it('discard button goes idle when queue has only one photo', async () => {
    render(<KioskPage />);

    const photo = makePhoto('A');

    await act(async () => {
      simulateSSE(photo);
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText('Discard'));

    // Should be back to waiting state
    expect(screen.getByText(/Waiting for photos/i)).toBeInTheDocument();
  });

  it('handles rapid successive photos without losing any', async () => {
    vi.useFakeTimers();
    render(<KioskPage />);

    const photoA = makePhoto('A');
    const photoB = makePhoto('B');
    const photoC = makePhoto('C');

    await act(async () => {
      simulateSSE(photoA);
      await Promise.resolve();
    });
    await act(async () => {
      simulateSSE(photoB);
      await Promise.resolve();
    });
    await act(async () => {
      simulateSSE(photoC);
      await Promise.resolve();
    });

    // Verify photo A is displayed first
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      `/api/frame/${photoA.id}`,
    );

    // Print A → show B
    await flushFakeTimers();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      `/api/frame/${photoB.id}`,
    );

    // Print B → show C
    await flushFakeTimers();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      `/api/frame/${photoC.id}`,
    );

    // Print C → idle
    await flushFakeTimers();
    expect(screen.getByText(/Waiting for photos/i)).toBeInTheDocument();

    vi.useRealTimers();
  });
});
