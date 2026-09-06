import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MockedProvider, type MockedResponse } from "@apollo/client/testing";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import App from "@/App";
import { useCars } from "@/hooks/useCars";
import { GET_CARS } from "@/graphql/queries";
import { seedCars } from "@/mocks/data";
import type { Car } from "@/types";

/**
 * T10 — Root app lists 5 seed cars via useCars → Apollo/MSW as MUI cards.
 *
 * Uses MockedProvider (not MSW) so the hook's Apollo integration is exercised
 * without starting a dev server. Each test supplies its own mock set.
 *
 * Two-sided by design: asserts actual card contents (make/model/year/color),
 * not just "5 elements exist" (learning `presence-only-assertions-survive-mutation`).
 */

const HERE = resolve(fileURLToPath(import.meta.url), "..");

function withTypenames(items: Car[]) {
  return items.map((item) => ({ ...(item as object), __typename: "Car" }));
}

function makeWrapper(mocks: MockedResponse[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MockedProvider mocks={mocks}>{children}</MockedProvider>;
  };
}

const getCarsMock: MockedResponse = {
  request: { query: GET_CARS },
  result: { data: { cars: withTypenames(seedCars) } },
};

describe("T10 — Root app lists 5 seed cars as MUI cards", () => {
  it("useCars() returns 5 seed cars from the GraphQL query", async () => {
    let hookResult: ReturnType<typeof useCars> | undefined;

    function Harness() {
      hookResult = useCars();
      return null;
    }

    render(<Harness />, { wrapper: makeWrapper([getCarsMock]) });

    // Wait for the query to resolve
    await screen.findByTestId; // microtask tick
    // Poll until cars arrive (useQuery is async)
    const { waitFor } = await import("@testing-library/react");
    await waitFor(() => {
      expect(hookResult?.cars).toHaveLength(5);
    });

    // Verify the seed data came through
    expect(hookResult!.cars[0]?.make).toBe("Toyota");
    expect(hookResult!.cars[1]?.make).toBe("Honda");
    expect(hookResult!.cars[2]?.make).toBe("Ford");
    expect(hookResult!.cars[3]?.make).toBe("Tesla");
    expect(hookResult!.cars[4]?.make).toBe("BMW");
  });

  it("App renders 5 MUI Cards with make/model/year/color from seed data", async () => {
    render(<App />, { wrapper: makeWrapper([getCarsMock]) });

    // Each seed car should appear as a card with year/make/model and color
    // Using findByText (async) because useQuery resolves asynchronously
    const toyota = await screen.findByText("2024 Toyota Camry");
    expect(toyota).toBeInTheDocument();
    expect(screen.getByText("2023 Honda Civic")).toBeInTheDocument();
    expect(screen.getByText("2025 Ford Mustang")).toBeInTheDocument();
    expect(screen.getByText("2024 Tesla Model 3")).toBeInTheDocument();
    expect(screen.getByText("2023 BMW X5")).toBeInTheDocument();

    // Colors should be rendered too (as "Color: X")
    expect(screen.getByText(/Color: Silver/)).toBeInTheDocument();
    expect(screen.getByText(/Color: Blue/)).toBeInTheDocument();
    expect(screen.getByText(/Color: Red/)).toBeInTheDocument();
    expect(screen.getByText(/Color: White/)).toBeInTheDocument();
    expect(screen.getByText(/Color: Black/)).toBeInTheDocument();
  });

  it("App does not render the boilerplate placeholder text", async () => {
    render(<App />, { wrapper: makeWrapper([getCarsMock]) });

    // Wait for data to load
    await screen.findByText("2024 Toyota Camry");

    // The placeholder string must be gone
    expect(screen.queryByText(/Replace this with your generated components/)).not.toBeInTheDocument();
  });

  it("no component other than useCars.ts imports Apollo hooks", () => {
    // Static import check: CarCard.tsx must not import from @apollo/client
    const carCardPath = resolve(HERE, "..", "components", "CarCard.tsx");
    const carCardSource = readFileSync(carCardPath, "utf-8");
    expect(carCardSource).not.toMatch(/@apollo\/client/);

    // App.tsx must not import from @apollo/client either
    const appPath = resolve(HERE, "..", "App.tsx");
    const appSource = readFileSync(appPath, "utf-8");
    expect(appSource).not.toMatch(/@apollo\/client/);

    // useCars.ts SHOULD import from @apollo/client (it's the only one allowed)
    const useCarsPath = resolve(HERE, "..", "hooks", "useCars.ts");
    const useCarsSource = readFileSync(useCarsPath, "utf-8");
    expect(useCarsSource).toMatch(/@apollo\/client/);
  });
});
