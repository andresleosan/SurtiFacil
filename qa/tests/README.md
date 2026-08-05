# Firestore Rules Tests

Run the reproducible Auth/Firestore emulator scenarios from the repository root:

```bash
npm run test:rules
```

The command starts the configured local Auth and Firestore emulators, seeds only local emulator data, runs `firestore-rules.cjs`, and shuts both emulators down.
