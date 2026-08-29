# Task 18 - Integridad financiera historica de ventas

**Fecha:** 2026-08-28  
**Estado:** Aprobada

## Problema

Los reportes de margen calculan el costo y la categoria de una venta usando el documento actual de
`products`. Cambiar hoy el costo o la categoria de un producto modifica retrospectivamente el
resultado de ventas ya cerradas.

## Contrato de datos v2

Cada venta nueva se escribe solo desde el backend, dentro de la misma transaccion que descuenta
stock. Todos los importes son enteros seguros expresados en centavos.

Campos nuevos de `sales/{saleId}`:

- `schema_version: 2`.
- `created_by_uid`: UID autenticado validado por Firebase Admin y por el documento activo del usuario.
- `created_by_role`: rol autoritativo leido del documento del usuario (`admin`, `manager` o `cashier`).
- `total_cost_cents`: suma de `cost_subtotal_cents` de los items.
- `date` y `createdAt`: el mismo timestamp server-side usado por el backend.

Snapshot inmutable por item:

- `product_id`, `product_name`, `quantity`, `price_cents`, `subtotal`.
- `unit_cost_cents`: costo unitario al momento de vender.
- `cost_subtotal_cents`: `unit_cost_cents * quantity`.
- `cost_source`: `purchase` si existe un ultimo costo valido; `fallback_price` si se estima desde
  `floor(price_cents / 2)`.
- `cost_is_estimated`: indica explicitamente si el costo es estimado.
- `category`: categoria al vender; usa `Sin categoria` si el producto no tiene una valida.

Las reglas de Firestore mantienen las ventas legibles para usuarios activos, pero niegan create,
update y delete desde clientes. Admin SDK es la unica ruta de escritura y no se agregan endpoints de
edicion: el snapshot financiero queda inmutable.

## Compatibilidad y migracion

La migracion es **aditiva y no destructiva**:

1. Las ventas v2 empiezan a guardar los campos nuevos; no se reescriben ventas existentes.
2. Los reportes dejan de consultar `products` para calcular margenes historicos.
3. Para un item legacy sin `unit_cost_cents`, el costo estimado es
   `floor(item.price_cents / 2)` y se marca como estimado.
4. Para un item legacy sin categoria se usa `Sin categoria`; no se toma la categoria actual.
5. Un backfill exacto solo es posible si existe una fuente historica verificable de costos y
   categorias para la fecha de cada venta.

### Datos no recuperables

Si una venta legacy no tiene historial externo de compras/costos, su costo real y categoria original
no pueden reconstruirse. Copiar el costo actual del producto falsificaria el historico y queda
prohibido. Esas ventas permanecen visibles con costo estimado y categoria desconocida.

No se requiere indice nuevo: las lecturas existentes siguen usando la coleccion `sales` y el cambio
solo agrega campos embebidos.

## Rollback

No se aplicara ninguna migracion remota en esta tarea.

1. Revertir backend y frontend a la version anterior si las pruebas fallan.
2. No borrar los campos v2 ya escritos: son aditivos y clientes anteriores los ignoran.
3. Restaurar las reglas anteriores solo si fuera imprescindible recuperar edicion directa; hacerlo
   reabre el riesgo de alterar el historico y requiere una decision operativa explicita.
4. Si en el futuro se autoriza un backfill, crear antes un export verificado de Firestore, ejecutar
   por lotes idempotentes y conservar un manifiesto `saleId -> valor anterior` para rollback.

## Verificacion prevista

- Contrato backend con costos/categoria autoritativos, actor y timestamps server-side.
- Costo faltante, costo cero, datos invalidos, overflow y redondeo entero.
- Cambio posterior del producto sin cambio del margen historico.
- Venta legacy estimada sin consultar el costo/categoria actual.
- Concurrencia de stock y snapshot en la misma transaccion.
- Reglas: clientes pueden leer ventas, pero ningun rol puede crearlas, editarlas o borrarlas.
- Emulador Firestore para persistencia real del snapshot v2.

## Implementacion completada

- El backend crea ventas con `schema_version: 2`, snapshot de costo y categoria, costo total, actor
  autoritativo y timestamps server-side dentro de la misma transaccion que descuenta inventario.
- El cliente solo envia identificadores, cantidades y medio de pago; no controla costos, categorias
  ni identidad del actor.
- Las reglas niegan `create`, `update` y `delete` de ventas desde clientes. Admin SDK conserva la
  unica ruta de escritura.
- Margenes y reportes usan exclusivamente el snapshot de cada item. Las ventas legacy usan un
  fallback determinista basado en su propio precio historico, nunca en el producto actual.
- El modo mock replica el contrato v2 para mantener coherencia durante desarrollo y pruebas.

## Evidencia de verificacion

| Verificacion | Resultado |
|---|---|
| Backend completo (`npm test`) | 68/68 pruebas pasan |
| Frontend completo (`npm test`) | 200/200 pruebas pasan |
| Build de produccion (`npm run build`) | Pasa; solo conserva advertencias de chunks ya registradas para Task 21 |
| Reglas en Firebase Emulator | Pasa con Java 21; crear, editar y borrar ventas desde cliente queda denegado |
| Transaccion de ventas en Emulator | Pasa; persiste snapshot v2, actor y costo total junto al descuento de stock |
| Imagen Docker `surtifacil-backend:local` | Build reproducible pasa |
| Higiene del diff (`git diff --check`) | Pasa; solo advertencias de conversion LF/CRLF |

Los casos cubren costo valido, costo cero, costo faltante, datos invalidos, overflow, redondeo
entero, ventas legacy, cambios posteriores del producto y concurrencia sobre stock.

## Autocritica de seguridad y QA

- Autenticacion y autorizacion: el UID proviene del token verificado y el rol del documento activo
  del usuario, no del cuerpo de la solicitud.
- Integridad: costos, categorias, nombres y precios se resuelven en servidor; se validan enteros
  seguros y multiplicaciones antes de escribir.
- Atomicidad: stock y snapshot financiero se confirman o revierten juntos.
- Privacidad y logs: no se agregaron secretos ni valores financieros a logs de error.
- Dependencias: no se incorporaron paquetes. Los hallazgos transitivos conocidos siguen aislados
  en Task 23 y no fueron modificados mediante actualizaciones forzadas.
- Resultado: sin hallazgos criticos abiertos. No se ejecuto backfill, migracion remota, despliegue
  ni operacion con costo.
