import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CarCard } from "@/components/CarCard";
import type { Car } from "@/types";

/**
 * T11 — CarCard switches image src across 640/1024 breakpoints.
 *
 * Uses matchMedia mock to simulate different viewport widths and asserts
 * that the rendered img src changes accordingly.
 *
 * Mutation-certified: if the breakpoint selection logic is removed from
 * CarCard.tsx, these tests will fail (at least one width assertion will be red).
 */

const mockCar: Car = {
  id: "1",
  make: "Toyota",
  model: "Camry",
  year: 2024,
  color: "Silver",
  mileage: 15000,
  mobile: "https://placehold.co/640x360?text=Toyota+Camry+Mobile",
  tablet: "https://placehold.co/1023x576?text=Toyota+Camry+Tablet",
  desktop: "https://placehold.co/1440x810?text=Toyota+Camry+Desktop",
};

/**
 * Mock matchMedia to return a specific matches value for a given query.
 * MUI's useMediaQuery uses matchMedia internally.
 */
function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("T11 — CarCard responsive image selection", () => {
  beforeEach(() => {
    // Reset matchMedia mock before each test
    vi.stubGlobal("matchMedia", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders mobile image at 500px viewport (≤ 640px)", () => {
    mockMatchMedia(true); // Simulate mobile viewport
    render(<CarCard car={mockCar} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", mockCar.mobile);
  });

  it("renders tablet image at 800px viewport (641–1023px)", () => {
    // For tablet: max-width:640px = false, min-width:641px and max-width:1023px = true
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => {
        const matches = query.includes("min-width: 641px") && query.includes("max-width: 1023px");
        return {
          matches,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        };
      }),
    });

    render(<CarCard car={mockCar} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", mockCar.tablet);
  });

  it("renders desktop image at 1400px viewport (≥ 1024px)", () => {
    mockMatchMedia(false); // Simulate desktop viewport (neither mobile nor tablet)
    render(<CarCard car={mockCar} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", mockCar.desktop);
  });

  it("renders car details alongside the image", () => {
    mockMatchMedia(false); // Desktop
    render(<CarCard car={mockCar} />);
    expect(screen.getByText("2024 Toyota Camry")).toBeInTheDocument();
    expect(screen.getByText(/Color: Silver/)).toBeInTheDocument();
    expect(screen.getByText(/Mileage: 15,000/)).toBeInTheDocument();
  });
});
