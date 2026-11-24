# Bidlane

An online marketplace where sellers list vehicles and buyers bid on them in timed auctions.

## Auction lifecycle

**Listing**:
A vehicle a seller has submitted, together with its auction.
_Avoid_: Vehicle (when you mean the auction), post

**Auction**:
The timed bidding on a Listing, from approval to its Result.
_Avoid_: Sale (an Auction may end unsold)

**Auction phase**:
Where an Auction stands right now: Upcoming, Open, Closing, Sold or Unsold.
_Avoid_: Status (the stored field holds only Upcoming, Live and Ended)

**Upcoming**:
The phase before bidding starts, including while the Listing is in review.
_Avoid_: Scheduled, pending

**Open**:
The phase in which the Auction is live and its deadline has not passed. Bidding may still be blocked, for example while the auction is not fully configured.
_Avoid_: Active, live (when you mean bids can be placed)

**Closing**:
The phase after the deadline has passed but before Finalization has recorded a Result. It normally lasts seconds.
_Avoid_: Finalizing, expired, bidding closed

**Sold**:
The phase of an ended Auction whose highest bid met any Reserve.

**Unsold**:
The phase of an ended Auction that received no bids or whose highest bid did not meet the Reserve.
_Avoid_: Failed, reserve not met (that is only one of the two reasons)

**Result**:
The recorded outcome of Finalization: sold or reserve not met.

**Finalization**:
Recording an Auction's Result once its deadline has passed.
_Avoid_: Ending the auction (sellers cannot end an auction early)

**Reserve**:
The seller's minimum sale price. An Auction with no Reserve sells to its highest bid.
_Avoid_: Minimum bid (that is the bid ladder)

**Extension**:
The rule that a bid placed in the final two minutes resets the deadline to two minutes after that bid.
_Avoid_: Anti-sniping, overtime

## Following an Auction

**Watcher**:
A user who follows a Listing to hear about its Auction without bidding on it.
_Avoid_: Follower, subscriber

**Watchlist**:
The Listings a user is watching.
_Avoid_: Favourites, saved listings

**Notification**:
A message saved to a user's account about an Auction they bid on, sell or watch, such as being outbid, an ending-soon reminder or a Result.
_Avoid_: Alert; notification (when you mean a Real-time update)

**Real-time update**:
A change shown to people viewing a Listing, or to one signed-in user, without reloading. It can be missed, so it is never the record of what happened.
_Avoid_: Live update, push, broadcast
