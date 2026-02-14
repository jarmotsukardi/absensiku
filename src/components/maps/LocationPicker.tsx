import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { MapPin, ExternalLink, Search, Crosshair, Map } from "lucide-react";

interface LocationPickerProps {
  latitude: string;
  longitude: string;
  onLocationChange: (lat: string, lng: string) => void;
  address?: string;
  onAddressChange?: (address: string) => void;
}

export function LocationPicker({
  latitude,
  longitude,
  onLocationChange,
  address,
  onAddressChange,
}: LocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  const hasCoordinates = latitude && longitude && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude));

  // Get current location using browser geolocation
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Browser Anda tidak mendukung geolocation");
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onLocationChange(
          position.coords.latitude.toFixed(6),
          position.coords.longitude.toFixed(6)
        );
        setIsGettingLocation(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Gagal mendapatkan lokasi. Pastikan GPS aktif.");
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Open Google Maps search
  const openGoogleMapsSearch = () => {
    const query = searchQuery || address || "";
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    window.open(url, "_blank");
  };

  // Open Google Maps with current coordinates
  const openGoogleMapsCoords = () => {
    if (!hasCoordinates) return;
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    window.open(url, "_blank");
  };

  // Open Google Maps to pick location
  const openGoogleMapsPickLocation = () => {
    // Default to Maluku Tengah if no coordinates
    const lat = hasCoordinates ? latitude : "-3.3573";
    const lng = hasCoordinates ? longitude : "128.1814";
    const url = `https://www.google.com/maps/@${lat},${lng},17z`;
    window.open(url, "_blank");
  };

  // Parse coordinates from Google Maps URL
  const parseGoogleMapsUrl = (url: string): { lat: string; lng: string } | null => {
    try {
      // Pattern 1: @lat,lng,zoom
      const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (atMatch) {
        return { lat: atMatch[1], lng: atMatch[2] };
      }

      // Pattern 2: ?q=lat,lng
      const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (qMatch) {
        return { lat: qMatch[1], lng: qMatch[2] };
      }

      // Pattern 3: place/.../@lat,lng
      const placeMatch = url.match(/place\/[^/]+\/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (placeMatch) {
        return { lat: placeMatch[1], lng: placeMatch[2] };
      }

      // Pattern 4: /maps/dir/.../@lat,lng
      const dirMatch = url.match(/\/maps\/[^@]+@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (dirMatch) {
        return { lat: dirMatch[1], lng: dirMatch[2] };
      }

      return null;
    } catch {
      return null;
    }
  };

  // Handle paste from Google Maps
  const handlePasteUrl = () => {
    navigator.clipboard.readText().then((text) => {
      if (text.includes("google.com/maps") || text.includes("goo.gl/maps")) {
        const coords = parseGoogleMapsUrl(text);
        if (coords) {
          onLocationChange(coords.lat, coords.lng);
        } else {
          alert("Tidak dapat membaca koordinat dari URL. Pastikan URL valid.");
        }
      } else {
        alert("URL bukan dari Google Maps. Paste URL Google Maps untuk mendapatkan koordinat.");
      }
    }).catch(() => {
      alert("Gagal membaca clipboard. Izinkan akses clipboard.");
    });
  };

  return (
    <div className="space-y-4">
      {/* Search and Quick Actions */}
      <div className="space-y-2">
        <Label>Cari Lokasi di Google Maps</Label>
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Nama tempat atau alamat..."
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={openGoogleMapsSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={getCurrentLocation}
          disabled={isGettingLocation}
        >
          <Crosshair className="h-4 w-4 mr-2" />
          {isGettingLocation ? "Mencari..." : "Lokasi Saya"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openGoogleMapsPickLocation}
        >
          <Map className="h-4 w-4 mr-2" />
          Pilih di Maps
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePasteUrl}
        >
          <MapPin className="h-4 w-4 mr-2" />
          Paste URL Maps
        </Button>
      </div>

      {/* Coordinate Inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Latitude</Label>
          <Input
            value={latitude}
            onChange={(e) => onLocationChange(e.target.value, longitude)}
            placeholder="-3.6954"
          />
        </div>
        <div className="space-y-2">
          <Label>Longitude</Label>
          <Input
            value={longitude}
            onChange={(e) => onLocationChange(latitude, e.target.value)}
            placeholder="128.1814"
          />
        </div>
      </div>

      {/* Preview Card */}
      {hasCoordinates && (
        <Card className="p-3 bg-muted/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="font-mono text-xs">
                {latitude}, {longitude}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openGoogleMapsCoords}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Lihat di Maps
            </Button>
          </div>
        </Card>
      )}

      {/* Instructions */}
      <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
        <p className="font-medium mb-1">Cara mendapatkan koordinat:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Klik "Pilih di Maps" untuk membuka Google Maps</li>
          <li>Cari dan klik lokasi yang diinginkan</li>
          <li>Klik kanan pada titik lokasi, lalu klik koordinat yang muncul</li>
          <li>Koordinat akan ter-copy, kembali ke sini dan klik "Paste URL Maps"</li>
        </ol>
      </div>

      {/* Address Field */}
      {onAddressChange && (
        <div className="space-y-2">
          <Label>Alamat Lengkap</Label>
          <Input
            value={address || ""}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder="Jl. Contoh No. 123, Kecamatan, Kabupaten"
          />
        </div>
      )}
    </div>
  );
}
