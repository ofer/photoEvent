import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CapturePage from '../app/capture/page';
import { uploadPhoto } from '../lib/api';

// ============================================================
// Helpers
// ============================================================

const TEST_FILE_BYTES = 'fake-jpeg-bytes';

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

function okResponse() {
  return {
    ok: true,
    status: 201,
    json: () => Promise.resolve({ id: '1700000000000.jpg' }),
  };
}

function errorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: message }),
  };
}

// ============================================================
// Tests
// ============================================================

describe('CapturePage - review flow', () => {
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

  beforeEach(() => {
    let counter = 0;
    vi.stubGlobal('fetch', mockFetch);
    // jsdom does not implement object URLs
    URL.createObjectURL = vi.fn(
      (file: File) => `blob:mock-${++counter}-${file.name}`
    );
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('idle: shows the camera button and makes no network requests', () => {
    render(<CapturePage />);

    expect(
      screen.getByRole('heading', { name: /take a photo/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Take a photo' })
    ).toBeInTheDocument();

    // No preview, no action bar, no fetch before a photo is taken
    expect(
      screen.queryByRole('img', { name: 'Photo preview' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('selecting a photo shows a full-screen preview and does NOT upload', () => {
    render(<CapturePage />);

    const file = makeFile();
    selectFile(file);

    // Full-screen preview of exactly that photo (object URL of the File)
    const preview = screen.getByRole('img', { name: 'Photo preview' });
    expect(preview).toHaveAttribute('src', 'blob:mock-1-shot.jpg');
    expect(preview).toHaveClass('object-cover');

    // Action bar is present
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retake/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();

    // Nothing has been uploaded — no fetch at all
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('accept uploads the original file (no aiButton when the original is showing) and shows success', async () => {
    mockFetch.mockResolvedValue(okResponse());
    render(<CapturePage />);

    const file = makeFile();
    selectFile(file);
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));

    // Success message appears after the upload resolves
    await vi.waitFor(() =>
      expect(screen.getByText(/photo sent to kiosk/i)).toBeInTheDocument()
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/photos');
    expect(init.method).toBe('POST');

    const fd = init.body as FormData;
    const uploaded = fd.get('photo') as File;
    expect(uploaded).toBeInstanceOf(File);
    expect(uploaded.name).toBe('shot.jpg');
    expect(uploaded.type).toBe('image/jpeg');
    expect(await readAsText(uploaded)).toBe(TEST_FILE_BYTES);

    // Original preview showing -> no aiButton field
    expect(fd.getAll('aiButton')).toEqual([]);
  });

  it('accept during upload is not double-submitted', async () => {
    let resolveUpload: (value: unknown) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );
    render(<CapturePage />);

    selectFile(makeFile());
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));

    await vi.waitFor(() =>
      expect(screen.getByText(/uploading/i)).toBeInTheDocument()
    );

    // The action bar buttons are disabled while uploading
    expect(screen.getByRole('button', { name: /^accept$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /retake/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /discard/i })).toBeDisabled();

    // Let the single in-flight upload finish
    await act(async () => {
      resolveUpload(okResponse());
      await Promise.resolve();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns to idle ~3s after success', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(okResponse());
    render(<CapturePage />);

    selectFile(makeFile());
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));

    // Flush the (immediately resolving) upload promise
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/photo sent to kiosk/i)).toBeInTheDocument();

    // Still in success just before 3s
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByText(/photo sent to kiosk/i)).toBeInTheDocument();

    // Back to idle at 3s
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText(/photo sent to kiosk/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Take a photo' })
    ).toBeInTheDocument();
  });

  it('retake clears the previous preview (object URL revoked) and reopens the camera', () => {
    render(<CapturePage />);

    selectFile(makeFile());
    expect(screen.getByRole('img', { name: 'Photo preview' })).toBeInTheDocument();

    const input = getFileInput();
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByRole('button', { name: /retake/i }));

    // Camera reopened
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // Previous preview cleared and its object URL revoked
    expect(
      screen.queryByRole('img', { name: 'Photo preview' })
    ).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1-shot.jpg');
    // Retake never touches the server
    expect(mockFetch).not.toHaveBeenCalled();
    // Back to idle
    expect(
      screen.getByRole('button', { name: 'Take a photo' })
    ).toBeInTheDocument();
  });

  it('discard returns to idle without uploading', () => {
    render(<CapturePage />);

    selectFile(makeFile());
    expect(screen.getByRole('img', { name: 'Photo preview' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /discard/i }));

    // Nothing uploaded, preview cleared + URL revoked, back to idle
    expect(mockFetch).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('img', { name: 'Photo preview' })
    ).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1-shot.jpg');
    expect(
      screen.getByRole('button', { name: 'Take a photo' })
    ).toBeInTheDocument();
  });

  it('upload failure shows an error + Retry that re-uploads the same file', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500, 'Server error'))
      .mockResolvedValue(okResponse());
    render(<CapturePage />);

    selectFile(makeFile('retry-shot.jpg'));
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));

    await vi.waitFor(() =>
      expect(screen.getByText('Server error')).toBeInTheDocument()
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Preview and the retained File survive the failure
    expect(screen.getByRole('img', { name: 'Photo preview' })).toBeInTheDocument();
    const firstFd = mockFetch.mock.calls[0][1].body as FormData;

    // Retry re-uploads the same retained file
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await vi.waitFor(() =>
      expect(screen.getByText(/photo sent to kiosk/i)).toBeInTheDocument()
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const secondFd = mockFetch.mock.calls[1][1].body as FormData;
    const firstPhoto = firstFd.get('photo') as File;
    const secondPhoto = secondFd.get('photo') as File;
    expect(secondPhoto.name).toBe(firstPhoto.name);
    expect(secondPhoto.size).toBe(firstPhoto.size);
    expect(await readAsText(secondPhoto)).toBe(TEST_FILE_BYTES);
  });

  it('upload failure keeps Discard available', async () => {
    mockFetch.mockResolvedValue(errorResponse(413, 'File too large. Maximum size is 20MB.'));
    render(<CapturePage />);

    selectFile(makeFile());
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));

    await vi.waitFor(() =>
      expect(
        screen.getByText('File too large. Maximum size is 20MB.')
      ).toBeInTheDocument()
    );

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Take a photo' })
    ).toBeInTheDocument();
  });
});

// ============================================================
// uploadPhoto helper — FormData contract
// ============================================================

describe('uploadPhoto (lib/api)', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: '1.jpg' }) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts the original file and omits aiButton when no choice is active', async () => {
    const file = makeFile();
    await uploadPhoto(file);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/photos');
    expect(init.method).toBe('POST');
    const fd = init.body as FormData;
    const uploaded = fd.get('photo') as File;
    expect(uploaded.name).toBe('shot.jpg');
    expect(await readAsText(uploaded)).toBe(TEST_FILE_BYTES);
    expect(fd.getAll('aiButton')).toEqual([]);
  });

  it('includes the original file bytes plus aiButton when a transformed preview is active', async () => {
    const file = makeFile();
    await uploadPhoto(file, 'cartoon');

    const fd = mockFetch.mock.calls[0][1].body as FormData;
    const uploaded = fd.get('photo') as File;
    // Always the ORIGINAL photo bytes, never a transformed image
    expect(uploaded.name).toBe('shot.jpg');
    expect(await readAsText(uploaded)).toBe(TEST_FILE_BYTES);
    // ...plus the chosen transformation
    expect(fd.get('aiButton')).toBe('cartoon');
  });

  it('omits aiButton for an explicit null choice (Show Original)', async () => {
    const file = makeFile();
    await uploadPhoto(file, null);

    const fd = mockFetch.mock.calls[0][1].body as FormData;
    expect(fd.get('photo')).not.toBeNull();
    expect(fd.getAll('aiButton')).toEqual([]);
  });

  it('throws the server error message on failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    });

    await expect(uploadPhoto(makeFile())).rejects.toThrow('Server error');
  });
});
