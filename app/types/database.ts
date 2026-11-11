import type { DatabaseV8 } from "@/prisma/v8/client";

// Model types come from the emitted contract. Read adapters preserve established
// defaults for fields absent in historical documents.
type Model<Name extends keyof DatabaseV8["db"]["orm"]> = NonNullable<Awaited<ReturnType<DatabaseV8["db"]["orm"][Name]["first"]>>>;
export type Listing = Model<"Listing">;
export type Bid = Model<"Bid">;
export type Notification = Model<"Notification">;
