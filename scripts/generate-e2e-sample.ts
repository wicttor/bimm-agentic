#!/usr/bin/env node

/**
 * Generate an end-to-end sample output by running the pipeline with FakeProvider.
 * This creates a sample run that can be committed to the repo and used as documentation.
 * 
 * Usage: node --loader tsx scripts/generate-e2e-sample.ts
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scaffold } from "../agent/src/scaffold.ts";
import { plan } from "../agent/src/plan.ts";
import { generate } from "../agent/src/generator.ts";
import { deriveRules } from "../agent/src/prompts/exemplars.ts";
import { FakeProvider } from "../agent/src/llm/fake.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const samplesDir = resolve(repoRoot, "docs/samples/e2e");
const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5)}`;
const outputBaseDir = resolve(samplesDir, runId);

async function generateSample() {
  console.log(`Generating E2E sample run: ${runId}`);

  // Create sample directory
  mkdirSync(outputBaseDir, { recursive: true });

  // 1. Scaffold
  console.log("1. Scaffolding...");
  const scaffoldResult = scaffold(repoRoot, join(outputBaseDir, "generated-app"));
  if (!scaffoldResult.ok) {
    throw new Error(`Scaffold failed: ${scaffoldResult.reason}`);
  }

  // 2. Read spec
  const spec = readFileSync(resolve(repoRoot, "specs/car-inventory.md"), "utf8");

  // 3. Derive rules
  console.log("2. Deriving rules...");
  const rules = deriveRules({ referenceRoot: repoRoot });

  // 4. Plan with FakeProvider
  console.log("3. Planning...");
  const planTasks = [
    {
      file: "src/hooks/useCars.ts",
      purpose: "Custom hook for fetching and managing car data with Apollo Client",
      dependsOn: [] as string[],
      exports: ["useCars"],
    },
    {
      file: "src/components/CarCard.tsx",
      purpose: "MUI Card component displaying individual car with responsive images",
      dependsOn: ["src/hooks/useCars.ts"],
      exports: ["CarCard"],
    },
    {
      file: "src/components/CarList.tsx",
      purpose: "Car list component with search, sort, and add-car form",
      dependsOn: ["src/hooks/useCars.ts", "src/components/CarCard.tsx"],
      exports: ["CarList"],
    },
    {
      file: "src/App.tsx",
      purpose: "Main app component combining all features",
      dependsOn: ["src/components/CarList.tsx"],
      exports: ["App"],
    },
  ];

  const plannerProvider = new FakeProvider({
    responses: [
      {
        toolCalls: [
          {
            name: "write_plan",
            args: planTasks as unknown as Record<string, unknown>,
            id: "plan_1",
          },
        ],
        stopReason: "tool_use" as const,
      },
    ],
  });

  const planResult = await plan({ spec, rules, provider: plannerProvider });
  if (!planResult.ok) {
    throw new Error(`Plan failed: ${planResult.error.code}`);
  }
  console.log(`   Planned ${planResult.tasks.length} tasks`);

  // 5. Generate with FakeProvider
  console.log("4. Generating files...");
  
  // Create a more realistic set of generated files
  const generatorProvider = new FakeProvider({
    responses: [
      // Hook
      {
        toolCalls: [
          {
            name: "write_file",
            args: {
              path: "src/hooks/useCars.ts",
              content: `import { useQuery, useMutation } from "@apollo/client";
import { GET_CARS, ADD_CAR } from "@/graphql/queries";

export interface Car {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  mobile?: string;
  tablet?: string;
  desktop?: string;
}

export function useCars() {
  const { data, loading, error, refetch } = useQuery<{ cars: Car[] }>(GET_CARS);
  const [addCar] = useMutation(ADD_CAR, {
    onCompleted: () => refetch(),
  });

  return {
    cars: data?.cars ?? [],
    loading,
    error: error?.message,
    addCar,
  };
}
`,
            },
            id: "write_1",
          },
        ],
        stopReason: "tool_use" as const,
      },
      { text: "Hook created", toolCalls: [], stopReason: "stop" as const },
      
      // CarCard component
      {
        toolCalls: [
          {
            name: "write_file",
            args: {
              path: "src/components/CarCard.tsx",
              content: `import { Card, CardMedia, CardContent, Typography } from "@mui/material";
import type { Car } from "@/hooks/useCars";

interface CarCardProps {
  car: Car;
}

export function CarCard({ car }: CarCardProps) {
  const getImageUrl = () => {
    const width = typeof window !== "undefined" ? window.innerWidth : 1024;
    if (width <= 640) return car.mobile || car.tablet || car.desktop;
    if (width <= 1023) return car.tablet || car.desktop;
    return car.desktop || car.tablet;
  };

  return (
    <Card>
      <CardMedia
        component="img"
        height="200"
        image={getImageUrl() || "/placeholder.jpg"}
        alt={car.model}
      />
      <CardContent>
        <Typography variant="h6">
          {car.year} {car.make} {car.model}
        </Typography>
        <Typography color="textSecondary">{car.color}</Typography>
      </CardContent>
    </Card>
  );
}
`,
            },
            id: "write_2",
          },
        ],
        stopReason: "tool_use" as const,
      },
      { text: "CarCard created", toolCalls: [], stopReason: "stop" as const },

      // CarList component
      {
        toolCalls: [
          {
            name: "write_file",
            args: {
              path: "src/components/CarList.tsx",
              content: `import { useState } from "react";
import { Box, TextField, Button, Grid, CircularProgress, Alert } from "@mui/material";
import { useCars } from "@/hooks/useCars";
import { CarCard } from "./CarCard";

export function CarList() {
  const { cars, loading, error, addCar } = useCars();
  const [searchModel, setSearchModel] = useState("");
  const [sortBy, setSortBy] = useState<"year" | "make">("year");
  const [newCar, setNewCar] = useState({ make: "", model: "", year: new Date().getFullYear() });

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  const filtered = cars
    .filter((car) => car.model.toLowerCase().includes(searchModel.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "year") return b.year - a.year;
      return a.make.localeCompare(b.make);
    });

  const handleAddCar = async () => {
    await addCar({ variables: { input: newCar } });
    setNewCar({ make: "", model: "", year: new Date().getFullYear() });
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ mb: 2, display: "flex", gap: 1 }}>
        <TextField
          placeholder="Search by model..."
          value={searchModel}
          onChange={(e) => setSearchModel(e.target.value)}
          size="small"
        />
        <Button onClick={() => setSortBy(sortBy === "year" ? "make" : "year")}>
          Sort by {sortBy === "year" ? "make" : "year"}
        </Button>
      </Box>

      <Box sx={{ mb: 3, p: 2, border: "1px solid #ccc", borderRadius: 1 }}>
        <TextField
          label="Make"
          value={newCar.make}
          onChange={(e) => setNewCar({ ...newCar, make: e.target.value })}
          size="small"
          sx={{ mr: 1 }}
        />
        <TextField
          label="Model"
          value={newCar.model}
          onChange={(e) => setNewCar({ ...newCar, model: e.target.value })}
          size="small"
          sx={{ mr: 1 }}
        />
        <TextField
          type="number"
          label="Year"
          value={newCar.year}
          onChange={(e) => setNewCar({ ...newCar, year: parseInt(e.target.value) })}
          size="small"
          sx={{ mr: 1 }}
        />
        <Button variant="contained" onClick={handleAddCar}>
          Add Car
        </Button>
      </Box>

      <Grid container spacing={2}>
        {filtered.map((car) => (
          <Grid item xs={12} sm={6} md={4} key={car.id}>
            <CarCard car={car} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
`,
            },
            id: "write_3",
          },
        ],
        stopReason: "tool_use" as const,
      },
      { text: "CarList created", toolCalls: [], stopReason: "stop" as const },

      // App
      {
        toolCalls: [
          {
            name: "write_file",
            args: {
              path: "src/App.tsx",
              content: `import { ApolloClient, ApolloProvider, InMemoryCache, HttpLink } from "@apollo/client";
import { CarList } from "./components/CarList";

const client = new ApolloClient({
  ssrMode: typeof window === "undefined",
  link: new HttpLink({
    uri: process.env.REACT_APP_GRAPHQL_URL || "http://localhost:4000/graphql",
    credentials: "same-origin",
  }),
  cache: new InMemoryCache(),
});

export function App() {
  return (
    <ApolloProvider client={client}>
      <div className="App">
        <h1>Car Inventory Manager</h1>
        <CarList />
      </div>
    </ApolloProvider>
  );
}

export default App;
`,
            },
            id: "write_4",
          },
        ],
        stopReason: "tool_use" as const,
      },
      { text: "App created", toolCalls: [], stopReason: "stop" as const },
    ],
  });

  const genResult = await generate(
    spec,
    rules,
    generatorProvider,
    { outDir: join(outputBaseDir, "generated-app") },
    planResult.tasks,
  );

  if (genResult.failureCount > 0) {
    throw new Error(`Generation failed: ${genResult.failedTasks.join(", ")}`);
  }

  console.log(`   Generated ${genResult.successCount} files`);

  // 6. Save run metadata
  console.log("5. Saving run metadata...");
  const metadata = {
    runId,
    timestamp: new Date().toISOString(),
    spec: "specs/car-inventory.md",
    provider: "fake",
    taskCount: planResult.tasks.length,
    successCount: genResult.successCount,
    failureCount: genResult.failureCount,
  };

  writeFileSync(join(outputBaseDir, "run.json"), JSON.stringify(metadata, null, 2));
  writeFileSync(join(outputBaseDir, "plan.json"), JSON.stringify(planResult.tasks, null, 2));

  // 7. Create README
  const readme = `# E2E Sample Run: ${runId}

Generated using the end-to-end pipeline with FakeProvider.

## What's included

- \`generated-app/\` - The generated React + Apollo Client application
- \`plan.json\` - The decomposed task plan
- \`run.json\` - Metadata about this run

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

\`\`\`bash
cd generated-app
npm install
npm run typecheck
npm run test
\`\`\

## Notes

- This sample was generated with FakeProvider (no real LLM calls)
- For a real run with actual code generation, set ANTHROPIC_API_KEY or OPENAI_API_KEY and run: 
  \`npx tsx agent/src/index.ts --spec specs/car-inventory.md\`
`;

  writeFileSync(join(outputBaseDir, "README.md"), readme);

  console.log(`\n✓ Sample run generated successfully!`);
  console.log(`  Location: ${outputBaseDir}`);
  console.log(`  Run ID: ${runId}`);
}

generateSample().catch((err) => {
  console.error("Error generating sample:", err.message);
  process.exit(1);
});
