import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../components/ui/Modal';
import { useConfirm } from '../components/ui/ConfirmDialog';

function ConfirmHarness({ onResult }: { onResult: (value: boolean) => void }) {
  const { confirm, confirmDialog } = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={async () => onResult(await confirm({ title: '¿Eliminar producto?', message: 'No se puede deshacer', confirmLabel: 'Eliminar', danger: true }))}
      >
        Abrir
      </button>
      {confirmDialog}
    </>
  );
}

describe('Modal', () => {
  it('renders nothing when closed and a labelled dialog when open', () => {
    const { rerender } = render(<Modal open={false} onClose={() => {}} title="Editar">contenido</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<Modal open onClose={() => {}} title="Editar">contenido</Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Editar' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('contenido')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('closes with Escape and the close button, and restores body scroll', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<Modal open onClose={onClose} title="Editar">contenido</Modal>);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('does not close a non-dismissible modal with Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Modal open onClose={onClose} title="Procesando" dismissible={false}>espera</Modal>);

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
  });
});

describe('useConfirm', () => {
  it('resolves true when confirmed and false when cancelled', async () => {
    const onResult = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmHarness onResult={onResult} />);

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Eliminar producto?' });
    expect(dialog).toHaveTextContent('No se puede deshacer');
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(true));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(false));
  });
});
