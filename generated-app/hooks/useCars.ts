import { useQuery, useMutation } from "@apollo/client";
import { useCallback } from "react";
import { GET_CARS, ADD_CAR } from "@/graphql/queries";
import { sortCars, type SortField, type SortDirection } from "@/utils/sortCars";
import type { Car } from "@/types";

interface GetCarsData {
  cars: Car[];
}

interface AddCarData {
  addCar: Car;
}

interface AddCarVariables {
  make: string;
  model: string;
  year: number;
  color: string;
  mileage: number;
}

/**
 * Pure client-side filter over the queried result (FR-5): case-insensitive
 * substring match on make or model. Module-level and side-effect free, like
 * `sortCars`, so the composed (filter ∘ sort) behaviour is testable without
 * depending on render order. Module-private: the hook is its only consumer.
 */
function filterCars(cars: Car[], query: string): Car[] {
  const q = query.toLowerCase();
  return cars.filter(
    (c) => c.make.toLowerCase().includes(q) || c.model.toLowerCase().includes(q),
  );
}

/**
 * Hook that wraps the GraphQL query and mutation for the car inventory.
 *
 * - `cars` comes from the GET_CARS query (MSW-mocked in dev, MockedProvider in tests).
 * - `addCar` calls the ADD_CAR mutation and updates the Apollo cache so the new
 *   car appears without a page reload (spec FR-4).
 * - `searchCars` filters the queried result via the pure `filterCars`.
 * - `sortCars` (re-exported from `@/utils/sortCars`) is a pure sort by year/make.
 *
 * This is the sole owner of Apollo imports — no other component should import
 * from `@apollo/client` (FR-1, FR-3).
 */
export function useCars() {
  const { data, loading, error } = useQuery<GetCarsData>(GET_CARS);

  const [addCarMutation] = useMutation<AddCarData, AddCarVariables>(ADD_CAR, {
    update(cache, { data: mutationResult }) {
      if (!mutationResult?.addCar) return;
      const existing = cache.readQuery<GetCarsData>({ query: GET_CARS });
      if (existing) {
        cache.writeQuery({
          query: GET_CARS,
          data: { cars: [...existing.cars, mutationResult.addCar] },
        });
      }
    },
  });

  const cars = data?.cars ?? [];

  /**
   * Submits AddCar. The parameter type is the mutation's own variable contract,
   * so a field cannot be collected by the form and silently dropped here (the
   * bug T13 fixed: `mileage` was absent from both this signature and ADD_CAR,
   * so the handler's `?? 0` default quietly replaced user input).
   *
   * Variables are picked explicitly rather than spread: callers hand us a whole
   * Car-minus-id (including image URLs), and GraphQL rejects variables the
   * operation never declared.
   */
  const addCar = async (car: AddCarVariables) => {
    await addCarMutation({
      variables: {
        make: car.make,
        model: car.model,
        year: car.year,
        color: car.color,
        mileage: car.mileage,
      },
    });
  };

  const searchCars = useCallback(
    (query: string) => filterCars(cars, query),
    [cars],
  );

  return { cars, loading, error, addCar, searchCars, sortCars };
}

export type { SortField, SortDirection };
