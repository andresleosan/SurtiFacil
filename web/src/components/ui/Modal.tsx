import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Botones de acción fijos al pie del modal. */
  footer?: ReactNode;
  /** Controles adicionales junto al botón de cerrar. */
  headerActions?: ReactNode;
  size?: ModalSize;
  /** Si es `false`, no se cierra con Escape ni tocando el fondo. */
  dismissible?: boolean;
  role?: 'dialog' | 'alertdialog';
  /** Quita el padding del cuerpo para listas a sangre. */
  flushBody?: boolean;
}

/**
 * Diálogo responsivo: hoja inferior (bottom sheet) en teléfonos y ventana
 * centrada desde `sm`. Bloquea el scroll del documento, cierra con Escape y
 * devuelve el foco al elemento que lo abrió.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  headerActions,
  size = 'md',
  dismissible = true,
  role = 'dialog',
  flushBody = false,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);
  // Los callbacks viven en refs para que el efecto solo dependa de `open`;
  // si dependiera de `onClose` (nueva función en cada render) robaría el foco
  // del campo activo en cada pulsación de tecla.
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const target = previouslyFocused.current;
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      data-testid="modal-backdrop"
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex w-full max-h-[92dvh] flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:max-h-[90vh] sm:rounded-2xl ${SIZE_CLASSES[size]}`}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-gray-300 sm:hidden" aria-hidden="true" />
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <h2 id={titleId} className="text-lg font-bold text-sf-text">
            {title}
          </h2>
          <div className="flex items-center gap-1">
            {headerActions}
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-sf-text"
              >
                <Icon name="close" />
              </button>
            )}
          </div>
        </header>
        <div className={`min-h-0 flex-1 overflow-y-auto ${flushBody ? '' : 'p-4 sm:p-6'}`}>{children}</div>
        {footer && (
          <footer className="flex flex-col-reverse gap-2 border-t border-gray-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
