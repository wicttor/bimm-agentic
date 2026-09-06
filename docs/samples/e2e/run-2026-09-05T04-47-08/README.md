# E2E Sample Run: run-2026-09-05T04-47-08

Generated using the end-to-end pipeline with FakeProvider.

## What's included

- `generated-app/` - The generated React + Apollo Client application
- `plan.json` - The decomposed task plan
- `run.json` - Metadata about this run

## Generated features

The generated app includes:

1. **Car list** - Fetches and displays all cars using Apollo Client
2. **Responsive images** - Selects images based on viewport width (mobile/tablet/desktop)
3. **MUI cards** - Each car is displayed in a Material-UI Card component
4. **Add-car form** - Form to submit new cars via GraphQL mutation
5. **Search and sorting** - Filter cars by model, sort by year or make
6. **useCars() hook** - Custom hook encapsulating all GraphQL operations

## Verification

To verify the generated app:

```bash
cd generated-app
npm install
npm run typecheck
npm run test
``
## Notes

- This sample was generated with FakeProvider (no real LLM calls)
- For a real run with actual code generation, set ANTHROPIC_API_KEY or OPENAI_API_KEY and run: 
  `npx tsx agent/src/index.ts --spec specs/car-inventory.md`
