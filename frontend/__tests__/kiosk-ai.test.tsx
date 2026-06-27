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
// EventSource mock (same as kiosk-queue.test.tsx)
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

// ============================================================
// Tests
// ============================================================

describe('KioskPage - AI generation', () => {
  const mockFetch = vi.fn();

  function getPhotoIdFromUrl(url: string): string | null {
    const match = url.match(/\/api\/frame\/([^.]+)/);
    return match ? match[1] : null;
  }

  beforeEach(() => {
    vi.stubGlobal('print', vi.fn());
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('fetch', mockFetch);
    _sseOnMessage = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders multiple AI buttons when buttons array is configured', async () => {
    mockFetch.mockImplementation((url: string) => {
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
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    const photo = makePhoto('A');
    await act(async () => {
      simulateSSE(photo);
      await Promise.resolve();
    });

    expect(screen.getByText('Cartoon')).toBeInTheDocument();
    expect(screen.getByText('Tropical')).toBeInTheDocument();
  });

  it('hides AI buttons when buttons array is empty', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/config') {
        return Promise.resolve({
          json: () => Promise.resolve({
            print: { paperSize: 'A4' },
            ai: { buttons: [] },
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    const photo = makePhoto('A');
    await act(async () => {
      simulateSSE(photo);
      await Promise.resolve();
    });

    expect(screen.queryByText('Cartoon')).not.toBeInTheDocument();
    expect(screen.queryByText('Tropical')).not.toBeInTheDocument();
  });

  it('hides AI buttons when ai section is absent from config', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/config') {
        return Promise.resolve({
          json: () => Promise.resolve({
            print: { paperSize: 'A4' },
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    const photo = makePhoto('A');
    await act(async () => {
      simulateSSE(photo);
      await Promise.resolve();
    });

    expect(screen.queryByRole('button', { name: /AI effect/i })).not.toBeInTheDocument();
  });

  it('sends correct buttonId when a button is clicked', async () => {
    const captureBody = vi.fn();
    mockFetch.mockImplementation((url: string, options: any) => {
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
        captureBody(JSON.parse(options.body));
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    const photo = makePhoto('ai-test');
    await act(async () => {
      simulateSSE(photo);
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Cartoon'));
      await Promise.resolve();
    });

    expect(captureBody).toHaveBeenCalledWith(
      expect.objectContaining({ buttonId: 'cartoon' }),
    );
  });

  it('sends photoId in the request body', async () => {
    const captureBody = vi.fn();
    mockFetch.mockImplementation((url: string, options: any) => {
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
      if (url === '/api/ai/generate') {
        captureBody(JSON.parse(options.body));
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

    await act(async () => {
      simulateSSE(makePhoto('photo-123'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Cartoon'));
      await Promise.resolve();
    });

    expect(captureBody).toHaveBeenCalledWith(
      expect.objectContaining({ photoId: 'photo-123.jpg' }),
    );
  });

  it('shows generated image after successful generation', async () => {
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
      if (url === '/api/ai/generate') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    await act(async () => {
      simulateSSE(makePhoto('ai-test'));
      await Promise.resolve();
    });

    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/api/frame/ai-test.jpg',
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Cartoon'));
      await Promise.resolve();
    });

    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'data:image/png;base64,iVBORw0KGgo=',
    );
  });

  it('replaces generated image when a different button is clicked', async () => {
    const callCounts = { cartoon: 0, tropical: 0 };
    mockFetch.mockImplementation((url: string) => {
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
        if (callCounts.cartoon === 0) {
          callCounts.cartoon++;
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ imageUrl: 'data:image/png;base64,cartoon_1' }),
          });
        }
        callCounts.tropical++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ imageUrl: `data:image/png;base64,tropical_${callCounts.tropical}` }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    await act(async () => {
      simulateSSE(makePhoto('ai-test'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Cartoon'));
      await Promise.resolve();
    });
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'data:image/png;base64,cartoon_1',
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Tropical'));
      await Promise.resolve();
    });
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'data:image/png;base64,tropical_1',
    );
  });

  it('shows loading state during generation', async () => {
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
      if (url === '/api/ai/generate') {
        return new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: () => Promise.resolve({ imageUrl: 'data:image/png;base64,x' }) }), 100),
        );
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    await act(async () => {
      simulateSSE(makePhoto('ai-test'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Cartoon'));
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: /Generating/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generating/i })).toBeDisabled();
  });

  it('disables all buttons while any generation is in progress', async () => {
    mockFetch.mockImplementation((url: string) => {
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
        return new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: () => Promise.resolve({ imageUrl: 'data:image/png;base64,x' }) }), 200),
        );
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    await act(async () => {
      simulateSSE(makePhoto('ai-test'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Cartoon'));
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Tropical' })).toBeDisabled();
  });

  it('shows error when generation fails', async () => {
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
      if (url === '/api/ai/generate') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'ComfyUI connection refused' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    await act(async () => {
      simulateSSE(makePhoto('ai-test'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Cartoon'));
      await Promise.resolve();
    });

    expect(screen.getByText(/ComfyUI connection refused/)).toBeInTheDocument();
  });

  it('keeps countdown running during generation', async () => {
    vi.useFakeTimers();
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
      if (url === '/api/ai/generate') {
        return new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: () => Promise.resolve({ imageUrl: 'data:image/png;base64,x' }) }), 5000),
        );
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    await act(async () => {
      simulateSSE(makePhoto('ai-test'));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Cartoon'));
      await Promise.resolve();
    });

    vi.advanceTimersByTime(15000);
    await act(async () => { await Promise.resolve(); });

    const countdownValues = screen.getAllByText(/\b\d+\b/);
    expect(parseInt(countdownValues[0].textContent || '30', 10)).toBe(15);

    vi.useRealTimers();
  });

  it('resets generated image when advancing to next photo via countdown', async () => {
    vi.useFakeTimers();
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
      if (url === '/api/ai/generate') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ imageUrl: 'data:image/png;base64,generated' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    await act(async () => {
      simulateSSE(makePhoto('photo-A'));
      await Promise.resolve();
    });

    // Generate AI image for photo A
    await act(async () => {
      fireEvent.click(screen.getByText('Cartoon'));
      await Promise.resolve();
    });
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,generated');

    // Advance to next photo via countdown
    await act(async () => {
      simulateSSE(makePhoto('photo-B'));
      await Promise.resolve();
    });

    // Advance the countdown (30s + 300ms print delay)
    vi.advanceTimersByTime(30300);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    vi.advanceTimersByTime(500);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // Should show framed photo B, not the generated image
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/api/frame/photo-B.jpg',
    );

    vi.useRealTimers();
  });

  it('resets generated image when discarding a photo', async () => {
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
      if (url === '/api/ai/generate') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ imageUrl: 'data:image/png;base64,generated' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    await act(async () => {
      simulateSSE(makePhoto('photo-A'));
      await Promise.resolve();
    });

    // Generate AI image for photo A
    await act(async () => {
      fireEvent.click(screen.getByText('Cartoon'));
      await Promise.resolve();
    });
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,generated');

    // Advance queue (simulating photo B arrival)
    await act(async () => {
      simulateSSE(makePhoto('photo-B'));
      await Promise.resolve();
    });

    // Discard photo A (which has the generated image)
    fireEvent.click(screen.getByText('Discard'));

    // Should show framed photo B
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      '/api/frame/photo-B.jpg',
    );
  });

  it('prevents generating when no photo is displayed', async () => {
    const captureBody = vi.fn();
    mockFetch.mockImplementation((url: string, options: any) => {
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
      if (url === '/api/ai/generate') {
        captureBody(JSON.parse(options.body));
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: false });
    });

    render(<KioskPage />);

    // Without a photo, clicking a button should do nothing
    expect(screen.queryByText(/Waiting for photos/i)).toBeInTheDocument();
    // AI buttons should not be visible without a photo
    expect(screen.queryByText('Cartoon')).not.toBeInTheDocument();
  });
});
