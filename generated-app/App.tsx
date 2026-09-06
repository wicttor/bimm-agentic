import { useState, useMemo } from "react";
import {
  Container,
  Typography,
  Stack,
  CircularProgress,
  Box,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { useCars } from "@/hooks/useCars";
import { CarCard } from "@/components/CarCard";
import { SearchBar } from "@/components/SearchBar";
import { AddCarForm } from "@/components/AddCarForm";
import type { SortField, SortDirection } from "@/utils/sortCars";

/**
 * App shell for the Car Inventory Manager.
 *
 * Composes the feature components (CarCard, SearchBar, AddCarForm) with the
 * data layer (useCars → Apollo/MSW) into a bootable, rendered page.
 * Supports search by make/model (FR-5) and sorting by year/make (FR-6).
 */
export default function App() {
  const { cars, loading, error, addCar, searchCars, sortCars } = useCars();
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("year");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const displayed = useMemo(() => {
    const filtered = query ? searchCars(query) : cars;
    return sortCars(filtered, sortField, sortDir);
  }, [cars, query, sortField, sortDir, searchCars, sortCars]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Car Inventory Manager
      </Typography>
      <Typography color="text.secondary" paragraph>
        A GraphQL-backed inventory app generated from a written specification.
      </Typography>

      <Box sx={{ mb: 3 }}>
        <SearchBar onSearch={setQuery} />
      </Box>

      <Box sx={{ mb: 3, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="body2" color="text.secondary">
          Sort by:
        </Typography>
        <ToggleButtonGroup
          value={sortField}
          exclusive
          onChange={(_, v) => v && setSortField(v)}
          size="small"
        >
          <ToggleButton value="year">Year</ToggleButton>
          <ToggleButton value="make">Make</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          value={sortDir}
          exclusive
          onChange={(_, v) => v && setSortDir(v)}
          size="small"
        >
          <ToggleButton value="asc">↑ Asc</ToggleButton>
          <ToggleButton value="desc">↓ Desc</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ mb: 3 }}>
        <AddCarForm onAdd={addCar} />
      </Box>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Typography color="error" paragraph>
          Error loading cars: {error.message}
        </Typography>
      )}

      <Stack spacing={2}>
        {displayed.map((car) => (
          <CarCard key={car.id} car={car} />
        ))}
      </Stack>

      {!loading && displayed.length === 0 && (
        <Typography color="text.secondary">
          {query ? "No cars match your search." : "No cars in inventory."}
        </Typography>
      )}
    </Container>
  );
}
