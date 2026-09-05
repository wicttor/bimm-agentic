import { useState } from "react";
import { useBooks } from "./useBooks";
import { Button, TextField, Box, Typography } from "@mui/material";

export function AddBookForm() {
  const { addBook } = useBooks();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addBook({
      variables: {
        make,
        model,
        year: parseInt(year),
        color,
      },
    });
    setMake("");
    setModel("");
    setYear("");
    setColor("");
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>
      <Typography variant="h6">Add a New Book</Typography>
      <TextField
        label="Make"
        value={make}
        onChange={(e) => setMake(e.target.value)}
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Model"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Year"
        type="number"
        value={year}
        onChange={(e) => setYear(e.target.value)}
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        fullWidth
        margin="normal"
        required
      />
      <Button type="submit" variant="contained" sx={{ mt: 2 }}>
        Add Book
      </Button>
    </Box>
  );
}
