import { useQuery, useMutation } from "@apollo/client";
import { GET_CARS, ADD_CAR } from "@/graphql/queries";

export interface Book {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  mobile?: string;
  tablet?: string;
  desktop?: string;
  __typename?: "Car";
}

export function useBooks() {
  const { data, loading, error } = useQuery<{ cars: Book[] }>(GET_CARS);
  const [addBook] = useMutation(ADD_CAR);
  
  return {
    books: data?.cars ?? [],
    loading,
    error: error?.message,
    addBook,
  };
}
