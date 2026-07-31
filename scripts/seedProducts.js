#!/usr/bin/env node
// Minimal seeding script for products. Requires firebase-admin and a Service Account.
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('\nERROR: Set the environment variable GOOGLE_APPLICATION_CREDENTIALS to the path of your service account JSON.\nExample (PowerShell): $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\to\\serviceAccount.json"\n');
  process.exit(1);
}

let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.error('ERROR: Missing dependency `firebase-admin`. Install it with: npm install firebase-admin');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

const db = admin.firestore();

const products = [
  { id: 'p1', name: 'Manzana Roja', price_cents: 250, stock: 45, category: 'Frutas' },
  { id: 'p2', name: 'Pan Integral', price_cents: 150, stock: 78, category: 'Panadería' },
  { id: 'p3', name: 'Leche Entera 1L', price_cents: 350, stock: 32, category: 'Lácteos' },
  { id: 'p4', name: 'Queso Cheddar', price_cents: 650, stock: 12, category: 'Lácteos' },
  { id: 'p5', name: 'Huevos (Docena)', price_cents: 280, stock: 24, category: 'Proteínas' },
  { id: 'p6', name: 'Yogur Natural', price_cents: 180, stock: 56, category: 'Lácteos' },
  { id: 'p7', name: 'Arroz 1kg', price_cents: 420, stock: 89, category: 'Granos' },
  { id: 'p8', name: 'Azúcar 1kg', price_cents: 380, stock: 67, category: 'Básicos' },
];

(async () => {
  console.log('Seeding products...');
  for (const p of products) {
    await db.collection('products').doc(p.id).set({
      name: p.name,
      price_cents: p.price_cents,
      stock: p.stock,
      category: p.category,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(' - seeded', p.id, '-', p.name);
  }
  console.log('Products seeded successfully.');
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
