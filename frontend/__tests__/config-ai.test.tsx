import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfigPage from '../app/config/page';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ConfigPage - AI section', () => {
  const mockConfig = {
    event: { name: 'Test Event', year: '2026' },
    frame: { padding: 40, barHeight: 100, fontSize: 36, barColor: '#1e1e1e', barTextColor: '#ffffff', subtextColor: '#cccccc', backgroundColor: '#ffffff' },
    print: { paperSize: 'A4', orientation: 'landscape', margin: '10mm' },
    ai: { comfyServerUrl: 'http://10.0.0.17:8188', buttons: [] },
  };

  const mockConfigWithButtons = {
    ...mockConfig,
    ai: {
      comfyServerUrl: 'http://10.0.0.17:8188',
      buttons: [
        { id: 'cartoon', label: 'Cartoon Caricature', workflowJson: '{"1":{"class_type":"LoadImage"}}' },
        { id: 'tropical', label: 'Tropical Island', workflowJson: '{"1":{"class_type":"LoadImage"}}' },
      ],
    },
  };

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    });
  });

  it('renders AI section with default values', async () => {
    render(<ConfigPage />);
    await waitFor(() => expect(screen.getByText('AI')).toBeInTheDocument());
    expect(screen.getByDisplayValue('http://10.0.0.17:8188')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Button' })).toBeInTheDocument();
  });

  it('renders button cards when buttons are configured', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfigWithButtons),
    });

    render(<ConfigPage />);
    await waitFor(() => expect(screen.getByText('AI')).toBeInTheDocument());

    expect(screen.getByDisplayValue('Cartoon Caricature')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tropical Island')).toBeInTheDocument();
    expect(screen.getByDisplayValue('cartoon')).toBeInTheDocument();
    expect(screen.getByDisplayValue('tropical')).toBeInTheDocument();
  });

  it('shows "No buttons configured" message when empty', async () => {
    render(<ConfigPage />);
    await waitFor(() => expect(screen.getByText('AI')).toBeInTheDocument());
    expect(screen.getByText('No buttons configured')).toBeInTheDocument();
  });

  it('adds a new button card on Add Button click', async () => {
    render(<ConfigPage />);
    await waitFor(() => expect(screen.getByText('AI')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Add Button' }));

    const groups = screen.getAllByRole('group');
    expect(groups.length).toBe(1);
    expect(screen.getByText('Button 1')).toBeInTheDocument();
  });

  it('removes a button card on Delete click', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfigWithButtons),
    });

    render(<ConfigPage />);
    await waitFor(() => expect(screen.getByText('AI')).toBeInTheDocument());

    expect(screen.getAllByRole('group').length).toBe(2);
    const deleteBtns = screen.getAllByRole('button', { name: 'Delete button' });
    fireEvent.click(deleteBtns[0]);

    expect(screen.getAllByRole('group').length).toBe(1);
    expect(screen.queryByDisplayValue('Cartoon Caricature')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Tropical Island')).toBeInTheDocument();
  });

  it('updates server URL on change', async () => {
    render(<ConfigPage />);
    await waitFor(() => expect(screen.getByText('AI')).toBeInTheDocument());
    const urlInput = screen.getByDisplayValue('http://10.0.0.17:8188');
    fireEvent.change(urlInput, { target: { value: 'http://my-server:8188' } });
    expect(urlInput).toHaveValue('http://my-server:8188');
  });

  it('updates workflow JSON textarea on change', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfigWithButtons),
    });

    render(<ConfigPage />);
    await waitFor(() => expect(screen.getByText('AI')).toBeInTheDocument());

    const textareas = screen.getAllByRole('textbox');
    const aiTextarea = textareas.find((ta) => ta.rows && ta.rows >= 5);
    expect(aiTextarea).toBeDefined();
    fireEvent.change(aiTextarea!, { target: { value: '{"1":{"inputs":{}}}' } });
    expect(aiTextarea).toHaveValue('{"1":{"inputs":{}}}');
  });

  it('saves all AI config on submit', async () => {
    const putCall = vi.fn();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfig) })
      .mockImplementation((url: string, options: any) => {
        if (options?.method === 'PUT') {
          putCall(JSON.parse(options.body));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockConfig) });
      });

    render(<ConfigPage />);
    await waitFor(() => expect(screen.getByText('AI')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Add Button' }));
    const textboxes = screen.getAllByRole('textbox');
    // Find the ID input (empty string value, not the server URL)
    const idInput = textboxes.find((tb) => tb.value === '');
    fireEvent.change(idInput!, { target: { value: 'new-id' } });
    const labelInput = textboxes.find((tb) => tb !== idInput && tb.value === '');
    fireEvent.change(labelInput!, { target: { value: 'New Effect' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Saved!')).toBeInTheDocument());
    expect(putCall).toHaveBeenCalled();
    const saved = putCall.mock.calls[0][0];
    expect(saved.ai.buttons).toHaveLength(1);
    expect(saved.ai.buttons[0].label).toBe('New Effect');
  });

  it('sends button IDs in the saved payload', async () => {
    const putCall = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfigWithButtons),
    });
    mockFetch.mockImplementation((url: string, options: any) => {
      if (options?.method === 'PUT') {
        putCall(JSON.parse(options.body));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockConfigWithButtons) });
    });

    render(<ConfigPage />);
    await waitFor(() => expect(screen.getByText('AI')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(putCall).toHaveBeenCalled());
    const saved = putCall.mock.calls[0][0];
    expect(saved.ai.buttons[0].id).toBe('cartoon');
    expect(saved.ai.buttons[1].id).toBe('tropical');
    expect(saved.ai.comfyServerUrl).toBe('http://10.0.0.17:8188');
  });

  it('shows error on save failure', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfig) })
      .mockResolvedValue({ ok: false, status: 500 });

    render(<ConfigPage />);
    await waitFor(() => expect(screen.getByText('AI')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(/Failed to save/i)).toBeInTheDocument());
  });
});
