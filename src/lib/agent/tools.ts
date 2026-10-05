import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const nullableString = (description: string) => ({ type: ["string", "null"], description });

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "update_lead",
    description:
      "Save what you learned about the patient to the clinic's lead record. Call it whenever the patient reveals new information. Fields set to null are left unchanged.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        "country",
        "language",
        "treatment",
        "timeframe",
        "budget",
        "whatsapp",
        "email",
        "medical_notes",
        "summary",
        "stage",
        "score",
      ],
      properties: {
        name: nullableString("Patient's name as they gave it."),
        country: nullableString("Country they would travel from."),
        language: nullableString("Language of the conversation, e.g. 'English', 'Русский'."),
        treatment: nullableString("Treatment they are interested in, as specific as known."),
        timeframe: nullableString("When they want to come, e.g. 'March 2027', 'next month', 'undecided'."),
        budget: nullableString("Budget if they mentioned one, in their words."),
        whatsapp: nullableString("WhatsApp/phone number including country code, exactly as given."),
        email: nullableString("Email address, exactly as given."),
        medical_notes: nullableString("Health details they volunteered (e.g. smoker, diabetes, Norwood 4). No diagnosis."),
        summary: nullableString("One or two sentences for the coordinator: who, what, when, readiness."),
        stage: {
          type: "string",
          enum: ["unchanged", "qualifying", "qualified", "lost"],
          description:
            "qualifying: exchanging info. qualified: treatment + timeframe known and contact given. lost: clearly not coming. unchanged: keep the current stage.",
        },
        score: {
          type: ["integer", "null"],
          description: "0–100 likelihood that this patient books. Null to leave unchanged.",
        },
      },
    },
  },
  {
    name: "handoff_to_coordinator",
    description:
      "Alert the human coordinator to take over this conversation. Use when the patient asks for a human, wants to book or pay, has a complaint, has a medical question you can't answer, or is qualified with contact details.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["reason", "urgency"],
      properties: {
        reason: { type: "string", description: "One sentence: why a human is needed now." },
        urgency: { type: "string", enum: ["normal", "high"], description: "high: ready to book, or upset." },
      },
    },
  },
];

const nullable = z.string().trim().max(500).nullable();

export const updateLeadInput = z.object({
  name: nullable,
  country: nullable,
  language: nullable,
  treatment: nullable,
  timeframe: nullable,
  budget: nullable,
  whatsapp: nullable,
  email: nullable,
  medical_notes: nullable,
  summary: nullable,
  stage: z.enum(["unchanged", "qualifying", "qualified", "lost"]),
  score: z.number().int().min(0).max(100).nullable(),
});

export const handoffInput = z.object({
  reason: z.string().trim().min(1).max(500),
  urgency: z.enum(["normal", "high"]),
});
