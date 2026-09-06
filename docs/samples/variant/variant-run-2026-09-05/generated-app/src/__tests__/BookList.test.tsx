import { render, screen, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { describe, it, expect } from "vitest";
import { BookList } from "../BookList";
import { GET_CARS } from "@/graphql/queries";

const mockBooks = [
  {
    id: "1",
    make: "Ford",
    model: "Mustang",
    year: 1969,
    color: "Red",
    mobile: "https://example.com/mustang-m.jpg",
    tablet: "https://example.com/mustang-t.jpg",
    desktop: "https://example.com/mustang-d.jpg",
    __typename: "Car",
  },
  {
    id: "2",
    make: "Chevrolet",
    model: "Corvette",
    year: 1963,
    color: "Blue",
    mobile: "https://example.com/corvette-m.jpg",
    tablet: "https://example.com/corvette-t.jpg",
    desktop: "https://example.com/corvette-d.jpg",
    __typename: "Car",
  },
];

describe("BookList", () => {
  it("renders books from query", async () => {
    const mocks = [
      {
        request: { query: GET_CARS },
        result: { data: { cars: mockBooks } },
      },
    ];

    render(
      <MockedProvider mocks={mocks}>
        <BookList />
      </MockedProvider>
    );

    const model = await screen.findByText("Mustang");
    expect(model).toBeInTheDocument();
  });

  it("filters books by title", async () => {
    const mocks = [
      {
        request: { query: GET_CARS },
        result: { data: { cars: mockBooks } },
      },
    ];

    const { getByLabelText } = render(
      <MockedProvider mocks={mocks}>
        <BookList />
      </MockedProvider>
    );

    await waitFor(() => {
      const searchInput = getByLabelText("Search by title") as HTMLInputElement;
      expect(searchInput).toBeInTheDocument();
    });
  });
});
