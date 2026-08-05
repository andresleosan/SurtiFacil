# AGENTS.md - SurtiFácil Admin

## Project Overview

Supermarket/store management web app with WhatsApp integration. Firebase/Firestore backend, React frontend.

## Architecture

```
web/          → React 18 + TypeScript + Vite + Tailwind (ES Modules)
backend/      → Express.js WhatsApp webhook server (CommonJS)
scripts/      → Firebase seed scripts (CommonJS)
docs/         → Documentation (WhatsApp integration guides)
```

## Critical Commands

```powershell
# Development (both services)
npm run dev:all

# Frontend only (Vite, port 5173)
cd web && npm run dev

# Backend only (Express, port 3000)
npm run start:backend

# Seed database (requires Firebase service account)
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\serviceAccountKey.json'
npm run seed:all

# WhatsApp initialization check
npm run whatsapp:init
```

## Module System Warning

- `web/` uses **ES Modules** (`"type": "module"`)
- `backend/` uses **CommonJS** (`"type": "commonjs"`)
- Never mix import/require syntax across boundaries

## Environment Variables

**Root `.env`** (backend):
- `FIREBASE_SERVICE_ACCOUNT_PATH` - Path to Firebase service account JSON
- `WHATSAPP_API_TOKEN` - WhatsApp Business API bearer token
- `WHATSAPP_PHONE_NUMBER_ID` - WhatsApp phone number ID
- `WEBHOOK_VERIFY_TOKEN` - Webhook verification token
- `WHATSAPP_APP_SECRET` - WhatsApp webhook signing secret
- `ANTHROPIC_API_KEY` - Anthropic API key, backend-only
- `ADMIN_API_KEY` - Backend-only key for explicitly internal proxy routes

**`web/.env.local`** (frontend):
- `VITE_FIREBASE_*` - Firebase web config
- `VITE_BACKEND_URL` - Backend URL (default: http://localhost:3000)

Anthropic and WhatsApp credentials are backend-only. They must not use a `VITE_`
prefix or be exposed in the frontend bundle. The frontend authenticates user-facing
backend routes with Firebase ID-token Bearer authorization.

## Code Conventions

- Prices stored as `price_cents` (integer) in Firestore
- WhatsApp order detection uses regex pattern matching
- UI language: Spanish (component labels, documentation)
- Tailwind CSS for styling, no CSS modules

## Key Files

- `web/src/App.tsx` - Main app with page routing (no router library)
- `web/src/components/WhatsAppChat.tsx` - WhatsApp panel (~500 lines)
- `web/src/services/whatsappService.ts` - WhatsApp API service
- `backend/whatsapp-webhook.js` - Express webhook server
- `scripts/seedProducts.js` - Product seeding (Firebase)

## Testing

No test framework configured. If adding tests:
- Frontend: Vitest (Vite native)
- Backend: Jest or Node test runner

## Linting

No linter configured. If adding:
- ESLint + Prettier recommended
- TypeScript strict mode available in `web/tsconfig.json`

## Gotchas

- Backend requires Firebase service account to start (exits on init failure)
- WhatsApp webhook uses polling (5s intervals), not WebSockets
- Seed scripts require `GOOGLE_APPLICATION_CREDENTIALS` env var
- `run-all.ps1` is PowerShell-only (Windows)
- Frontend runs on port 5173, backend on port 3000
