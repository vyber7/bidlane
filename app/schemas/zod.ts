// The one place the app imports zod. Every other module imports `z` from here,
// so this config runs before any schema is built.
// eslint-disable-next-line no-restricted-imports
import { z } from "zod";

// Without this, zod probes `new Function` to decide whether to compile fast
// parsers. The probe is caught, but browsers still report it as a Content
// Security Policy violation on every page with a form.
z.config({ jitless: true });

export { z };
