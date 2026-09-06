import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ApolloClient, ApolloProvider, HttpLink, InMemoryCache } from "@apollo/client";
import { graphql, HttpResponse } from "msw";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import App from "@/App";
import { seedCars } from "@/mocks/data";
import { server } from "@/mocks/server";
import type { Car } from "@/types";

/**
 * T13 — AddCar mutation appends a card without reload (FR-4).
 *
 * Deliberately NOT using MockedProvider: the AC names the **MSW server
 * handler** and **`useCars()`** as the unit under test, and MockedProvider
 * resolves requests against a fixed list, so it cannot catch a
 * mutation/handler contract mismatch (the sample's own integration.test.ts
 * makes the same call). Here Apollo serializes -> fetch -> MSW intercepts ->
 * the real handler mutates its in-memory store -> the response is parsed back
 * into the cache.
 *
 * "Without reload" is proven, not assumed: fetch is wrapped and requests are
 * counted by operationName, so the sixth card must appear while GET_CARS has
 * been requested exactly once — i.e. the append came from the cache `update`
 * function, not a refetch and not a page reload.
 *
 * Store hazard: `src/mocks/handlers.ts` keeps its cars in a module-level `let`,
 * which `server.resetHandlers()` does NOT reset. This file therefore performs
 * exactly ONE mutation against the shared store (the primary test); the
 * form-reset test installs its own handler with `server.use()`.
 */

// dirname(test file) = src/__tests__; the sources under inspection live one
// level up in src/. Resolved from import.meta.url, never from cwd.
const SRC = resolve(fileURLToPath(import.meta.url), "..", "..");

const CAMRY = "2024 Toyota Camry";
const CIVIC = "2023 Honda Civic";
const MUSTANG = "2025 Ford Mustang";
const MODEL3 = "2024 Tesla Model 3";
const X5 = "2023 BMW X5";
const SEEDS = [CAMRY, CIVIC, MUSTANG, MODEL3, X5];
const KIA = "2026 Kia EV6";

/** The subset of a Car the AddCar handler is responsible for; images derive from it. */
type NewCar = Pick<Car, "id" | "make" | "model" | "year" | "color" | "mileage">;

/** Mirrors src/mocks/handlers.ts: placehold.co URLs synthesised from make + model. */
function withImages(car: NewCar): Car {
  const label = encodeURIComponent(`${car.make} ${car.model}`);
  return {
    ...car,
    mobile: `https://placehold.co/640x360?text=${label}+Mobile`,
    tablet: `https://placehold.co/1023x576?text=${label}+Tablet`,
    desktop: `https://placehold.co/1440x810?text=${label}+Desktop`,
  };
}

/** GraphQL operation names actually sent over the wire, in order. */
let ops: string[];

function makeClient() {
  ops = [];
  const realFetch = globalThis.fetch;
  const countingFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const body = JSON.parse(String(init?.body)) as { operationName?: string };
      ops.push(body.operationName ?? "anonymous");
    } catch {
      ops.push("unparsed");
    }
    return realFetch(input, init);
  }) as typeof fetch;

  return new ApolloClient({
    link: new HttpLink({ uri: "http://localhost/graphql", fetch: countingFetch }),
    cache: new InMemoryCache(),
  });
}

function renderApp() {
  const client = makeClient();
  render(
    <ApolloProvider client={client}>
      <App />
    </ApolloProvider>,
  );
  return userEvent.setup();
}

function visibleCars(): string[] {
  return screen.getAllByTestId("car-card").map((card) =>
    within(card)
      .getByRole("heading")
      .textContent!.replace(/\s+/g, " ")
      .trim(),
  );
}

/** Clears a controlled input (including type="number") then types a fresh value. */
async function fill(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  const field = screen.getByLabelText(name);
  await user.clear(field);
  await user.type(field, value);
}

describe("T13 — AddCar mutation appends a card without reload", () => {
  it("submitting the form appends the new car via the MSW AddCar handler", async () => {
    const user = await renderApp();
    await screen.findByText(CAMRY);

    // Two-sided precondition: exactly the five seed cars, no sixth card yet.
    expect(visibleCars()).toHaveLength(5);
    expect(screen.queryByText(KIA)).not.toBeInTheDocument();

    await fill(user, "Make", "Kia");
    await fill(user, "Model", "EV6");
    await fill(user, "Year", "2026");
    await fill(user, "Color", "Blue");
    await fill(user, "Mileage", "12000");

    await user.click(screen.getByRole("button", { name: "Add Car" }));

    // The new card appears without any navigation or refetch.
    const kia = await screen.findByText(KIA);
    expect(kia).toBeInTheDocument();

    // ...carries the submitted data, including mileage, which must survive the
    // round trip through the mutation contract (no silent drop to the handler's
    // `?? 0` default)...
    const kiaCard = kia.closest('[data-testid="car-card"]') as HTMLElement;
    expect(within(kiaCard).getByText(/Color: Blue/)).toBeInTheDocument();
    expect(within(kiaCard).getByText(/Mileage: 12,000/)).toBeInTheDocument();

    // ...and lands FIRST under App's default year-desc ordering (T12), proving
    // it went through the real render pipeline rather than being appended raw.
    expect(visibleCars()[0]).toBe(KIA);

    // All five seed cars survive the append.
    for (const title of SEEDS) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(visibleCars()).toHaveLength(6);

    // "Without a page reload": the list query ran once, before the mutation.
    expect(ops.filter((op) => op === "GetCars")).toEqual(["GetCars"]);
    expect(ops.filter((op) => op === "AddCar")).toEqual(["AddCar"]);
  });

  it("resets the form fields after a successful submit", async () => {
    // Local handler + private store so this test never touches the shared
    // module-level store mutated by the test above.
    const localCars: Car[] = [...seedCars];
    server.use(
      graphql.query("GetCars", () => HttpResponse.json({ data: { cars: localCars } })),
      graphql.mutation("AddCar", ({ variables }) => {
        const car = withImages({
          id: String(localCars.length + 1),
          make: String(variables["make"]),
          model: String(variables["model"]),
          year: Number(variables["year"]),
          color: String(variables["color"]),
          mileage: Number(variables["mileage"] ?? 0),
        });
        localCars.push(car);
        return HttpResponse.json({ data: { addCar: car } });
      }),
    );

    const user = await renderApp();
    await screen.findByText(CAMRY);

    await fill(user, "Make", "Nissan");
    await fill(user, "Model", "Leaf");
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    await screen.findByText("2024 Nissan Leaf");
    expect(screen.getByLabelText("Make")).toHaveValue("");
    expect(screen.getByLabelText("Model")).toHaveValue("");
  });

  it("reaches the handler through useCars(), not a component-level Apollo hook", () => {
    // AC scenario "Hook ownership": the form must stay presentation-only.
    const read = (rel: string[]) => readFileSync(resolve(SRC, ...rel), "utf-8");

    const formSource = read(["components", "AddCarForm.tsx"]);
    expect(formSource).not.toMatch(/@apollo\/client/);
    expect(formSource).not.toMatch(/useMutation|useQuery/);

    const appSource = read(["App.tsx"]);
    expect(appSource).not.toMatch(/@apollo\/client/);

    const hookSource = read(["hooks", "useCars.ts"]);
    expect(hookSource).toMatch(/@apollo\/client/);
    expect(hookSource).toMatch(/useMutation/);

    // The form's own submit path must go through the onAdd prop it is handed.
    expect(formSource).toMatch(/onAdd/);
  });
});
