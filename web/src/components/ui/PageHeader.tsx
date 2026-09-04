import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  /** Chips o contadores que acompañan al título. */
  badge?: ReactNode;
  /** Botones de acción; se apilan bajo el título en teléfonos. */
  actions?: ReactNode;
  description?: ReactNode;
}

/** Encabezado de página que apila título y acciones en pantallas pequeñas. */
export function PageHeader({ title, badge, actions, description }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold text-sf-text sm:text-2xl">
          <span className="truncate">{title}</span>
          {badge}
        </h2>
        {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
    </div>
  );
}
