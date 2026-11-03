import { z } from "zod";

export const contactTopics = [
  "Selling a vehicle",
  "Buying or bidding",
  "Account support",
  "Partnerships and press",
  "General question",
] as const;

export const contactLimits = { name: 100, email: 254, message: 5000 };

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(contactLimits.name)
    .regex(/^[^\r\n]*$/, "Enter your name on one line."),
  email: z.string().trim().max(contactLimits.email).email("Enter a valid email address."),
  topic: z.enum(contactTopics, { error: "Choose a topic." }),
  message: z.string().trim().min(1, "Enter a message.").max(contactLimits.message),
  website: z.string().max(500).optional().default(""),
  submissionId: z.uuid(),
});
