import { cache } from "react";
import getCurrentUser from "@/app/actions/getCurrentUser";

// Share the lookup between the layout and page within one server render only.
export const getAccountUser = cache(getCurrentUser);
