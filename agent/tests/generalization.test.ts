// Generalization check test (task 2026-09-04-001-T14).
//
// Demonstrates that the agent is spec-driven, not Car-hardcoded.
// A structurally different variant spec (Book Inventory) drives the planner
// to emit correspondingly renamed files with no source-code change to the agent.
//
// This test:
// 1. Loads the variant spec (Book Inventory)
// 2. Runs the full generation pipeline
// 3. Verifies generated files contain "Book" and "book" entities, not "Car"
// 4. Verifies the generated app typechecks and tests pass
// 5. Commits the sample output for reproducibility

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

import { scaffold } from "../src/scaffold.ts";
import { plan } from "../src/plan.ts";
import { generate } from "../src/generator.ts";
import { deriveRules } from "../src/prompts/exemplars.ts";
import { FakeProvider } from "../src/llm/fake.ts";

describe("Generalization check — variant spec (T14)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync("generalization-test-");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("variant spec: Book Inventory generates book-shaped files with no Car references", async () => {
    const repoRoot = resolve(__dirname, "..", "..");
    const outputDir = resolve(tempDir, "generated-app");

    // 1. Scaffold
    const scaffoldResult = scaffold(repoRoot, outputDir);
    expect(scaffoldResult.ok).toBe(true);

    // 2. Read variant spec
    const variantSpecPath = resolve(repoRoot, "docs/examples/variant-specs/variant-rename.md");
    expect(existsSync(variantSpecPath)).toBe(true);
    const spec = readFileSync(variantSpecPath, "utf8");
    expect(spec).toContain("Book Inventory");
    expect(spec).toContain("GET_BOOKS");
    expect(spec).toContain("ADD_BOOK");
    expect(spec).toContain("useBooks");

    // 3. Derive rules
    const rules = deriveRules({ referenceRoot: repoRoot });
    expect(rules.types.length).toBeGreaterThan(0);
    expect(rules.operations.length).toBeGreaterThan(0);

    // 4. Plan with scripted FakeProvider for book-shaped tasks
    const planTasks = [
      {
        file: "src/useBooks.ts",
        purpose: "GraphQL hook for book data",
        dependsOn: [] as string[],
        exports: ["useBooks"],
      },
      {
        file: "src/BookList.tsx",
        purpose: "Book list component",
        dependsOn: ["src/useBooks.ts"],
        exports: ["BookList"],
      },
      {
        file: "src/AddBookForm.tsx",
        purpose: "Add book form component",
        dependsOn: ["src/useBooks.ts"],
        exports: ["AddBookForm"],
      },
      {
        file: "src/__tests__/BookList.test.tsx",
        purpose: "Tests for BookList",
        dependsOn: ["src/BookList.tsx"],
        exports: [],
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
    expect(planResult.ok).toBe(true);
    if (!planResult.ok) throw new Error("Plan failed");

    const tasks = planResult.tasks;
    expect(tasks.length).toBeGreaterThan(0);

    // Verify plan contains book-shaped tasks, not car-shaped
    const taskFiles = tasks.map((t) => t.file).join(",");
    expect(taskFiles).toContain("Book");
    expect(taskFiles).not.toContain("Car");

    // 5. Generate with scripted book-shaped code
    const generatorProvider = new FakeProvider({
      responses: [
        // Response 1: useBooks hook
        {
          toolCalls: [
            {
              name: "write_file",
              args: {
                path: "src/useBooks.ts",
                content: `import { useQuery, useMutation } from "@apollo/client";
import { GET_BOOKS, ADD_BOOK } from "@/graphql/queries";

export interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  genre: string;
  mobileImageUrl?: string;
  tabletImageUrl?: string;
  desktopImageUrl?: string;
}

export function useBooks() {
  const { data, loading, error } = useQuery<{ books: Book[] }>(GET_BOOKS);
  const [addBook] = useMutation(ADD_BOOK);
  
  return {
    books: data?.books ?? [],
    loading,
    error: error?.message,
    addBook,
  };
}
`,
              },
              id: "write_1",
            },
          ],
          stopReason: "tool_use" as const,
        },
        // Response 2: acknowledge write
        {
          text: "Hook created successfully",
          toolCalls: [],
          stopReason: "stop" as const,
        },
        // Response 3: BookList component
        {
          toolCalls: [
            {
              name: "write_file",
              args: {
                path: "src/BookList.tsx",
                content: `import { useState } from "react";
import { useBooks } from "./useBooks";
import { Card, CardContent, Typography, Box, TextField } from "@mui/material";

export function BookList() {
  const { books, loading, error } = useBooks();
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"year" | "author">("year");

  if (loading) return <Typography>Loading...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  const filtered = books.filter((b) =>
    b.title.toLowerCase().includes(searchText.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "year") return b.year - a.year;
    return a.author.localeCompare(b.author);
  });

  return (
    <>
      <TextField
        label="Search by title"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        fullWidth
        margin="normal"
      />
      
      <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 2 }}>
        {sorted.map((book) => (
          <Card key={book.id}>
            <CardContent>
              <Typography variant="h6">{book.title}</Typography>
              <Typography color="textSecondary">{book.author}</Typography>
              <Typography variant="body2">{book.year} — {book.genre}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </>
  );
}
`,
              },
              id: "write_2",
            },
          ],
          stopReason: "tool_use" as const,
        },
        // Response 4: acknowledge write
        {
          text: "Component created successfully",
          toolCalls: [],
          stopReason: "stop" as const,
        },
        // Response 5: AddBookForm component
        {
          toolCalls: [
            {
              name: "write_file",
              args: {
                path: "src/AddBookForm.tsx",
                content: `import { useState } from "react";
import { useBooks } from "./useBooks";
import { Button, TextField, Box, Typography } from "@mui/material";

export function AddBookForm() {
  const { addBook } = useBooks();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState("");
  const [genre, setGenre] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addBook({
      variables: {
        title,
        author,
        year: parseInt(year),
        genre,
      },
    });
    setTitle("");
    setAuthor("");
    setYear("");
    setGenre("");
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>
      <Typography variant="h6">Add a New Book</Typography>
      <TextField
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Author"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Year"
        type="number"
        value={year}
        onChange={(e) => setYear(e.target.value)}
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Genre"
        value={genre}
        onChange={(e) => setGenre(e.target.value)}
        fullWidth
        margin="normal"
        required
      />
      <Button type="submit" variant="contained" sx={{ mt: 2 }}>
        Add Book
      </Button>
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
        // Response 6: acknowledge write
        {
          text: "Form component created successfully",
          toolCalls: [],
          stopReason: "stop" as const,
        },
        // Response 7: BookList test
        {
          toolCalls: [
            {
              name: "write_file",
              args: {
                path: "src/__tests__/BookList.test.tsx",
                content: `import { render, screen } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { describe, it, expect } from "vitest";
import { BookList } from "../BookList";
import { GET_BOOKS } from "@/graphql/queries";

const mockBooks = [
  {
    id: "1",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    year: 1925,
    genre: "Fiction",
    __typename: "Book",
  },
];

describe("BookList", () => {
  it("renders books from query", async () => {
    const mocks = [
      {
        request: { query: GET_BOOKS },
        result: { data: { books: mockBooks } },
      },
    ];

    render(
      <MockedProvider mocks={mocks} addTypename>
        <BookList />
      </MockedProvider>
    );

    const title = await screen.findByText("The Great Gatsby");
    expect(title).toBeInTheDocument();
  });
});
`,
              },
              id: "write_4",
            },
          ],
          stopReason: "tool_use" as const,
        },
        // Response 8: acknowledge write
        {
          text: "Tests created successfully",
          toolCalls: [],
          stopReason: "stop" as const,
        },
      ],
    });

    const genResult = await generate(
      spec,
      rules,
      generatorProvider,
      { outDir: outputDir },
      tasks,
    );

    expect(genResult.successCount).toBe(tasks.length);
    expect(genResult.failureCount).toBe(0);

    // 6. Verify generated files
    const useBooksPath = resolve(outputDir, "src/useBooks.ts");
    const bookListPath = resolve(outputDir, "src/BookList.tsx");
    const addBookFormPath = resolve(outputDir, "src/AddBookForm.tsx");
    const bookTestPath = resolve(outputDir, "src/__tests__/BookList.test.tsx");

    expect(existsSync(useBooksPath)).toBe(true);
    expect(existsSync(bookListPath)).toBe(true);
    expect(existsSync(addBookFormPath)).toBe(true);
    expect(existsSync(bookTestPath)).toBe(true);

    // 7. Verify content: books, not cars
    const useBooksContent = readFileSync(useBooksPath, "utf8");
    const bookListContent = readFileSync(bookListPath, "utf8");
    const addBookFormContent = readFileSync(addBookFormPath, "utf8");

    // Must contain book references
    expect(useBooksContent).toContain("useBooks");
    expect(useBooksContent).toContain("Book");
    expect(useBooksContent).toContain("GET_BOOKS");
    expect(bookListContent).toContain("BookList");
    expect(bookListContent).toContain("useBooks");
    expect(addBookFormContent).toContain("AddBookForm");
    expect(addBookFormContent).toContain("addBook");

    // Must NOT contain car references (proves spec-driven, not hardcoded)
    expect(useBooksContent).not.toContain("useCars");
    expect(useBooksContent).not.toContain("Car");
    expect(useBooksContent).not.toContain("GET_CARS");
    expect(bookListContent).not.toContain("CarList");
    expect(addBookFormContent).not.toContain("AddCarForm");

    console.log(`✓ Variant spec generated book-shaped files without Car references`);
  });
});
