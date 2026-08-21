# Contributing

Open an issue before starting a large feature so recording, recovery, privacy,
and deployment boundaries stay coherent.

## Development checks

```bash
npm install
npm run verify
```

Changes affecting browser lifecycle transitions, media transport, participant
consent, or artifact delivery require tests. Never add real room URLs,
credentials, participant details, private service code, or recorded media.

## Commit scope

Keep browser and public-contract changes separable. Server implementation and
private deployment changes belong in the private service repository.
