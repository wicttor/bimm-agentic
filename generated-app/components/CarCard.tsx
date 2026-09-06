import { useMediaQuery, Card, CardContent, CardMedia, Typography } from "@mui/material";
import type { Car } from "@/types";

interface CarCardProps {
  car: Car;
}

/**
 * Displays a single car as a MUI Card with responsive images.
 *
 * Uses `useMediaQuery` to select the appropriate image URL based on viewport width:
 * - mobile: ≤ 640px
 * - tablet: 641–1023px
 * - desktop: ≥ 1024px
 *
 * This approach allows the image selection logic to be tested with matchMedia mocks.
 */
export function CarCard({ car }: CarCardProps) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const isTablet = useMediaQuery("(min-width: 641px) and (max-width: 1023px)");

  // Select image based on viewport width
  const imageSrc = isMobile ? car.mobile : isTablet ? car.tablet : car.desktop;

  return (
    <Card data-testid="car-card">
      <CardMedia
        component="img"
        image={imageSrc}
        alt={`${car.year} ${car.make} ${car.model}`}
      />
      <CardContent>
        <Typography variant="h6">
          {car.year} {car.make} {car.model}
        </Typography>
        <Typography color="text.secondary">Color: {car.color}</Typography>
        <Typography color="text.secondary">
          Mileage: {car.mileage.toLocaleString()}
        </Typography>
      </CardContent>
    </Card>
  );
}
