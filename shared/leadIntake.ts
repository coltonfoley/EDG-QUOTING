import { z } from "zod";

const optionalTrimmedText = (max: number) => z.string().trim().max(max).optional().nullable();

/**
 * Canonical lead-intake contract shared by website, API, and staff-entered leads.
 * Contact/address fields persist to accounts; inquiry fields persist to lead_inquiries.
 */
export const leadIntakeSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  firstName: z.string().trim().min(1).max(255),
  lastName: optionalTrimmedText(255),
  phone: optionalTrimmedText(50),
  company: optionalTrimmedText(255),
  location: optionalTrimmedText(500),
  streetAddress: optionalTrimmedText(500),
  addressLine2: optionalTrimmedText(255),
  city: optionalTrimmedText(255),
  state: optionalTrimmedText(100),
  zipCode: optionalTrimmedText(20),
  country: optionalTrimmedText(255),
  placeId: optionalTrimmedText(500),
  projectType: optionalTrimmedText(255),
  message: optionalTrimmedText(5000),
  source: optionalTrimmedText(255),
  customerType: optionalTrimmedText(100),
  metadata: z.record(z.unknown()).optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
});

export const manualLeadSchema = leadIntakeSchema.pick({
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  company: true,
  location: true,
  streetAddress: true,
  addressLine2: true,
  city: true,
  state: true,
  zipCode: true,
  country: true,
  placeId: true,
  projectType: true,
  message: true,
}).extend({
  customerType: z.enum(["homeowner", "commercial", "trade"]),
  idempotencyKey: z.string().trim().min(1).max(160),
});

export type LeadIntakeInput = z.infer<typeof leadIntakeSchema>;
