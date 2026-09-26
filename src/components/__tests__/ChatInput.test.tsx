/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatInput } from '../ChatInput';

void React;
afterEach(cleanup);

describe('ChatInput attachments', () => {
  it('hides unsafe attachment intake and refuses pasted files while text chat remains usable', async () => {
    const onSend = vi.fn();
    const { container } = render(<ChatInput onSend={onSend} onAbort={vi.fn()} isGenerating={false} disabled={false} attachmentsEnabled={false} />);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    const textarea = screen.getByLabelText('Message', { selector: 'textarea' });
    fireEvent.paste(textarea, { clipboardData: { items: [{ kind: 'file', getAsFile: () => new File(['private'], 'private.pdf') }] } });
    expect((await screen.findByRole('alert')).textContent).toContain('local-only intake');
    expect(screen.queryByText('private.pdf')).toBeNull();
    fireEvent.change(textarea, { target: { value: 'ordinary chat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith('ordinary chat', undefined);
  });
  it('sends PDF attachments instead of dropping non-image files', async () => {
    const onSend = vi.fn();
    const { container } = render(
      <ChatInput
        onSend={onSend}
        onAbort={vi.fn()}
        isGenerating={false}
        disabled={false}
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pdf = new File(['%PDF-1.4'], 'first.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [pdf] } });

    await screen.findByText('first.pdf');
    fireEvent.change(screen.getByLabelText('Message', { selector: 'textarea' }), {
      target: { value: 'compare with prior agreement' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledOnce());
    expect(onSend).toHaveBeenCalledWith('compare with prior agreement', [
      expect.objectContaining({
        file: pdf,
        fileName: 'first.pdf',
        mimeType: 'application/pdf',
      }),
    ]);
  });
});
