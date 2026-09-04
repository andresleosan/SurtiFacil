import { useEffect, useMemo, useState } from 'react';
import { CreditCustomer, CreditEntry, CreditEntryType } from '../firebase/db';
import { useCreditCustomers } from '../hooks/useCreditCustomers';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useCurrentUser, useHasRole } from '../auth/CurrentUserContext';
import {
  addCreditCustomer,
  addCreditEntry,
  getCreditEntries,
  parseAmountToCents,
  updateCreditCustomer,
} from '../services/creditService';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';

const formatMoney = (cents: number) => `$${(cents / 100).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatDate = (value: any) => {
  if (!value) return '';
  try {
    const date = value.toDate ? value.toDate() : new Date(value);
    return date.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

interface CustomerForm {
  name: string;
  phone: string;
  notes: string;
  active: boolean;
}

const EMPTY_FORM: CustomerForm = { name: '', phone: '', notes: '', active: true };

const Credits = () => {
  const { customers, loading, error: loadError } = useCreditCustomers();
  const isMobile = useIsMobile();
  const currentUser = useCurrentUser();
  const canManage = useHasRole(['admin', 'manager']);

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<CreditCustomer | 'new' | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const selected = customers.find((customer) => customer.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((customer) => {
      if (!showInactive && !customer.active) return false;
      if (!term) return true;
      return customer.name.toLowerCase().includes(term) || (customer.phone || '').includes(term);
    });
  }, [customers, search, showInactive]);

  const totalOwed = useMemo(
    () => customers.filter((customer) => customer.active).reduce((sum, customer) => sum + customer.balance_cents, 0),
    [customers],
  );
  const debtorCount = customers.filter((customer) => customer.active && customer.balance_cents > 0).length;

  const openForm = (target: CreditCustomer | 'new') => {
    setForm(target === 'new'
      ? EMPTY_FORM
      : { name: target.name, phone: target.phone || '', notes: target.notes || '', active: target.active });
    setFormError('');
    setFormTarget(target);
  };

  const handleSaveCustomer = async () => {
    if (!formTarget) return;
    setSaving(true);
    setFormError('');
    try {
      if (formTarget === 'new') {
        const created = await addCreditCustomer({ name: form.name, phone: form.phone, notes: form.notes });
        setSelectedId(created.id);
      } else {
        await updateCreditCustomer(formTarget.id, { name: form.name, phone: form.phone, notes: form.notes, active: form.active });
      }
      setFormTarget(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar el cliente');
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <PageHeader
      title="Fiados"
      badge={debtorCount > 0 ? <span className="chip bg-red-500 text-white">{debtorCount} con deuda</span> : null}
      description={`Deuda total pendiente: ${formatMoney(totalOwed)}`}
      actions={
        canManage && !isMobile ? (
          <button type="button" onClick={() => openForm('new')} className="btn-primary">
            <Icon name="plus" size={18} />
            Nuevo cliente
          </button>
        ) : undefined
      }
    />
  );

  if (loading && customers.length === 0) {
    return (
      <section className="space-y-4">
        {header}
        <div className="py-8 text-center text-gray-500">Cargando fiados...</div>
      </section>
    );
  }

  if (loadError && customers.length === 0) {
    return (
      <section className="space-y-4">
        {header}
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{loadError}</div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {header}

      {(actionError || loadError) && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError || loadError}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <label htmlFor="credits-search" className="sr-only">Buscar cliente por nombre o teléfono</label>
          <input
            id="credits-search"
            type="search"
            inputMode="search"
            placeholder="Buscar cliente por nombre o teléfono"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="input pl-10"
          />
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="h-5 w-5" />
          Mostrar inactivos
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="card py-8 text-center text-gray-500">
          {customers.length === 0 ? 'Aún no hay clientes con fiado' : 'No hay resultados para tu búsqueda'}
        </div>
      ) : isMobile ? (
        <ul className="space-y-2" aria-label="Clientes de fiado">
          {filtered.map((customer) => (
            <li key={customer.id} className="card">
              <button
                type="button"
                onClick={() => setSelectedId(customer.id)}
                className="flex w-full items-center gap-3 p-3 text-left"
                aria-label={`Ver ${customer.name}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sf-text">
                    {customer.name}
                    {!customer.active && <span className="chip ml-2 bg-gray-200 text-gray-600">Inactivo</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {customer.phone || 'Sin teléfono'}
                    {customer.last_entry_at && ` · ${formatDate(customer.last_entry_at)}`}
                  </p>
                </div>
                <span className={`font-semibold ${customer.balance_cents > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatMoney(customer.balance_cents)}
                </span>
                <Icon name="chevron-right" className="text-gray-400" size={18} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-sf-primary text-white">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Cliente</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Teléfono</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Último movimiento</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Deuda</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((customer) => (
                <tr key={customer.id} className="transition hover:bg-sf-light">
                  <td className="px-4 py-3 text-sm font-medium text-sf-text">
                    {customer.name}
                    {!customer.active && <span className="chip ml-2 bg-gray-200 text-gray-600">Inactivo</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{customer.phone || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{customer.last_entry_at ? formatDate(customer.last_entry_at) : '-'}</td>
                  <td className={`px-4 py-3 text-right text-sm font-semibold ${customer.balance_cents > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatMoney(customer.balance_cents)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex justify-center gap-1">
                      <button type="button" onClick={() => setSelectedId(customer.id)} className="btn-secondary min-h-[40px] px-3 text-xs">
                        Ver movimientos
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => openForm(customer)}
                          aria-label={`Editar ${customer.name}`}
                          className="icon-btn h-10 w-10 text-sf-primary hover:bg-sf-light"
                        >
                          <Icon name="pencil" size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && isMobile && (
        <button
          type="button"
          onClick={() => openForm('new')}
          aria-label="Nuevo cliente"
          className="fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-sf-primary text-white shadow-lg transition hover:bg-sf-dark bottom-tabbar mb-4"
        >
          <Icon name="plus" size={26} />
        </button>
      )}

      {selected && currentUser && (
        <CustomerDetail
          customer={selected}
          actor={{ uid: currentUser.id, role: currentUser.role }}
          canManage={canManage}
          onClose={() => setSelectedId(null)}
          onEdit={() => openForm(selected)}
          onError={setActionError}
        />
      )}

      <Modal
        open={formTarget !== null}
        onClose={() => setFormTarget(null)}
        title={formTarget === 'new' ? 'Nuevo cliente de fiado' : 'Editar cliente'}
        footer={
          <>
            <button type="button" onClick={() => setFormTarget(null)} className="btn-secondary">Cancelar</button>
            <button type="submit" form="credit-customer-form" disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <form
          id="credit-customer-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSaveCustomer();
          }}
        >
          {formError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
          )}
          <div>
            <label htmlFor="credit-name" className="mb-1 block text-sm font-medium text-gray-700">Nombre *</label>
            <input id="credit-name" type="text" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="credit-phone" className="mb-1 block text-sm font-medium text-gray-700">Teléfono</label>
            <input id="credit-phone" type="tel" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="input" />
          </div>
          <div>
            <label htmlFor="credit-notes" className="mb-1 block text-sm font-medium text-gray-700">Notas</label>
            <textarea id="credit-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} className="input min-h-[80px] py-2" />
          </div>
          {formTarget !== 'new' && (
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-5 w-5" />
              Cliente activo (puede fiar)
            </label>
          )}
        </form>
      </Modal>
    </section>
  );
};

interface CustomerDetailProps {
  customer: CreditCustomer;
  actor: { uid: string; role: CreditCustomer extends never ? never : import('../firebase/db').UserRole };
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onError: (message: string) => void;
}

function CustomerDetail({ customer, actor, canManage, onClose, onEdit, onError }: CustomerDetailProps) {
  const [entries, setEntries] = useState<CreditEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [entryType, setEntryType] = useState<CreditEntryType | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [entryError, setEntryError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingEntries(true);
    getCreditEntries(customer.id)
      .then((loaded) => { if (!cancelled) setEntries(loaded); })
      .catch((error: unknown) => { if (!cancelled) onError(error instanceof Error ? error.message : 'Error al cargar los movimientos'); })
      .finally(() => { if (!cancelled) setLoadingEntries(false); });
    return () => { cancelled = true; };
  }, [customer.id, customer.balance_cents, onError]);

  const startEntry = (type: CreditEntryType) => {
    setEntryType(type);
    setAmount('');
    setDescription('');
    setEntryError('');
  };

  const handleSubmitEntry = async () => {
    if (!entryType) return;
    const cents = parseAmountToCents(amount);
    if (cents === null) {
      setEntryError('Ingresa un monto válido mayor a 0');
      return;
    }
    if (entryType === 'payment' && cents > customer.balance_cents) {
      setEntryError(`El abono supera la deuda pendiente (${formatMoney(customer.balance_cents)})`);
      return;
    }
    setSubmitting(true);
    setEntryError('');
    try {
      const created = await addCreditEntry(customer.id, { type: entryType, amount_cents: cents, description }, actor);
      setEntries((current) => [created, ...current]);
      setEntryType(null);
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : 'Error al registrar el movimiento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={customer.name}
      size="lg"
      headerActions={canManage ? (
        <button type="button" onClick={onEdit} aria-label={`Editar ${customer.name}`} className="icon-btn text-sf-primary hover:bg-sf-light">
          <Icon name="pencil" size={20} />
        </button>
      ) : undefined}
    >
      <div className="space-y-4">
        <div className="card flex items-center justify-between p-4">
          <div>
            <p className="text-sm text-gray-600">Deuda pendiente</p>
            <p className={`text-2xl font-bold ${customer.balance_cents > 0 ? 'text-red-600' : 'text-green-600'}`} aria-live="polite">
              {formatMoney(customer.balance_cents)}
            </p>
            {customer.phone && <p className="text-xs text-gray-500">{customer.phone}</p>}
          </div>
          {!customer.active && <span className="chip bg-gray-200 text-gray-600">Inactivo</span>}
        </div>

        {customer.notes && <p className="text-sm text-gray-600">{customer.notes}</p>}

        {entryType === null ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => startEntry('debt')} disabled={!customer.active} className="btn-danger">
              <Icon name="plus" size={18} />
              Anotar fiado
            </button>
            <button type="button" onClick={() => startEntry('payment')} disabled={customer.balance_cents <= 0} className="btn-success">
              <Icon name="check" size={18} />
              Registrar abono
            </button>
          </div>
        ) : (
          <form
            className="card space-y-3 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmitEntry();
            }}
          >
            <h3 className="font-semibold text-sf-text">{entryType === 'debt' ? 'Anotar fiado' : 'Registrar abono'}</h3>
            {entryError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{entryError}</div>
            )}
            <div>
              <label htmlFor="entry-amount" className="mb-1 block text-sm font-medium text-gray-700">Monto ($)</label>
              <input
                id="entry-amount"
                type="text"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Ej: 12500"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="entry-description" className="mb-1 block text-sm font-medium text-gray-700">Descripción</label>
              <input
                id="entry-description"
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={entryType === 'debt' ? 'Ej: Mercado del sábado' : 'Ej: Abono en efectivo'}
                className="input"
              />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setEntryType(null)} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={submitting} className={entryType === 'debt' ? 'btn-danger' : 'btn-success'}>
                {submitting ? 'Guardando...' : entryType === 'debt' ? 'Guardar fiado' : 'Guardar abono'}
              </button>
            </div>
          </form>
        )}

        <div>
          <h3 className="mb-2 font-semibold text-sf-text">Movimientos</h3>
          {loadingEntries ? (
            <p className="py-4 text-center text-sm text-gray-500">Cargando movimientos...</p>
          ) : entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">Sin movimientos todavía</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" aria-label="Movimientos">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
                  <span className={`chip ${entry.type === 'debt' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {entry.type === 'debt' ? 'Fiado' : 'Abono'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-sf-text">{entry.description || (entry.sale_id ? 'Venta fiada' : 'Sin descripción')}</p>
                    <p className="text-xs text-gray-500">{formatDate(entry.createdAt)}{entry.sale_id ? ` · venta ${entry.sale_id.slice(0, 8)}` : ''}</p>
                  </div>
                  <span className={`text-sm font-semibold ${entry.type === 'debt' ? 'text-red-600' : 'text-green-600'}`}>
                    {entry.type === 'debt' ? '+' : '-'}{formatMoney(entry.amount_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default Credits;
