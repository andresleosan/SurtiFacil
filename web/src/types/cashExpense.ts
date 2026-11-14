export type CashExpenseCategory =
  | 'proveedor_contado'
  | 'insumos_bolsas'
  | 'domicilios_transporte'
  | 'servicios_aseo'
  | 'alimentacion_turno'
  | 'otro';

export type CashExpensePaymentMethod = 'cash' | 'transfer';

export interface CashExpense {
  id: string;
  negocio_id: string;
  category: CashExpenseCategory;
  description: string;
  beneficiary?: string | null;
  amount_cents: number;
  payment_method: CashExpensePaymentMethod;
  created_by_uid: string;
  created_by_name?: string;
  created_at: string;
}

export interface CashExpenseInput {
  category: CashExpenseCategory;
  description: string;
  beneficiary?: string;
  amount_cents: number;
  payment_method?: CashExpensePaymentMethod;
}

export interface ExpenseCategoryMeta {
  id: CashExpenseCategory;
  label: string;
  emoji: string;
  placeholder: string;
}

export const EXPENSE_CATEGORIES: readonly ExpenseCategoryMeta[] = [
  {
    id: 'proveedor_contado',
    label: 'Proveedor Contado',
    emoji: '🥖',
    placeholder: 'Ej: Pago de panadería y arepas del día',
  },
  {
    id: 'insumos_bolsas',
    label: 'Bolsas e Insumos',
    emoji: '🛍️',
    placeholder: 'Ej: Compra de bolsas plásticas y rollos térmicos',
  },
  {
    id: 'domicilios_transporte',
    label: 'Domicilios / Transporte',
    emoji: '🛵',
    placeholder: 'Ej: Gasolina o pago a domiciliario del turno',
  },
  {
    id: 'servicios_aseo',
    label: 'Aseo y Servicios',
    emoji: '🧹',
    placeholder: 'Ej: Cloro, trapero o recarga de servicios',
  },
  {
    id: 'alimentacion_turno',
    label: 'Almuerzo / Turno',
    emoji: '🍲',
    placeholder: 'Ej: Refrigerio o almuerzo de cajero en turno',
  },
  {
    id: 'otro',
    label: 'Otro Gasto',
    emoji: '📝',
    placeholder: 'Ej: Gasto menor imprevisto de mostrador',
  },
];

export function getExpenseCategoryMeta(category: string): ExpenseCategoryMeta {
  return EXPENSE_CATEGORIES.find((c) => c.id === category) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}
