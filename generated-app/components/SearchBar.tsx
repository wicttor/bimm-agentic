import { TextField } from "@mui/material";

interface SearchBarProps {
  onSearch: (query: string) => void;
}

/**
 * Search input for filtering cars by make or model (FR-5).
 * Lifted from agent/samples/output/src/components/SearchBar.tsx; the plain
 * `<input>` became a MUI `TextField`, which is the only adaptation.
 *
 * The accessible name goes on `inputProps`, NOT on the root: MUI spreads an
 * unrecognized `aria-label` onto the wrapper `<div>`, which leaves the `<input>`
 * unnamed and makes `getByLabelText` resolve to a non-editable element.
 */
export function SearchBar({ onSearch }: SearchBarProps) {
  return (
    <TextField
      placeholder="Search by make or model..."
      inputProps={{ "aria-label": "Search cars" }}
      onChange={(e) => onSearch(e.target.value)}
      variant="outlined"
      size="small"
      fullWidth
    />
  );
}
