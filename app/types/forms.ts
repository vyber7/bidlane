export interface AuthFormValues {
  name: string;
  email: string;
  password: string;
}

// Native inputs keep these values as strings until listing validation parses them.
export interface ListingDetailsFormValues {
  make: string;
  model: string;
  year: string;
  miles: string;
  reservePrice: string;
  location: string;
  description: string;
}

export interface BidFormValues {
  bidAmount: number;
}

export interface CommentFormValues {
  comment: string;
}

export interface AuctionStartFormValues {
  endTime: string;
  startingBid: number;
  bidIncrement: number;
}
