# Bidlane

An online marketplace where sellers list vehicles and buyers bid on them in timed auctions.

## Auction lifecycle

**Listing**:
A vehicle a seller has submitted, together with its Auction. Before Submission it is a Draft.
_Avoid_: Vehicle (when you mean the auction), post

**Auction**:
The timed bidding on a Listing, from Approval to its Result.
_Avoid_: Sale (an Auction may end unsold)

**Auction phase**:
Where an Auction stands right now: Upcoming, Open, Closing, Sold or Unsold.
_Avoid_: Status (the stored field holds only Upcoming, Live and Ended)

**Upcoming**:
The phase before bidding starts, including during Review.
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

## Submitting a Listing

**Draft**:
A vehicle a seller is still describing, saved privately as they go and not yet submitted.
_Avoid_: Listing (before Submission), unpublished listing

**Submission**:
Handing in a Draft, which creates the Listing and sends it to Review. A Draft can be submitted once.
_Avoid_: Publishing (the Listing is not public until Approval)

**Review**:
An administrator's check of a submitted Listing, ending in Approval or Changes requested.
_Avoid_: Moderation

**Awaiting review**:
The state of a Listing after Submission or a Correction, until Review ends. The Listing is hidden from the public.
_Avoid_: Pending

**Approval**:
The Review outcome that makes an Upcoming Listing public and lets its seller start the Auction.
_Avoid_: Publishing, accepted

**Changes requested**:
The Review outcome that keeps the Listing hidden from the public and returns it to the seller with a note on what to fix.
_Avoid_: Rejected, declined

**Correction**:
Any seller change to a submitted Listing before bidding opens. Every Correction, even to a single photo, returns the Listing to Awaiting review.
_Avoid_: Edit, revision

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

## Interface copy

**Copy case**:
Buttons, button-styled links, and headings use Title Case ("Place a Bid", "Review Your Bid"). Body text, eyebrows, badges, navigation link lists, links inside sentences, and headlines written as full sentences ("Great cars. Worth the chase.") use sentence case.
_Avoid_: Mixing cases within one kind of control
