import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider, type MockedResponse } from "@apollo/client/testing";
import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import App from "@/App";
import { GET_CARS } from "@/graphql/queries";
import { seedCars } from "@/mocks/data";
import type { Car } from "@/types";

/**
 * T12 — Root search-by-model and sort-by-year/make compose (FR-5 / FR-6).
 *
 * GET_CARS is mocked with seedCars; assertions read the **visible card
 * sequence** (title per card), so a broken filter, a broken comparator, or a
 * broken control wiring each shows up as a wrong list — not as "5 cards exist"
 * (learnings `presence-only-assertions-survive-mutation`,
 * `mutation-check-ac-certifying-tests`).
 *
 * Seed data (src/mocks/data.ts), in list order:
 *   1 Toyota Camry 2024 · 2 Honda Civic 2023 · 3 Ford Mustang 2025
 *   4 Tesla Model 3 2024 · 5 BMW X5 2023
 *
 * Equal-year ties (Camry/Model 3 at 2024, Civic/X5 at 2023) resolve by
 * Array#sort stability (spec-guaranteed since ES2019) over that seed order;
 * the make-sort cases use distinct makes and are tie-free.
 */

const CAMRY = "2024 Toyota Camry";
const CIVIC = "2023 Honda Civic";
const MUSTANG = "2025 Ford Mustang";
const MODEL3 = "2024 Tesla Model 3";
const X5 = "2023 BMW X5";

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

/** The rendered cards, in visual order, as their "<year> <make> <model>" titles. */
function visibleCars(): string[] {
  return screen.getAllByTestId("car-card").map((card) =>
    within(card)
      .getByRole("heading")
      .textContent!.replace(/\s+/g, " ")
      .trim(),
  );
}

async function renderApp() {
  render(<App />, { wrapper: makeWrapper([getCarsMock]) });
  await screen.findByText(CAMRY); // wait for the query to resolve
  return userEvent.setup();
}

describe("T12 — Search and sort compose", () => {
  it("search narrows rendered cards: 'amry' -> only Camry", async () => {
    const user = await renderApp();

    await user.type(screen.getByLabelText("Search cars"), "amry");

    expect(visibleCars()).toEqual([CAMRY]);
  });

  it("search is case-insensitive and matches the make too: 'bm' -> only X5", async () => {
    const user = await renderApp();

    await user.type(screen.getByLabelText("Search cars"), "BM");

    expect(visibleCars()).toEqual([X5]);
  });

  it("sort by year desc (default): newest first, then next newest", async () => {
    await renderApp();

    expect(visibleCars()).toEqual([MUSTANG, CAMRY, MODEL3, CIVIC, X5]);
  });

  it("sort by year asc: oldest first", async () => {
    const user = await renderApp();

    await user.click(screen.getByRole("button", { name: /↑ Asc/i }));

    expect(visibleCars()).toEqual([CIVIC, X5, CAMRY, MODEL3, MUSTANG]);
  });

  it("sort by make asc: alphabetical makes", async () => {
    const user = await renderApp();

    await user.click(screen.getByRole("button", { name: "Make" }));
    await user.click(screen.getByRole("button", { name: /↑ Asc/i }));

    expect(visibleCars()).toEqual([X5, MUSTANG, CIVIC, MODEL3, CAMRY]);
  });

  it("sort by make desc: reverse-alphabetical makes", async () => {
    const user = await renderApp();

    await user.click(screen.getByRole("button", { name: "Make" }));
    // direction stays at its default (desc) — pins that field and direction are
    // independent controls rather than an implicit reset.
    expect(visibleCars()).toEqual([CAMRY, MODEL3, CIVIC, MUSTANG, X5]);
  });

  it("compose: search 'a' + make asc yields the intersection (BMW X5 excluded)", async () => {
    const user = await renderApp();

    await user.type(screen.getByLabelText("Search cars"), "a");
    await user.click(screen.getByRole("button", { name: "Make" }));
    await user.click(screen.getByRole("button", { name: /↑ Asc/i }));

    // "a" hits Toyota/Honda/Ford/Tesla makes or Camry/Civic/Mustang/Model names,
    // but not "BMW"/"X5" — so the result is the filtered set in sorted order.
    expect(visibleCars()).toEqual([MUSTANG, CIVIC, MODEL3, CAMRY]);
  });

  it("compose: search that matches nothing renders the empty state", async () => {
    const user = await renderApp();

    await user.type(screen.getByLabelText("Search cars"), "zzz");

    expect(screen.queryAllByTestId("car-card")).toHaveLength(0);
    expect(screen.getByText("No cars match your search.")).toBeInTheDocument();
  });
});
