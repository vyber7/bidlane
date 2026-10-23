export const MAX_VEHICLE_DISCLOSURE_LENGTH = 4000;

export const vehicleSpecificationFields = [
  { id: "transmission", label: "Transmission", options: ["Manual", "Automatic", "Automated manual", "CVT", "Direct drive", "Other", "Unknown"] },
  { id: "drivetrain", label: "Drivetrain", options: ["Front-wheel drive", "Rear-wheel drive", "All-wheel drive", "Four-wheel drive", "Other", "Unknown"] },
  { id: "titleStatus", label: "Title status", options: ["Clean", "Salvage", "Rebuilt", "Bill of sale only", "Other", "Unknown"] },
] as const;

export const vehicleDisclosureFields = [
  {
    id: "serviceHistory", label: "Service history",
    hint: "Include recent work, dates or mileage, and available records. If the history is unknown or records are unavailable, say so.",
    placeholder: "e.g. Oil service at 42,000 miles in June 2026. Receipts available; earlier history unknown.",
  },
  {
    id: "modifications", label: "Modifications",
    hint: "Describe changes from factory specification, who performed the work, and whether original parts are included. If none are known, write “None known.”",
    placeholder: "e.g. Aftermarket exhaust installed in 2024. Original exhaust included.",
  },
  {
    id: "knownFlaws", label: "Known flaws",
    hint: "Disclose known mechanical, electrical, body, paint, or interior issues, including damage and warning lights. If none are known, write “None known.”",
    placeholder: "e.g. Stone chips on the hood and wear on the driver’s seat. Air conditioning needs attention.",
  },
] as const;

export type VehicleDetails = Partial<Record<
  typeof vehicleSpecificationFields[number]["id"] | typeof vehicleDisclosureFields[number]["id"],
  string | null
>>;
