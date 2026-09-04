const express = require('express');
const { FieldValue } = require('firebase-admin/firestore');
const { getSafeApiError, getSafeApiLogMessage } = require('./apiErrorContract');
const { createRateLimiter } = require('./userProvisioning');
const {
  createAuthenticatedRateLimitMiddleware,
  createFirebaseActiveRoleMiddleware,
} = require('./whatsappAdminRoutes');

const PAYMENT_METHODS = new Set(['cash', 'card', 'other', 'credit']);
const MAX_CREDIT_CUSTOMER_ID_LENGTH = 128;
const MAX_SALE_ITEMS = 20;
const MAX_ITEM_QUANTITY = 1_000;
const MAX_PRODUCT_ID_LENGTH = 128;
const MAX_CATEGORY_LENGTH = 100;
const ACTIVE_ROLES = new Set(['admin', 'manager', 'cashier']);
const COST_SOURCES = new Set(['purchase', 'fallback_price']);
const UNCATEGORIZED = 'Sin categor\u00eda';

function sendApiError(res, status, code = 'internal') {
  return res.status(status).json(getSafeApiError(code));
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys.slice().sort()[index]);
}

function validateSaleRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (typeof body.payment_method !== 'string' || !PAYMENT_METHODS.has(body.payment_method)) return false;
  if (body.payment_method === 'credit') {
    // Una venta fiada exige el cliente al que se le anota la deuda.
    if (!hasExactKeys(body, ['items', 'payment_method', 'credit_customer_id'])) return false;
    if (
      typeof body.credit_customer_id !== 'string'
      || body.credit_customer_id.trim().length === 0
      || body.credit_customer_id.length > MAX_CREDIT_CUSTOMER_ID_LENGTH
    ) return false;
  } else if (!hasExactKeys(body, ['items', 'payment_method'])) {
    return false;
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_SALE_ITEMS) return false;

  const ids = new Set();
  return body.items.every((item) => {
    if (!hasExactKeys(item, ['product_id', 'quantity'])) return false;
    if (
      typeof item.product_id !== 'string'
      || item.product_id.trim().length === 0
      || item.product_id.length > MAX_PRODUCT_ID_LENGTH
      || !Number.isInteger(item.quantity)
      || item.quantity <= 0
      || item.quantity > MAX_ITEM_QUANTITY
      || ids.has(item.product_id)
    ) return false;
    ids.add(item.product_id);
    return true;
  });
}

function createSalesRateLimiter() {
  return createRateLimiter({ limit: 30, windowMs: 60_000, maxEntries: 1_000 });
}

function resolveProductFinancialSnapshot(product) {
  if (product.category != null && typeof product.category !== 'string') {
    throw new Error('Invalid product category');
  }
  const category = product.category?.trim() || UNCATEGORIZED;
  if (category.length > MAX_CATEGORY_LENGTH) throw new Error('Invalid product category');

  if (product.last_cost_cents != null) {
    if (!Number.isSafeInteger(product.last_cost_cents) || product.last_cost_cents < 0) {
      throw new Error('Invalid product cost');
    }
    if (product.last_cost_source != null && !COST_SOURCES.has(product.last_cost_source)) {
      throw new Error('Invalid product cost source');
    }
    const costSource = product.last_cost_source || 'purchase';
    return {
      category,
      unit_cost_cents: product.last_cost_cents,
      cost_source: costSource,
      cost_is_estimated: costSource === 'fallback_price',
    };
  }

  return {
    category,
    unit_cost_cents: Math.floor(product.price_cents / 2),
    cost_source: 'fallback_price',
    cost_is_estimated: true,
  };
}

function createSalesHandler({ admin, db }) {
  const serverTimestamp = () => admin.firestore?.FieldValue?.serverTimestamp?.()
    ?? FieldValue.serverTimestamp();

  return async function createSale(req, res) {
    if (!validateSaleRequest(req.body)) return sendApiError(res, 400, 'badRequest');
    const actorUid = req.authContext?.uid;
    const actorRole = req.authContext?.role;
    if (
      typeof actorUid !== 'string'
      || actorUid.length === 0
      || actorUid.length > 128
      || !ACTIVE_ROLES.has(actorRole)
    ) return sendApiError(res, 401, 'unauthorized');

    try {
      const saleId = await db.runTransaction(async (transaction) => {
        const authoritativeItems = [];
        const isCreditSale = req.body.payment_method === 'credit';
        let creditCustomerRef = null;
        let creditCustomer = null;

        if (isCreditSale) {
          creditCustomerRef = db.collection('credit_customers').doc(req.body.credit_customer_id);
          const customerSnapshot = await transaction.get(creditCustomerRef);
          if (!customerSnapshot.exists) {
            const error = new Error('Credit customer not found');
            error.code = 'creditCustomerNotFound';
            throw error;
          }
          creditCustomer = customerSnapshot.data();
          if (
            typeof creditCustomer?.name !== 'string'
            || creditCustomer.name.trim().length === 0
            || (creditCustomer.balance_cents != null && !Number.isSafeInteger(creditCustomer.balance_cents))
          ) {
            throw new Error('Invalid credit customer data');
          }
          if (creditCustomer.active !== true) {
            const error = new Error('Credit customer inactive');
            error.code = 'creditCustomerInactive';
            throw error;
          }
        }

        for (const requestedItem of req.body.items) {
          const productRef = db.collection('products').doc(requestedItem.product_id);
          const productSnapshot = await transaction.get(productRef);
          if (!productSnapshot.exists) {
            const error = new Error('Product not found');
            error.code = 'productNotFound';
            throw error;
          }

          const product = productSnapshot.data();
          if (
            typeof product?.name !== 'string'
            || product.name.trim().length === 0
            || !Number.isSafeInteger(product.price_cents)
            || product.price_cents < 0
            || !Number.isSafeInteger(product.stock)
            || product.stock < 0
            || !Number.isSafeInteger(product.price_cents * requestedItem.quantity)
          ) {
            throw new Error('Invalid product data');
          }
          if (requestedItem.quantity > product.stock) {
            const error = new Error('Insufficient stock');
            error.code = 'insufficientStock';
            throw error;
          }

          const financialSnapshot = resolveProductFinancialSnapshot(product);
          const costSubtotal = financialSnapshot.unit_cost_cents * requestedItem.quantity;
          if (!Number.isSafeInteger(costSubtotal)) throw new Error('Sale cost is out of range');

          authoritativeItems.push({
            ref: productRef,
            product_id: productSnapshot.id,
            product_name: product.name,
            price_cents: product.price_cents,
            stock: product.stock,
            quantity: requestedItem.quantity,
            subtotal: product.price_cents * requestedItem.quantity,
            ...financialSnapshot,
            cost_subtotal_cents: costSubtotal,
          });
        }

        const timestamp = serverTimestamp();
        const saleRef = db.collection('sales').doc();
        const items = authoritativeItems.map(({ ref, stock, ...item }) => item);
        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
        if (!Number.isSafeInteger(total)) throw new Error('Sale total is out of range');
        const totalCost = items.reduce((sum, item) => sum + item.cost_subtotal_cents, 0);
        if (!Number.isSafeInteger(totalCost)) throw new Error('Sale cost total is out of range');

        transaction.set(saleRef, {
          date: timestamp,
          createdAt: timestamp,
          schema_version: 2,
          created_by_uid: actorUid,
          created_by_role: actorRole,
          total,
          total_cost_cents: totalCost,
          payment_method: req.body.payment_method,
          items,
          ...(isCreditSale
            ? { credit_customer_id: creditCustomerRef.id, credit_customer_name: creditCustomer.name }
            : {}),
        });
        for (const item of authoritativeItems) {
          transaction.update(item.ref, { stock: item.stock - item.quantity });
        }

        if (isCreditSale) {
          // La deuda se anota con el total autoritativo de la venta, en la misma transaccion.
          const currentBalance = creditCustomer.balance_cents ?? 0;
          const nextBalance = currentBalance + total;
          if (!Number.isSafeInteger(nextBalance)) throw new Error('Credit balance is out of range');
          const entryRef = db.collection('credit_entries').doc();
          transaction.set(entryRef, {
            customer_id: creditCustomerRef.id,
            type: 'debt',
            amount_cents: total,
            description: 'Venta fiada',
            sale_id: saleRef.id,
            created_by_uid: actorUid,
            created_by_role: actorRole,
            createdAt: timestamp,
          });
          transaction.update(creditCustomerRef, {
            balance_cents: nextBalance,
            updatedAt: timestamp,
            last_entry_at: timestamp,
          });
        }

        return saleRef.id;
      });

      return res.status(201).json({ saleId });
    } catch (error) {
      if (error?.code === 'productNotFound' || error?.code === 'creditCustomerNotFound') return sendApiError(res, 404, 'notFound');
      if (error?.code === 'insufficientStock' || error?.code === 'creditCustomerInactive') return sendApiError(res, 400, 'badRequest');
      console.error(getSafeApiLogMessage('Sale creation'));
      return sendApiError(res, 500);
    }
  };
}

function createSalesRouter({ admin, db, rateLimiter = createSalesRateLimiter() }) {
  const router = express.Router();
  const requireActiveRole = createFirebaseActiveRoleMiddleware({ admin, db });
  const limitSales = createAuthenticatedRateLimitMiddleware({ route: 'sales-create', rateLimiter });
  router.post('/create', requireActiveRole, limitSales, createSalesHandler({ admin, db }));
  return router;
}

module.exports = {
  MAX_ITEM_QUANTITY,
  MAX_SALE_ITEMS,
  createSalesHandler,
  createSalesRateLimiter,
  createSalesRouter,
  resolveProductFinancialSnapshot,
  validateSaleRequest,
};
