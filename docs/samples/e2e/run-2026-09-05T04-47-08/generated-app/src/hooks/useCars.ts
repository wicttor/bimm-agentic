import { useQuery, useMutation } from "@apollo/client";
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
