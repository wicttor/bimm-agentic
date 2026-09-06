import type { Car } from "@/types";

export type SortField = "year" | "make";
export type SortDirection = "asc" | "desc";

/**
 * Pure sort utility — returns a new array sorted by the given field and direction.
 * Does not mutate the input. Testable without React or Apollo.
 */
export function sortCars(cars: Car[], field: SortField, direction: SortDirection): Car[] {
  return [...cars].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return direction === "asc" ? cmp : -cmp;
  });
}
