import { useState } from "react";
import { Box, TextField, Button, Grid, CircularProgress, Alert } from "@mui/material";
import { useCars } from "@/hooks/useCars";
import { CarCard } from "./CarCard";

export function CarList() {
  const { cars, loading, error, addCar } = useCars();
  const [searchModel, setSearchModel] = useState("");
  const [sortBy, setSortBy] = useState<"year" | "make">("year");
  const [newCar, setNewCar] = useState({ make: "", model: "", year: new Date().getFullYear() });

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  const filtered = cars
    .filter((car) => car.model.toLowerCase().includes(searchModel.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "year") return b.year - a.year;
      return a.make.localeCompare(b.make);
    });

  const handleAddCar = async () => {
    await addCar({ variables: { input: newCar } });
    setNewCar({ make: "", model: "", year: new Date().getFullYear() });
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ mb: 2, display: "flex", gap: 1 }}>
        <TextField
          placeholder="Search by model..."
          value={searchModel}
          onChange={(e) => setSearchModel(e.target.value)}
          size="small"
        />
        <Button onClick={() => setSortBy(sortBy === "year" ? "make" : "year")}>
          Sort by {sortBy === "year" ? "make" : "year"}
        </Button>
      </Box>

      <Box sx={{ mb: 3, p: 2, border: "1px solid #ccc", borderRadius: 1 }}>
        <TextField
          label="Make"
          value={newCar.make}
          onChange={(e) => setNewCar({ ...newCar, make: e.target.value })}
          size="small"
          sx={{ mr: 1 }}
        />
        <TextField
          label="Model"
          value={newCar.model}
          onChange={(e) => setNewCar({ ...newCar, model: e.target.value })}
          size="small"
          sx={{ mr: 1 }}
        />
        <TextField
          type="number"
          label="Year"
          value={newCar.year}
          onChange={(e) => setNewCar({ ...newCar, year: parseInt(e.target.value) })}
          size="small"
          sx={{ mr: 1 }}
        />
        <Button variant="contained" onClick={handleAddCar}>
          Add Car
        </Button>
      </Box>

      <Grid container spacing={2}>
        {filtered.map((car) => (
          <Grid item xs={12} sm={6} md={4} key={car.id}>
            <CarCard car={car} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
