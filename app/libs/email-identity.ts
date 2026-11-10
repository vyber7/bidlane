import { getNativeRepositories } from "./native-repositories";
import { ApiRequestError, parseApiInput } from "./api-request";
import { normalizeEmail } from "@/app/utils/email";
import { registrationSchema } from "@/app/schemas/account";

/** Include legacy mixed-case records without rewriting their session/proof bindings. */
export function findUsersByEmailIdentity(email: string) {
  return getNativeRepositories().users.emailMatches(normalizeEmail(email));
}

export async function assertEmailAvailable(email: string) {
  // Use the same ASCII email grammar for password and OAuth account creation.
  // This also keeps JS normalization and MongoDB's case-insensitive match aligned.
  const canonical = parseApiInput(registrationSchema.shape.email, email);
  const existing = await getNativeRepositories().users.emailExists(canonical);
  if (existing) throw new ApiRequestError(409, "An account with this email already exists");
  // Every new writer must persist this value. User.email's existing unique index
  // then arbitrates concurrent password/OAuth signups, even if both checks pass.
  return canonical;
}
