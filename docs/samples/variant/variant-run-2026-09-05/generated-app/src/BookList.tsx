import { useState } from "react";
import { useBooks } from "./useBooks";
import { Card, CardContent, Typography, Box, TextField, Select, MenuItem } from "@mui/material";

export function BookList() {
  const { books, loading, error } = useBooks();
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"year" | "author">("year");

  if (loading) return <Typography>Loading...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  const filtered = books.filter((b) =>
    (b.model || "").toLowerCase().includes(searchText.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "year") return b.year - a.year;
    return (a.make || "").localeCompare(b.make || "");
  });

  return (
    <>
      <TextField
        label="Search by title"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        fullWidth
        margin="normal"
      />
      
      <Select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as "year" | "author")}
        label="Sort by"
      >
        <MenuItem value="year">Year</MenuItem>
        <MenuItem value="author">Author</MenuItem>
      </Select>
      
      <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 2 }}>
        {sorted.map((book) => (
          <Card key={book.id}>
            <CardContent>
              <Typography variant="h6">{book.model}</Typography>
              <Typography color="textSecondary">{book.make}</Typography>
              <Typography variant="body2">{book.year} — {book.color}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </>
  );
}
