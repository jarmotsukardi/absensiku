type CoordinateInput = string | number | null | undefined;

const toNumber = (value: CoordinateInput): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isRealOfficeCoordinate = (
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean => {
  if (typeof latitude !== "number" || typeof longitude !== "number") return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
};

export type OfficeCoordinateValidationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; message: string };

export const validateOfficeCoordinateInput = (
  latitudeInput: CoordinateInput,
  longitudeInput: CoordinateInput
): OfficeCoordinateValidationResult => {
  const latitude = toNumber(latitudeInput);
  const longitude = toNumber(longitudeInput);

  if (latitude === null || longitude === null) {
    return { ok: false, message: "Koordinat wajib diisi." };
  }
  if (latitude < -90 || latitude > 90) {
    return { ok: false, message: "Latitude harus di antara -90 sampai 90." };
  }
  if (longitude < -180 || longitude > 180) {
    return { ok: false, message: "Longitude harus di antara -180 sampai 180." };
  }
  if (latitude === 0 && longitude === 0) {
    return { ok: false, message: "Koordinat 0,0 tidak diperbolehkan. Gunakan koordinat kantor real." };
  }

  return { ok: true, latitude, longitude };
};
