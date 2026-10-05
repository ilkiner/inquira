// Single-tenant MVP: one clinic per deployment. Replace this demo profile with
// the real clinic's data. Everything here is fed to the AI as its knowledge base,
// so keep it factual — the assistant will not invent anything that isn't here.

export type Treatment = {
  name: string;
  priceRange: string; // shown to patients as an indicative range, never a final quote
  includes?: string[];
  notes?: string;
};

export type ClinicConfig = {
  name: string;
  city: string;
  country: string;
  timezone: string;
  coordinatorName: string;
  languages: string[];
  currency: string;
  treatments: Record<string, Treatment[]>;
  faq: { q: string; a: string }[];
  policies: string[];
  // Questions the assistant should try to answer during qualification.
  qualificationGoals: string[];
};

export const clinic: ClinicConfig = {
  name: "Lumen Clinic (demo)",
  city: "Istanbul",
  country: "Türkiye",
  timezone: "Europe/Istanbul",
  coordinatorName: "Elif",
  languages: ["English", "Türkçe", "Русский", "Deutsch", "العربية", "Azərbaycanca"],
  currency: "EUR",
  treatments: {
    "Hair transplant": [
      {
        name: "FUE hair transplant",
        priceRange: "€1,900 – €2,800",
        includes: ["3 nights 4★ hotel", "VIP airport transfers", "PRP session", "medication & aftercare kit"],
        notes: "Final graft count and price are confirmed by the doctor after reviewing photos.",
      },
      {
        name: "DHI hair transplant",
        priceRange: "€2,400 – €3,300",
        includes: ["3 nights 4★ hotel", "VIP airport transfers", "PRP session"],
      },
    ],
    Dental: [
      { name: "Zirconia crown", priceRange: "€180 – €250 per tooth" },
      { name: "Dental implant (incl. crown)", priceRange: "€450 – €700 per implant" },
      {
        name: "Smile makeover (veneers/crowns, full arch)",
        priceRange: "€3,500 – €6,000",
        notes: "Usually 2 visits, 5–7 days each. Exact plan needs a panoramic X-ray.",
      },
    ],
    "Aesthetic surgery": [
      { name: "Rhinoplasty", priceRange: "€2,800 – €3,800", includes: ["1 night hospital stay", "5 nights hotel", "transfers"] },
    ],
  },
  faq: [
    { q: "How long should I stay?", a: "Hair transplant: 3 days. Dental: 5–7 days per visit. Rhinoplasty: about 7 days." },
    { q: "Is a consultation free?", a: "Yes, the online consultation and the treatment plan are free." },
    { q: "Who performs the procedure?", a: "Licensed specialists; the doctor reviews every case before a plan is issued." },
    { q: "How do I pay?", a: "A small deposit secures the date; the rest is paid at the clinic (cash or card)." },
  ],
  policies: [
    "Prices are indicative ranges until a doctor reviews the case.",
    "Deposits are refundable up to 14 days before the scheduled date.",
  ],
  qualificationGoals: [
    "which treatment they are interested in",
    "their country (for travel planning)",
    "when they would like to come (timeframe)",
    "for hair: Norwood stage or a description; for dental: what work they think they need",
    "relevant health notes they volunteer (smoker, diabetes, blood thinners) — never diagnose",
    "a WhatsApp number or email so the coordinator can send the personal plan",
  ],
};
