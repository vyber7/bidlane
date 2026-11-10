import type { DatabaseV8 } from "@/prisma/v8/client";

// Application model types now come from the emitted v8 contract. Read adapters
// still supply Prisma 6's legacy defaults for fields absent in older documents.
type Model<Name extends keyof DatabaseV8["db"]["orm"]> = NonNullable<Awaited<ReturnType<DatabaseV8["db"]["orm"][Name]["first"]>>>;
export type Listing = Model<"Listing">;
export type Bid = Model<"Bid">;
