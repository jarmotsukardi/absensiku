import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { MapPin, ExternalLink, Search, Crosshair, Map } from "lucide-react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import "leaflet/dist/leaflet.css";

interface LocationPickerProps {
  latitude: string;
  longitude: string;
  onLocationChange: (lat: string, lng: string) => void;
  address?: string;
  onAddressChange?: (address: string) => void;
}

interface LocationSearchResult {
  id: string;
  displayName: string;
  lat: string;
  lon: string;
}

type MapPoint = [number, number];

const DEFAULT_MAP_CENTER: MapPoint = [-3.3573, 128.1814];
const DEFAULT_MAP_ZOOM = 14;

function parseMapPoint(lat: string, lng: string): MapPoint | null {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return null;
  return [latNum, lngNum];
}

function LeafletMapCenterUpdater({ center, zoom }: { center: MapPoint; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, map, zoom]);
  return null;
}

function LeafletMapClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click: (event) => {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export function LocationPicker({
  latitude,
  longitude,
  onLocationChange,
  address,
  onAddressChange,
}: LocationPickerProps) {
  const parsedCoordinates = parseMapPoint(latitude, longitude);
  const [searchQuery, setSearchQuery] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isWaitingClipboard, setIsWaitingClipboard] = useState(false);
  const [clipboardHint, setClipboardHint] = useState<string | null>(null);
  const [isMapsOverlayOpen, setIsMapsOverlayOpen] = useState(false);
  const [pasteCoordinateInput, setPasteCoordinateInput] = useState("");
  const [overlaySearchQuery, setOverlaySearchQuery] = useState("");
  const [overlaySearchResults, setOverlaySearchResults] = useState<LocationSearchResult[]>([]);
  const [overlaySearchError, setOverlaySearchError] = useState<string | null>(null);
  const [isOverlaySearching, setIsOverlaySearching] = useState(false);
  const [mapCenter, setMapCenter] = useState<MapPoint>(parsedCoordinates ?? DEFAULT_MAP_CENTER);
  const [mapZoom, setMapZoom] = useState<number>(parsedCoordinates ? 16 : DEFAULT_MAP_ZOOM);

  const hasCoordinates = Boolean(parsedCoordinates);

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
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    window.open(url, "_blank");
  };

  // Open Google Maps with current coordinates
  const openGoogleMapsCoords = () => {
    if (!hasCoordinates) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    window.open(url, "_blank");
  };

  // Open Google Maps to pick location
  const openGoogleMapsPickLocation = () => {
    setPasteCoordinateInput("");
    setOverlaySearchQuery(searchQuery || address || "");
    setOverlaySearchResults([]);
    setOverlaySearchError(null);
    setMapCenter(parsedCoordinates ?? DEFAULT_MAP_CENTER);
    setMapZoom(parsedCoordinates ? 16 : DEFAULT_MAP_ZOOM);
    setIsMapsOverlayOpen(true);
    setIsWaitingClipboard(false);
    setClipboardHint(
      "Klik langsung titik di peta untuk mengisi latitude/longitude otomatis."
    );
  };

  const getMapsQuery = () =>
    searchQuery || address || (hasCoordinates ? `${latitude},${longitude}` : "-3.3573,128.1814");

  const openGoogleMapsExternal = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(getMapsQuery())}`;
    setIsWaitingClipboard(true);
    setClipboardHint("Setelah menyalin link/koordinat dari Google Maps, kembali lalu klik 'Ambil dari Clipboard'.");
    window.open(url, "_blank");
  };

  const searchLocationsInOverlay = useCallback(async () => {
    const query = overlaySearchQuery.trim();
    if (!query) {
      setOverlaySearchError("Masukkan kata kunci lokasi terlebih dahulu.");
      setOverlaySearchResults([]);
      return;
    }

    setIsOverlaySearching(true);
    setOverlaySearchError(null);

    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        limit: "8",
        countrycodes: "id",
        q: query,
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as Array<{
        place_id?: number;
        display_name?: string;
        lat?: string;
        lon?: string;
      }>;

      const results = data
        .filter((item) => item.display_name && item.lat && item.lon)
        .map((item) => ({
          id: String(item.place_id || `${item.lat},${item.lon}`),
          displayName: item.display_name as string,
          lat: item.lat as string,
          lon: item.lon as string,
        }));

      setOverlaySearchResults(results);
      if (results.length === 0) {
        setOverlaySearchError("Lokasi tidak ditemukan. Coba kata kunci lain.");
      }
    } catch (error) {
      const errorRef = reportError(error, "maps.location_picker.overlay_search", {
        query,
      });
      setOverlaySearchResults([]);
      setOverlaySearchError(appendErrorReference("Pencarian lokasi gagal", errorRef));
    } finally {
      setIsOverlaySearching(false);
    }
  }, [overlaySearchQuery]);

  const applyOverlaySearchResult = useCallback(
    (result: LocationSearchResult) => {
      onLocationChange(result.lat, result.lon);
      setSearchQuery(result.displayName);
      setOverlaySearchQuery(result.displayName);
      setMapCenter([Number(result.lat), Number(result.lon)]);
      setMapZoom(17);
      if (onAddressChange) {
        onAddressChange(result.displayName);
      }
      setClipboardHint("Koordinat berhasil diisi dari hasil pencarian lokasi.");
      setIsWaitingClipboard(false);
    },
    [onAddressChange, onLocationChange]
  );

  const applyMapSelection = useCallback(
    async (latValue: number, lngValue: number) => {
      const lat = latValue.toFixed(6);
      const lng = lngValue.toFixed(6);
      onLocationChange(lat, lng);
      setMapCenter([latValue, lngValue]);
      setMapZoom(17);
      setIsWaitingClipboard(false);
      setClipboardHint(`Koordinat terisi dari titik peta: ${lat}, ${lng}`);

      if (!onAddressChange) return;

      try {
        const params = new URLSearchParams({
          format: "jsonv2",
          lat,
          lon: lng,
          "accept-language": "id",
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
          headers: {
            Accept: "application/json",
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as { display_name?: string };
        if (data.display_name) {
          onAddressChange(data.display_name);
          setSearchQuery(data.display_name);
        }
      } catch (error) {
        const errorRef = reportError(error, "maps.location_picker.reverse_geocode", { lat, lng });
        setClipboardHint(
          appendErrorReference(
            `Koordinat terisi, tapi alamat otomatis gagal dimuat (${lat}, ${lng})`,
            errorRef
          )
        );
      }
    },
    [onAddressChange, onLocationChange]
  );

  const parseCoordinatesFromText = useCallback((text: string): { lat: string; lng: string } | null => {
    const value = text.trim();
    if (!value) return null;

    // Pattern 1: @lat,lng,zoom
    const atMatch = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (atMatch) {
      return { lat: atMatch[1], lng: atMatch[2] };
    }

    // Pattern 2: ?q=lat,lng or query=lat,lng
    const qMatch = value.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (qMatch) {
      return { lat: qMatch[1], lng: qMatch[2] };
    }

    // Pattern 3: plain lat,lng or lat lng
    const plainMatch = value.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (plainMatch) {
      return { lat: plainMatch[1], lng: plainMatch[2] };
    }

    // Pattern 4: Google shared link !3dLAT!4dLNG
    const dMatch = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (dMatch) {
      return { lat: dMatch[1], lng: dMatch[2] };
    }

    return null;
  }, []);

  const applyClipboardCoordinates = useCallback(
    async (silent = false) => {
      if (!navigator.clipboard?.readText) {
        if (!silent) {
          setClipboardHint("Browser tidak mengizinkan baca clipboard. Tempel manual koordinat pada input.");
        }
        return false;
      }

      try {
        const text = await navigator.clipboard.readText();
        const coords = parseCoordinatesFromText(text);
        if (!coords) {
          if (!silent) {
            setClipboardHint("Clipboard tidak berisi koordinat/link Google Maps yang valid.");
          }
          return false;
        }
        onLocationChange(coords.lat, coords.lng);
        const point = parseMapPoint(coords.lat, coords.lng);
        if (point) {
          setMapCenter(point);
          setMapZoom(17);
        }
        setIsWaitingClipboard(false);
        setClipboardHint("Koordinat berhasil terisi otomatis dari clipboard.");
        return true;
      } catch {
        if (!silent) {
          setClipboardHint("Gagal membaca clipboard. Izinkan akses clipboard pada browser.");
        }
        return false;
      }
    },
    [onLocationChange, parseCoordinatesFromText]
  );

  useEffect(() => {
    if (!isWaitingClipboard) return;
    const handleFocus = () => {
      void applyClipboardCoordinates(true);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [applyClipboardCoordinates, isWaitingClipboard]);

  useEffect(() => {
    if (!isMapsOverlayOpen) return;
    const currentPoint = parseMapPoint(latitude, longitude);
    if (currentPoint) {
      setMapCenter(currentPoint);
      setMapZoom(16);
      return;
    }
    setMapCenter(DEFAULT_MAP_CENTER);
    setMapZoom(DEFAULT_MAP_ZOOM);
  }, [isMapsOverlayOpen, latitude, longitude]);

  return (
    <div className="space-y-4">
      {/* Search and Quick Actions */}
      <div className="space-y-2">
        <Label>Cari Lokasi</Label>
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
      <TooltipProvider delayDuration={120}>
        <div className="flex flex-wrap gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent>
              Ambil titik GPS perangkat Anda sekarang (pastikan izin lokasi aktif).
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openGoogleMapsPickLocation}
              >
                <Map className="h-4 w-4 mr-2" />
                Pilih di Maps
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Buka peta interaktif. Klik titik peta langsung mengisi latitude/longitude.
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void applyClipboardCoordinates(false)}
              >
                <MapPin className="h-4 w-4 mr-2" />
                Ambil dari Clipboard
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Tempel/salin link atau koordinat Google Maps lalu isi field latitude/longitude otomatis.
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {clipboardHint && (
        <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {clipboardHint}
        </div>
      )}

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
          <li>Klik "Pilih di Maps" untuk membuka peta interaktif</li>
          <li>Klik titik lokasi pada peta, koordinat langsung terisi otomatis</li>
          <li>Atau pakai "Ambil dari Clipboard" untuk tempel link/koordinat dari Maps</li>
          <li>Gunakan "Lihat di Maps" untuk verifikasi titik akhir</li>
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

      <Dialog open={isMapsOverlayOpen} onOpenChange={setIsMapsOverlayOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pilih Lokasi di Peta (Leaflet + OpenStreetMap)</DialogTitle>
            <DialogDescription>
              Klik titik mana pun pada peta untuk langsung mengisi field latitude/longitude.
              Anda juga bisa cari lokasi lalu klik hasil pencarian.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-foreground/80">
              <p className="mb-1 font-semibold text-foreground">Panduan singkat</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>Ketik nama tempat/alamat pada kolom pencarian lalu klik <b>Cari</b>.</li>
                <li>Klik salah satu hasil pencarian untuk mengisi <b>latitude/longitude</b> otomatis.</li>
                <li>Atau klik langsung titik pada peta untuk memilih koordinat paling presisi.</li>
              </ol>
              <p className="mt-2">
                Catatan: geser peta untuk navigasi, lalu klik titik yang diinginkan untuk mengisi koordinat.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Filter Pencarian Lokasi</Label>
              <div className="flex gap-2">
                <Input
                  value={overlaySearchQuery}
                  onChange={(event) => setOverlaySearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchLocationsInOverlay();
                    }
                  }}
                  placeholder="Cari nama tempat/alamat (contoh: Kantor Bupati Maluku Tengah)"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void searchLocationsInOverlay()}
                  disabled={isOverlaySearching}
                >
                  {isOverlaySearching ? "Mencari..." : "Cari"}
                </Button>
              </div>
              {overlaySearchError && (
                <p className="text-xs text-destructive">{overlaySearchError}</p>
              )}
              {overlaySearchResults.length > 0 && (
                <div className="max-h-52 overflow-y-auto rounded-md border">
                  {overlaySearchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className="w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/60"
                      onClick={() => applyOverlaySearchResult(result)}
                    >
                      <p className="text-sm font-medium">{result.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {result.lat}, {result.lon}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-md border">
              <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                scrollWheelZoom
                className="h-[380px] w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LeafletMapCenterUpdater center={mapCenter} zoom={mapZoom} />
                <LeafletMapClickHandler
                  onPick={(latValue, lngValue) => {
                    void applyMapSelection(latValue, lngValue);
                  }}
                />
                {parsedCoordinates && (
                  <CircleMarker
                    center={parsedCoordinates}
                    radius={10}
                    pathOptions={{ color: "#1D4ED8", fillColor: "#3B82F6", fillOpacity: 0.35, weight: 2 }}
                  >
                    <Popup>
                      Titik terpilih
                      <br />
                      {latitude}, {longitude}
                    </Popup>
                  </CircleMarker>
                )}
              </MapContainer>
            </div>

            <div className="grid gap-2">
              <Label>Tempel link/koordinat (opsional)</Label>
              <div className="flex gap-2">
                <Input
                  value={pasteCoordinateInput}
                  onChange={(event) => setPasteCoordinateInput(event.target.value)}
                  placeholder="Contoh: -3.6954,128.1814 atau URL maps"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const coords = parseCoordinatesFromText(pasteCoordinateInput);
                    if (!coords) {
                      setClipboardHint("Format tempelan belum valid. Gunakan koordinat atau URL Google Maps.");
                      return;
                    }
                    onLocationChange(coords.lat, coords.lng);
                    const point = parseMapPoint(coords.lat, coords.lng);
                    if (point) {
                      setMapCenter(point);
                      setMapZoom(17);
                    }
                    setClipboardHint("Koordinat berhasil diisi dari tempelan.");
                    setIsWaitingClipboard(false);
                  }}
                >
                  Gunakan
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={openGoogleMapsExternal}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Buka Google Maps
              </Button>
              <Button type="button" variant="outline" onClick={() => void applyClipboardCoordinates(false)}>
                <MapPin className="mr-2 h-4 w-4" />
                Ambil dari Clipboard
              </Button>
            </div>
            <Button type="button" onClick={() => setIsMapsOverlayOpen(false)}>
              Selesai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
