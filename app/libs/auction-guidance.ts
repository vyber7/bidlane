export const auctionRules = [
  {
    title: "Two-minute finish",
    description: "Each accepted bid with two minutes or less remaining resets the deadline to two minutes after that bid. For example, a bid with 20 seconds left gives everyone two minutes to respond. Further late bids can extend the auction again.",
  },
  {
    title: "Reserves and results",
    description: "A reserve is the seller’s minimum sale price. The highest accepted bid must meet or exceed any reserve for the vehicle to sell. With no reserve, the highest accepted bid wins. If there are no bids or the reserve is not met, the auction closes without a sale.",
  },
  {
    title: "Review, then confirm",
    description: "Bids are in whole US dollars. The first bid must meet the starting price; later bids must meet the current bid plus the seller’s bid increment. You review the exact amount before confirming. BidLane records that amount and does not automatically raise your bid.",
  },
] as const;

export const handoffSteps = [
  { title: "Contact the other party", description: "Use the buyer or seller contact details to start the conversation and confirm the vehicle and auction result." },
  { title: "Agree payment and paperwork", description: "Confirm payment arrangements, the ownership documents, and who will handle taxes, registration, and other costs." },
  { title: "Arrange pickup or transport", description: "Agree a handoff date, pickup location, and any carrier or insurance arrangements directly with the other party." },
] as const;
