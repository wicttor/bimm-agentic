import { Card, CardMedia, CardContent, Typography } from "@mui/material";
import type { Car } from "@/hooks/useCars";

interface CarCardProps {
  car: Car;
}

export function CarCard({ car }: CarCardProps) {
  const getImageUrl = () => {
    const width = typeof window !== "undefined" ? window.innerWidth : 1024;
    if (width <= 640) return car.mobile || car.tablet || car.desktop;
    if (width <= 1023) return car.tablet || car.desktop;
    return car.desktop || car.tablet;
  };

  return (
    <Card>
      <CardMedia
        component="img"
        height="200"
        image={getImageUrl() || "/placeholder.jpg"}
        alt={car.model}
      />
      <CardContent>
        <Typography variant="h6">
          {car.year} {car.make} {car.model}
        </Typography>
        <Typography color="textSecondary">{car.color}</Typography>
      </CardContent>
    </Card>
  );
}
