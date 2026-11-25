export const completionFields = {
  payment: { buyer: "paymentBuyerConfirmedAt", seller: "paymentSellerConfirmedAt" },
  paperwork: { buyer: "paperworkBuyerConfirmedAt", seller: "paperworkSellerConfirmedAt" },
  pickup: { buyer: "pickupBuyerConfirmedAt", seller: "pickupSellerConfirmedAt" },
} as const;

export type CompletionStep = keyof typeof completionFields;
export type TransactionRole = "buyer" | "seller";
export type CompletionField = (typeof completionFields)[CompletionStep][TransactionRole];
export type CompletionFields = Partial<Record<CompletionField, Date | null>>;
export type TransactionCompletion = Record<CompletionStep, Record<TransactionRole, string | null>>;

export const soldAuction = { status: "ENDED", result: "SOLD" } as const;

export function transactionAnchor(listingId: string) {
  return `transaction-${listingId}`;
}

export function transactionHref(listingId: string) {
  return `/account/shipments#${transactionAnchor(listingId)}`;
}

export const completionSteps: { id: CompletionStep; title: string; description: string }[] = [
  { id: "payment", title: "Payment", description: "Confirm the agreed payment has been received by the seller." },
  { id: "paperwork", title: "Paperwork", description: "Confirm the title, bill of sale, and agreed documents have been exchanged." },
  { id: "pickup", title: "Pickup", description: "Confirm the vehicle and keys have been handed over to the buyer or their transporter." },
];

export function transactionCompletion(listing: CompletionFields): TransactionCompletion {
  const confirmations = (step: CompletionStep) => ({
    buyer: listing[completionFields[step].buyer]?.toISOString() ?? null,
    seller: listing[completionFields[step].seller]?.toISOString() ?? null,
  });
  return { payment: confirmations("payment"), paperwork: confirmations("paperwork"), pickup: confirmations("pickup") };
}

export function completedStepCount(completion: TransactionCompletion) {
  return completionSteps.filter(({ id }) => completion[id].buyer && completion[id].seller).length;
}
