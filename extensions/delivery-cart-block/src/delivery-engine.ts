/**
 * One bundle for the cart block and the cart-drawer embed.
 * The earliest-date function is the same module the server imports.
 */
export { earliestDate } from "@domain/delivery/earliest-date";
export { validateSelection } from "@domain/delivery/selection";

import { boot } from "./boot";

boot();
