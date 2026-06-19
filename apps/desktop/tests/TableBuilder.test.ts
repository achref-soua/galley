import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import TableBuilder from '../src/lib/TableBuilder.svelte';

const noop = () => {};

describe('TableBuilder', () => {
  it('renders title, controls, and default grid', () => {
    render(TableBuilder, { props: { oninsert: noop, oncancel: noop } });
    expect(screen.getByText('Table builder')).toBeTruthy();
    expect(screen.getByLabelText('Columns')).toBeTruthy();
    expect(screen.getByLabelText('Rows')).toBeTruthy();
    // 3 header cells by default.
    expect(screen.getByLabelText('Header 1')).toBeTruthy();
    expect(screen.getByLabelText('Header 3')).toBeTruthy();
  });

  it('inserts tabular LaTeX on confirm', async () => {
    const oninsert = vi.fn();
    render(TableBuilder, { props: { oninsert, oncancel: noop } });

    await fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    const arg: string = oninsert.mock.calls[0][0];
    expect(arg).toContain('\\begin{tabular}');
    expect(arg).toContain('\\end{tabular}');
    expect(arg).toContain('\\hline');
  });

  it('switches to booktabs style and inserts booktabs LaTeX', async () => {
    const oninsert = vi.fn();
    render(TableBuilder, { props: { oninsert, oncancel: noop } });

    const styleSelect = screen.getByLabelText('Style');
    await fireEvent.change(styleSelect, { target: { value: 'booktabs' } });

    await waitFor(() => {
      const preview = document.querySelector('.preview-code');
      expect(preview?.textContent).toContain('\\toprule');
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(oninsert.mock.calls[0][0]).toContain('\\toprule');
  });

  it('adds columns when column count is increased', async () => {
    render(TableBuilder, { props: { oninsert: noop, oncancel: noop } });

    const colInput = screen.getByLabelText('Columns');
    await fireEvent.change(colInput, { target: { value: '5' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Header 5')).toBeTruthy();
    });
  });

  it('removes columns when column count is decreased', async () => {
    render(TableBuilder, { props: { oninsert: noop, oncancel: noop } });

    const colInput = screen.getByLabelText('Columns');
    await fireEvent.change(colInput, { target: { value: '1' } });

    await waitFor(() => {
      expect(screen.queryByLabelText('Header 2')).toBeNull();
    });
  });

  it('adds data rows when row count is increased', async () => {
    render(TableBuilder, { props: { oninsert: noop, oncancel: noop } });

    const rowInput = screen.getByLabelText('Rows');
    await fireEvent.change(rowInput, { target: { value: '4' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Row 4, column 1')).toBeTruthy();
    });
  });

  it('removes data rows when row count is decreased', async () => {
    render(TableBuilder, { props: { oninsert: noop, oncancel: noop } });

    const rowInput = screen.getByLabelText('Rows');
    await fireEvent.change(rowInput, { target: { value: '1' } });

    await waitFor(() => {
      expect(screen.queryByLabelText('Row 2, column 1')).toBeNull();
    });
  });

  it('updates alignment and reflects it in the preview', async () => {
    const oninsert = vi.fn();
    render(TableBuilder, { props: { oninsert, oncancel: noop } });

    const alignSelects = screen.getAllByLabelText(/Column \d+ alignment/);
    // Change first column to right-aligned.
    await fireEvent.change(alignSelects[0], { target: { value: 'r' } });

    await fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    const arg: string = oninsert.mock.calls[0][0];
    expect(arg).toMatch(/\\begin\{tabular\}\{r/);
  });

  it('updates cell content via oninput', async () => {
    render(TableBuilder, { props: { oninsert: noop, oncancel: noop } });

    const cell = screen.getByLabelText('Row 1, column 1');
    await fireEvent.input(cell, { target: { value: 'foo' } });
    expect((cell as HTMLInputElement).value).toBe('foo');
  });

  it('updates header content via oninput', async () => {
    render(TableBuilder, { props: { oninsert: noop, oncancel: noop } });

    const header = screen.getByLabelText('Header 1');
    await fireEvent.input(header, { target: { value: 'Name' } });
    expect((header as HTMLInputElement).value).toBe('Name');
  });

  it('calls oncancel when Cancel is clicked', async () => {
    const oncancel = vi.fn();
    render(TableBuilder, { props: { oninsert: noop, oncancel } });

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(oncancel).toHaveBeenCalledOnce();
  });

  it('calls oncancel when Escape is pressed', async () => {
    const oncancel = vi.fn();
    render(TableBuilder, { props: { oninsert: noop, oncancel } });

    const dialog = screen.getByRole('dialog');
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(oncancel).toHaveBeenCalledOnce();
  });

  it('does not cancel on non-Escape keys', async () => {
    const oncancel = vi.fn();
    render(TableBuilder, { props: { oninsert: noop, oncancel } });

    const dialog = screen.getByRole('dialog');
    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(oncancel).not.toHaveBeenCalled();
  });
});
