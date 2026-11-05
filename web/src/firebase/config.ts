import { initializeApp, getApps, getApp } from 'firebase/app';

// Configuración de Firebase - Exclusivo para Firebase Auth
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaMockKeyForPreviewTestingOnly12345678',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'surtifacilapp.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'surtifacilapp',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'surtifacilapp.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '595703512941',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:595703512941:web:mockappidpreview',
};

// Inicializar Firebase exclusivamente para Firebase Authentication si no está inicializado
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export default app;
