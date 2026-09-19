import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CapturePage from '../app/capture/page';

// ============================================================
// Helpers
// ============================================================

const TEST_FILE_BYTES = 'fake-jpeg-bytes';
const STUB_TRANSFORM_URL = 'data:image/jpeg;base64,STUB-TRANSFORM';

const AI_BUTTONS = [
  { id: 'cartoon', label: 'Cartoon', workflowJson: '{"1":{}}' },
  { id: 'tropical', label: 'Tropical', workflowJson: '{"1":{}}' },
];

function makeFile(name = 'shot.jpg', type = 'image/jpeg'): File {
  return new File([TEST_FILE_BYTES], name, { type });
}

// jsdom's File has no .text()
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function okTransformResponse() {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ imageUrl: STUB_TRANSFORM_URL }),
  };
}

function okUploadResponse() {
  return {
    ok: true,
    status: 201,
    json: () => Promise.resolve({ id: '1700000000000.jpg' }),
  };
}

function transformError400() {
  return {
    ok: false,
    status: 400,
    json: () => Promise.resolve({ error: 'ComfyUI server URL not configured' }),
  };
}

/**
 * Fetch router for the capture page's three endpoints.
 * `buttons` null = /api/config response without an `ai` section;
 * omitted = the two default buttons above.
 */
function makeFetchRouter(opts: {
  buttons?: Array<{ id: string; label: string }> | null;
  transform?: (init: RequestInit | undefined) => unknown;
  upload?: (init: RequestInit | undefined) => unknown;
} = {}) {
  // 'buttons' in opts distinguishes an explicit null (config without an ai
  // section) from an omitted key (the default buttons).
  const buttons = 'buttons' in opts ? opts.buttons : AI_BUTTONS;
  return (url: string, init?: RequestInit): unknown => {
    if (url === '/api/config') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            buttons === null
              ? { print: { paperSize: 'A4' } }
              : {
                  print: { paperSize: 'A4' },
                  ai: { comfyServerUrl: 'http://comfy:8188', buttons },
                },
          ),
      });
    }
    if (url === '/api/ai/transform') {
      return (opts.transform ?? (() => Promise.resolve(okTransformResponse())))(init);
    }
    return (opts.upload ?? (() => Promise.resolve(okUploadResponse())))(init);
  };
}

// ============================================================
// Tests
// ============================================================

describe('CapturePage - AI transform buttons', () => {
  const mockFetch = vi.fn();

  function getFileInput(): HTMLInputElement {
    const input = document.querySelector(
      'input[type="file"][capture="environment"]'
    );
    expect(input).not.toBeNull();
    return input!;
  }

  function selectFile(file: File) {
    fireEvent.change(getFileInput(), { target: { files: [file] } });
  }

  // Flush microtasks so the page's /api/config fetch promise chain
  // (fetch -> json -> setAiButtons) has fully settled and re-rendered.
  async function flushConfig() {
    await vi.waitFor(() => {
      expect(
        mockFetch.mock.calls.some(([url]) => url === '/api/config')
      ).toBe(true);
    });
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  async function enterReview(file: File = makeFile()) {
    selectFile(file);
    await vi.waitFor(() =>
      expect(
        screen.getByRole('img', { name: 'Photo preview' })
      ).toBeInTheDocument()
    );
    await flushConfig();
  }

  function transformCalls(): Array<[string, RequestInit]> {
    return mockFetch.mock.calls.filter(([url]) => url === '/api/ai/transform');
  }

  function uploadCalls(): Array<[string, RequestInit]> {
    return mockFetch.mock.calls.filter(([url]) => url === '/api/photos');
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    URL.createObjectURL = vi.fn((file: File) => `blob:mock-${file.name}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows one button per configured AI button (labels from /api/config), only in review', async () => {
    mockFetch.mockImplementation(makeFetchRouter({ buttons: AI_BUTTONS }));
    render(<CapturePage />);

    // /api/config is fetched on mount (same source the kiosk uses)
    await vi.waitFor(() =>
      expect(
        mockFetch.mock.calls.some(([url]) => url === '/api/config')
      ).toBe(true)
    );

    // No AI row before a photo is taken
    expect(screen.queryByRole('button', { name: 'Cartoon' })).not.toBeInTheDocument();

    await enterReview();

    expect(screen.getByRole('button', { name: 'Cartoon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tropical' })).toBeInTheDocument();
    // Show Original only appears once a transformed preview is showing
    expect(screen.queryByRole('button', { name: 'Show Original' })).not.toBeInTheDocument();
  });

  it('shows no AI button row when no buttons are configured', async () => {
    mockFetch.mockImplementation(makeFetchRouter({ buttons: [] }));
    render(<CapturePage />);
    await enterReview();

    expect(screen.queryByRole('button', { name: /cartoon|tropical/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show Original' })).not.toBeInTheDocument();
    // The normal action bar is unaffected
    expect(screen.getByRole('button', { name: /^accept$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retake/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  it('shows no AI button row when the config has no ai section, or when the fetch fails', async () => {
    mockFetch.mockImplementation(makeFetchRouter({ buttons: null }));
    const { unmount } = render(<CapturePage />);
    await enterReview();
    expect(screen.queryByRole('button', { name: /cartoon|tropical/i })).not.toBeInTheDocument();
    unmount();

    // A failed config fetch is silent — the review screen still works
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/config') return Promise.reject(new Error('network down'));
      return Promise.resolve(okUploadResponse());
    });
    render(<CapturePage />);
    await enterReview();
    expect(screen.queryByRole('button', { name: /cartoon|tropical/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^accept$/i })).toBeInTheDocument();
  });

  it('pressing a button shows "Generating…" and disables all AI buttons, then shows the transformed preview', async () => {
    let resolveTransform: (value: unknown) => void = () => {};
    mockFetch.mockImplementation(
      makeFetchRouter({
        transform: () => new Promise((resolve) => { resolveTransform = resolve; }),
      })
    );
    render(<CapturePage />);
    await enterReview(makeFile('shot.jpg'));
    const preview = screen.getByRole('img', { name: 'Photo preview' });
    expect(preview).toHaveAttribute('src', 'blob:mock-shot.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'Cartoon' }));

    // In flight: active button shows "Generating…", all AI buttons disabled
    const generatingBtn = screen.getByRole('button', { name: /Generating…/ });
    expect(generatingBtn).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tropical' })).toBeDisabled();
    // Preview unchanged while generating
    expect(preview).toHaveAttribute('src', 'blob:mock-shot.jpg');

    // The POST carries the ORIGINAL file bytes + the button id
    await vi.waitFor(() => expect(transformCalls()).toHaveLength(1));
    const fd = transformCalls()[0][1].body as FormData;
    const sent = fd.get('photo') as File;
    expect(sent.name).toBe('shot.jpg');
    expect(sent.type).toBe('image/jpeg');
    expect(await readAsText(sent)).toBe(TEST_FILE_BYTES);
    expect(fd.get('buttonId')).toBe('cartoon');

    // Response arrives: preview switches to the returned data URL
    await act(async () => {
      resolveTransform(okTransformResponse());
      await Promise.resolve();
    });
    await vi.waitFor(() =>
      expect(screen.getByRole('img', { name: 'Photo preview' })).toHaveAttribute(
        'src',
        STUB_TRANSFORM_URL
      )
    );
    expect(screen.getByRole('button', { name: 'Show Original' })).toBeInTheDocument();
    // Buttons re-enabled with their labels restored
    expect(screen.getByRole('button', { name: 'Cartoon' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Tropical' })).toBeEnabled();
  });

  it('pressing the same button again POSTs again (server-side cache dedupes)', async () => {
    mockFetch.mockImplementation(makeFetchRouter({}));
    render(<CapturePage />);
    await enterReview();

    fireEvent.click(screen.getByRole('button', { name: 'Cartoon' }));
    await vi.waitFor(() =>
      expect(screen.getByRole('img', { name: 'Photo preview' })).toHaveAttribute(
        'src',
        STUB_TRANSFORM_URL
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cartoon' }));
    await vi.waitFor(() => expect(transformCalls()).toHaveLength(2));
    expect((transformCalls()[1][1].body as FormData).get('buttonId')).toBe('cartoon');
  });

  it('"Show Original" restores the original preview and clears the pending choice', async () => {
    mockFetch.mockImplementation(makeFetchRouter({}));
    render(<CapturePage />);
    await enterReview();

    fireEvent.click(screen.getByRole('button', { name: 'Cartoon' }));
    await vi.waitFor(() =>
      expect(screen.getByRole('img', { name: 'Photo preview' })).toHaveAttribute(
        'src',
        STUB_TRANSFORM_URL
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Original' }));

    expect(screen.getByRole('img', { name: 'Photo preview' })).toHaveAttribute(
      'src',
      'blob:mock-shot.jpg'
    );
    expect(screen.queryByRole('button', { name: 'Show Original' })).not.toBeInTheDocument();

    // Accept now uploads WITHOUT aiButton (the choice was cleared)
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));
    await vi.waitFor(() =>
      expect(screen.getByText(/photo sent to kiosk/i)).toBeInTheDocument()
    );
    const fd = uploadCalls()[0][1].body as FormData;
    expect(fd.getAll('aiButton')).toEqual([]);
  });

  it('accept with a transformed preview showing sends the original bytes plus aiButton (page wiring)', async () => {
    mockFetch.mockImplementation(makeFetchRouter({}));
    render(<CapturePage />);
    await enterReview(makeFile('wired.jpg'));

    fireEvent.click(screen.getByRole('button', { name: 'Tropical' }));
    await vi.waitFor(() =>
      expect(screen.getByRole('img', { name: 'Photo preview' })).toHaveAttribute(
        'src',
        STUB_TRANSFORM_URL
      )
    );

    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));
    await vi.waitFor(() =>
      expect(screen.getByText(/photo sent to kiosk/i)).toBeInTheDocument()
    );

    expect(uploadCalls()).toHaveLength(1);
    const fd = uploadCalls()[0][1].body as FormData;
    const uploaded = fd.get('photo') as File;
    // Always the ORIGINAL photo bytes, never the transformed image
    expect(uploaded.name).toBe('wired.jpg');
    expect(await readAsText(uploaded)).toBe(TEST_FILE_BYTES);
    // ...plus the applied transformation id
    expect(fd.get('aiButton')).toBe('tropical');
  });

  it('transform failure shows an error, keeps the current preview, and Accept uploads without aiButton', async () => {
    mockFetch.mockImplementation(
      makeFetchRouter({ transform: () => Promise.resolve(transformError400()) })
    );
    render(<CapturePage />);
    await enterReview();

    fireEvent.click(screen.getByRole('button', { name: 'Cartoon' }));

    await vi.waitFor(() =>
      expect(screen.getByText('ComfyUI server URL not configured')).toBeInTheDocument()
    );
    // Preview unchanged (still the original), no Show Original
    expect(screen.getByRole('img', { name: 'Photo preview' })).toHaveAttribute(
      'src',
      'blob:mock-shot.jpg'
    );
    expect(screen.queryByRole('button', { name: 'Show Original' })).not.toBeInTheDocument();
    // Buttons re-enabled after the failure
    expect(screen.getByRole('button', { name: 'Cartoon' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Tropical' })).toBeEnabled();

    // Accept still works and omits aiButton
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));
    await vi.waitFor(() =>
      expect(screen.getByText(/photo sent to kiosk/i)).toBeInTheDocument()
    );
    const fd = uploadCalls()[0][1].body as FormData;
    expect(fd.get('photo')).not.toBeNull();
    expect(fd.getAll('aiButton')).toEqual([]);
  });

  it('a failed transform keeps the previously applied transform in the preview and choice', async () => {
    let calls = 0;
    mockFetch.mockImplementation(
      makeFetchRouter({
        transform: () => {
          calls += 1;
          return calls === 1
            ? Promise.resolve(okTransformResponse())
            : Promise.resolve({
                ok: false,
                status: 500,
                json: () =>
                  Promise.resolve({ error: 'ComfyUI workflow timed out after 120000ms' }),
              });
        },
      })
    );
    render(<CapturePage />);
    await enterReview();

    // First button succeeds
    fireEvent.click(screen.getByRole('button', { name: 'Cartoon' }));
    await vi.waitFor(() =>
      expect(screen.getByRole('img', { name: 'Photo preview' })).toHaveAttribute(
        'src',
        STUB_TRANSFORM_URL
      )
    );

    // Second button fails → error shown, preview keeps the cartoon result
    fireEvent.click(screen.getByRole('button', { name: 'Tropical' }));
    await vi.waitFor(() =>
      expect(screen.getByText('ComfyUI workflow timed out after 120000ms')).toBeInTheDocument()
    );
    expect(screen.getByRole('img', { name: 'Photo preview' })).toHaveAttribute(
      'src',
      STUB_TRANSFORM_URL
    );

    // Accept uploads with the still-applied cartoon choice
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));
    await vi.waitFor(() =>
      expect(screen.getByText(/photo sent to kiosk/i)).toBeInTheDocument()
    );
    const fd = uploadCalls()[0][1].body as FormData;
    expect(fd.get('aiButton')).toBe('cartoon');
  });

  it('retake after a transform resets the preview, choice and error state', async () => {
    mockFetch.mockImplementation(
      makeFetchRouter({
        transform: () =>
          Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'ComfyUI down' }),
          }),
      })
    );
    render(<CapturePage />);
    await enterReview();

    fireEvent.click(screen.getByRole('button', { name: 'Cartoon' }));
    await vi.waitFor(() => expect(screen.getByText('ComfyUI down')).toBeInTheDocument());

    const input = getFileInput();
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /retake/i }));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // New capture starts from the original preview with no AI state
    await enterReview(makeFile('second.jpg'));
    expect(screen.getByRole('img', { name: 'Photo preview' })).toHaveAttribute(
      'src',
      'blob:mock-second.jpg'
    );
    expect(screen.queryByRole('button', { name: 'Show Original' })).not.toBeInTheDocument();
    expect(screen.queryByText('ComfyUI down')).not.toBeInTheDocument();
  });

  it('an in-flight transform that resolves after retake does not leak into the new capture', async () => {
    let resolveTransform: (value: unknown) => void = () => {};
    mockFetch.mockImplementation(
      makeFetchRouter({
        transform: () => new Promise((resolve) => { resolveTransform = resolve; }),
      })
    );
    render(<CapturePage />);
    await enterReview(makeFile('first.jpg'));

    fireEvent.click(screen.getByRole('button', { name: 'Cartoon' }));
    await vi.waitFor(() => expect(transformCalls()).toHaveLength(1));

    // Retake while in flight, then capture a new photo
    const input = getFileInput();
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /retake/i }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    await enterReview(makeFile('second.jpg'));
    const preview = screen.getByRole('img', { name: 'Photo preview' });
    expect(preview).toHaveAttribute('src', 'blob:mock-second.jpg');

    // The stale transform finally resolves — it must not change the preview
    await act(async () => {
      resolveTransform(okTransformResponse());
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(preview).toHaveAttribute('src', 'blob:mock-second.jpg');
    expect(screen.queryByRole('button', { name: 'Show Original' })).not.toBeInTheDocument();
  });
});
