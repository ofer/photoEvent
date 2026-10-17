import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import KioskPage from '../app/kiosk/page';

let _sseOnMessage: ((event: MessageEvent) => void) | null = null;

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_url: string) {
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

const makePhoto = (id: string) => ({
  id: `${id}.jpg`,
  name: `${id}.jpg`,
  timestamp: new Date().toISOString(),
  url: `/api/photos/${id}.jpg`,
});

// jsdom leaves naturalWidth/naturalHeight at 0, so define them before firing load
function loadImgWithDims(img: HTMLImageElement, w: number, h: number) {
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: w });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: h });
  fireEvent.load(img);
}

function mockConfig(orientation: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          print: { paperSize: 'A4', orientation, margin: '10mm' },
        }),
    }),
  );
}

function printCss(container: HTMLElement) {
  return container.querySelector('style')?.textContent ?? '';
}

async function runCountdownToPrint() {
  vi.advanceTimersByTime(30000);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  vi.advanceTimersByTime(300);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('KioskPage - per-photo print orientation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('print', vi.fn());
    vi.stubGlobal('EventSource', MockEventSource);
    _sseOnMessage = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('auto: landscape photo prints landscape (CSS + printToPreview flag)', async () => {
    mockConfig('auto');
    const printToPreview = vi.fn((_cfg: unknown, cb: (r: unknown) => void) => cb({}));
    vi.stubGlobal('chrome', { printToPreview });

    const { container } = render(<KioskPage />);
    await act(async () => { simulateSSE(makePhoto('L')); await Promise.resolve(); });

    loadImgWithDims(screen.getByRole('img') as HTMLImageElement, 2048, 1365);

    expect(printCss(container)).toContain('size: A4 landscape');

    await runCountdownToPrint();

    expect(printToPreview).toHaveBeenCalledTimes(1);
    expect(printToPreview.mock.calls[0][0].landscape).toBe(true);
  });

  it('auto: portrait photo prints portrait', async () => {
    mockConfig('auto');
    const printToPreview = vi.fn((_cfg: unknown, cb: (r: unknown) => void) => cb({}));
    vi.stubGlobal('chrome', { printToPreview });

    const { container } = render(<KioskPage />);
    await act(async () => { simulateSSE(makePhoto('P')); await Promise.resolve(); });

    loadImgWithDims(screen.getByRole('img') as HTMLImageElement, 1365, 2048);

    expect(printCss(container)).toContain('size: A4 portrait');

    await runCountdownToPrint();

    expect(printToPreview).toHaveBeenCalledTimes(1);
    expect(printToPreview.mock.calls[0][0].landscape).toBe(false);
  });

  it('forced landscape overrides a portrait photo', async () => {
    mockConfig('landscape');
    const printToPreview = vi.fn((_cfg: unknown, cb: (r: unknown) => void) => cb({}));
    vi.stubGlobal('chrome', { printToPreview });

    const { container } = render(<KioskPage />);
    await act(async () => { simulateSSE(makePhoto('P')); await Promise.resolve(); });

    loadImgWithDims(screen.getByRole('img') as HTMLImageElement, 1365, 2048);

    expect(printCss(container)).toContain('size: A4 landscape');

    await runCountdownToPrint();

    expect(printToPreview.mock.calls[0][0].landscape).toBe(true);
  });

  it('auto with image not yet loaded falls back to portrait', async () => {
    mockConfig('auto');

    const { container } = render(<KioskPage />);
    await act(async () => { simulateSSE(makePhoto('P')); await Promise.resolve(); });

    expect(printCss(container)).toContain('size: A4 portrait');
  });
});
