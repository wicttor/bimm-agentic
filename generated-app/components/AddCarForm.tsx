import { TextField, Button, Stack } from "@mui/material";
import { useState } from "react";
import type { Car } from "@/types";

interface AddCarFormProps {
  onAdd: (car: Omit<Car, "id">) => void;
}

/**
 * Form to add a new car to the inventory.
 * Lifted from agent/samples/output/src/components/AddCarForm.tsx.
 */
export function AddCarForm({ onAdd }: AddCarFormProps) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(2024);
  const [color, setColor] = useState("");
  const [mileage, setMileage] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const label = encodeURIComponent(`${make} ${model}`);
    onAdd({
      make,
      model,
      year,
      color,
      mileage,
      mobile: `https://placehold.co/640x360?text=${label}+Mobile`,
      tablet: `https://placehold.co/1023x576?text=${label}+Tablet`,
      desktop: `https://placehold.co/1440x810?text=${label}+Desktop`,
    });
    setMake("");
    setModel("");
    setYear(2024);
    setColor("");
    setMileage(0);
  };

  return (
    <form onSubmit={handleSubmit} data-testid="add-car-form">
      <Stack direction="row" spacing={2} alignItems="flex-end" flexWrap="wrap">
        <TextField
          label="Make"
          placeholder="Make"
          value={make}
          onChange={(e) => setMake(e.target.value)}
          size="small"
        />
        <TextField
          label="Model"
          placeholder="Model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          size="small"
        />
        <TextField
          label="Year"
          type="number"
          placeholder="Year"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          size="small"
        />
        <TextField
          label="Color"
          placeholder="Color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          size="small"
        />
        <TextField
          label="Mileage"
          type="number"
          placeholder="Mileage"
          value={mileage}
          onChange={(e) => setMileage(Number(e.target.value))}
          size="small"
        />
        <Button type="submit" variant="contained">
          Add Car
        </Button>
      </Stack>
    </form>
  );
}
