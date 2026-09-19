import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import KioskPage from '../app/kiosk/page';

interface Photo {
  id: string;
  name: string;
  timestamp: string;
  url: string;
  thumb: string;
  aiButton?: string | null;
}

const makePhoto = (id: string, aiButton?: string | null): Photo => ({
  id: `${id}.jpg`,
  name: `${id}.jpg`,
  timestamp: new Date().toISOString(),
  url: `/api/photos/${id}.jpg`,
  thumb: `/api/photos/thumb_${id}.jpg`,
  aiButton,
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

// Advance timers in batches to avoid fake timer limits, then flush React state updates
async function flushFakeTimers() {
  vi.advanceTimersByTime(30300);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  vi.advanceTimersByTime(500);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

// Wait for config to load (config fetch happens on mount)
async function waitForConfig() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// Flush after SSE message to ensure state updates and effects complete
async function flushAfterSSE() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ============================================================
// Tests
// ============================================================

describe('KioskPage - auto-apply phone choice (Phase 5)', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('print', vi.fn());
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('fetch', mockFetch);
    _sseOnMessage = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-applies phone choice when a new photo with aiButton becomes current', async () => {
    const generateCalls: { photoId: string; buttonId: string }[] = [];
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/config') {
        return Promise.resolve({
          json: () => Promise.resolve({
            print: { paperSize: 'A4' },
            ai: {
              buttons: [
                { id: 'cartoon', label: 'Cartoon', workflowJson: '{"1":{}}' },
              ],
            },
          }),
        });
      }
      if (url === '/api/ai/generate') {
        const body = JSON.parse(options.body);
        generateCalls.push({ photoId: body.photoId, buttonId: body.buttonId });
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            imageUrl: 'data:image/png;base64,auto-applied',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);
    await waitForConfig();

    // Simulate SSE with aiButton set
    const photo = makePhoto('choice-1', 'cartoon');
    await act(async () => {
      simulateSSE(photo);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAfterSSE();

    // Should have auto-called handleGenerate
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0]).toEqual({ photoId: 'choice-1.jpg', buttonId: 'cartoon' });

    // Generated image should be displayed
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'data:image/png;base64,auto-applied',
    );
  });

  it('calls handleGenerate exactly once per photo (no repeat)', async () => {
    const generateCalls: string[] = [];
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/config') {
        return Promise.resolve({
          json: () => Promise.resolve({
            print: { paperSize: 'A4' },
            ai: {
              buttons: [
                { id: 'cartoon', label: 'Cartoon', workflowJson: '{"1":{}}' },
              ],
            },
          }),
        });
      }
      if (url === '/api/ai/generate') {
        const body = JSON.parse(options.body);
        generateCalls.push(body.photoId);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            imageUrl: 'data:image/png;base64,x',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);
    await waitForConfig();

    // First photo with aiButton
    await act(async () => {
      simulateSSE(makePhoto('once-1', 'cartoon'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAfterSSE();
    expect(generateCalls).toEqual(['once-1.jpg']);

    // Send second photo, advance first
    await act(async () => {
      simulateSSE(makePhoto('once-2'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAfterSSE();

    // Send third photo
    await act(async () => {
      simulateSSE(makePhoto('once-3', 'cartoon'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAfterSSE();

    // Only new photo should trigger generate, once-1 should not re-trigger
    expect(generateCalls.filter(c => c === 'once-1.jpg')).toHaveLength(1);
  });

  it('does NOT auto-apply when aiButton is null (direct API upload)', async () => {
    const generateCalls: string[] = [];
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/config') {
        return Promise.resolve({
          json: () => Promise.resolve({
            print: { paperSize: 'A4' },
            ai: {
              buttons: [
                { id: 'cartoon', label: 'Cartoon', workflowJson: '{"1":{}}' },
              ],
            },
          }),
        });
      }
      if (url === '/api/ai/generate') {
        const body = JSON.parse(options.body);
        generateCalls.push(body.photoId);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            imageUrl: 'data:image/png;base64,x',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);
    await waitForConfig();

    // Photo without aiButton
    const photo = makePhoto('no-ai');
    await act(async () => {
      simulateSSE(photo);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAfterSSE();

    // No auto-generate call
    expect(generateCalls).toHaveLength(0);

    // Should show framed original
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/api/frame/no-ai.jpg',
    );
  });

  it('auto-generate failure shows original framed photo with no crash', async () => {
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/config') {
        return Promise.resolve({
          json: () => Promise.resolve({
            print: { paperSize: 'A4' },
            ai: {
              buttons: [
                { id: 'cartoon', label: 'Cartoon', workflowJson: '{"1":{}}' },
              ],
            },
          }),
        });
      }
      if (url === '/api/ai/generate') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Button not found' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);
    await waitForConfig();

    // Photo with an unknown/stale aiButton
    await act(async () => {
      simulateSSE(makePhoto('stale-1', 'nonexistent-button'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAfterSSE();

    // Should not crash; should fall back to original
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/api/frame/stale-1.jpg',
    );

    // Error message displayed
    expect(screen.getByText(/Button not found/)).toBeInTheDocument();
  });

  it('operator can still switch buttons after auto-apply', async () => {
    const generateCalls: { buttonId: string }[] = [];
    let callCount = 0;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/config') {
        return Promise.resolve({
          json: () => Promise.resolve({
            print: { paperSize: 'A4' },
            ai: {
              buttons: [
                { id: 'cartoon', label: 'Cartoon', workflowJson: '{"1":{}}' },
                { id: 'tropical', label: 'Tropical', workflowJson: '{"1":{}}' },
              ],
            },
          }),
        });
      }
      if (url === '/api/ai/generate') {
        const body = JSON.parse(options.body);
        generateCalls.push({ buttonId: body.buttonId });
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            imageUrl: `data:image/png;base64,result_${callCount}`,
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);
    await waitForConfig();

    // Auto-apply cartoon
    await act(async () => {
      simulateSSE(makePhoto('switch-1', 'cartoon'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAfterSSE();

    // Cartoon should be auto-applied
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,result_1');

    // Operator clicks Tropical
    await act(async () => {
      fireEvent.click(screen.getByText('Tropical'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAfterSSE();

    // Now Tropical should be shown
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,result_2');
    expect(generateCalls.map(c => c.buttonId)).toEqual(['cartoon', 'tropical']);
  });

  it('operator can use Show Original after auto-apply', async () => {
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/config') {
        return Promise.resolve({
          json: () => Promise.resolve({
            print: { paperSize: 'A4' },
            ai: {
              buttons: [
                { id: 'cartoon', label: 'Cartoon', workflowJson: '{"1":{}}' },
              ],
            },
          }),
        });
      }
      if (url === '/api/ai/generate') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            imageUrl: 'data:image/png;base64,generated',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);
    await waitForConfig();

    // Auto-apply cartoon
    await act(async () => {
      simulateSSE(makePhoto('orig-1', 'cartoon'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAfterSSE();

    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,generated');

    // Operator clicks Show Original
    await act(async () => {
      fireEvent.click(screen.getByText('Show Original'));
      await Promise.resolve();
    });

    // Should show framed original
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/api/frame/orig-1.jpg',
    );
  });

  it('Show Original is NOT shown when photo has no aiButton', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/config') {
        return Promise.resolve({
          json: () => Promise.resolve({
            print: { paperSize: 'A4' },
            ai: {
              buttons: [{ id: 'cartoon', label: 'Cartoon', workflowJson: '{"1":{}}' }],
            },
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);
    await waitForConfig();

    // Photo without aiButton
    await act(async () => {
      simulateSSE(makePhoto('plain'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAfterSSE();

    // No auto-generate, no Show Original
    expect(screen.queryByText('Show Original')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/api/frame/plain.jpg');
  });

  it('does not auto-apply when no AI buttons configured', async () => {
    const generateCalls: string[] = [];
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/config') {
        return Promise.resolve({
          json: () => Promise.resolve({
            print: { paperSize: 'A4' },
            ai: { buttons: [] },
          }),
        });
      }
      if (url === '/api/ai/generate') {
        const body = JSON.parse(options.body);
        generateCalls.push(body.photoId);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ imageUrl: 'data:image/png;base64,x' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);
    await waitForConfig();

    await act(async () => {
      simulateSSE(makePhoto('no-config', 'cartoon'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAfterSSE();

    // No auto-generate call
    expect(generateCalls).toHaveLength(0);
    // Original shown
    expect(screen.getByRole('img')).toHaveAttribute('src', '/api/frame/no-config.jpg');
  });
});
