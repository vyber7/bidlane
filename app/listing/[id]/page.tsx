//"use client";

import prisma from "../../libs/prismadb";
import Title from "@/app/components/Title";
import Description from "./components/Description";
import Comments from "./components/Comments";

import getComments from "@/app/actions/getComments";
import getCurrentUser from "@/app/actions/getCurrentUser";
import getBids from "@/app/actions/getBids";

import AuctionStatusBar from "./components/AuctionStatusBar";
import AuctionStartForm from "./components/AuctionStartForm";
import Bids from "./components/Bids";
//import Views from "./components/Views";
import Gallery from "./components/Gallery";
import CoverImage from "./components/CoverImage";
import getLiveAuctions from "@/app/actions/getLiveAuctions";
import Aside from "@/app/submit-listing/components/Aside";
import { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Bidlane | Auto Auctions",
  description: "Buy and sell cars through auctions",
  icons: { icon: "/favicon.ico" },
};

//gets page's id from url
interface Params {
  params: Promise<{
    id: string;
  }>;
}

const Listing = async (props: Params) => {
  const { id } = await props.params;

  const listing = await prisma.listing.findUnique({
    where: { id },
  });

  if (!listing) notFound();

  const [comments, currentUser, liveAuctions, bids, seller] =
    await Promise.all([
      getComments(id),
      getCurrentUser(),
      getLiveAuctions(),
      getBids(id),
      prisma.user.findUnique({ where: { id: listing.userId } }),
    ]);

  const { year, make, model, description } = listing;

  return (
    <div className="m-auto pt-14 px-2 lg:px-0 lg:pt-16 pb-4 lg:gap-4 flex flex-col lg:flex-row max-w-5xl ">
      <main className="w-full lg:w-10/12 lg:p-0 rounded-md">
        {/* <Views listingId={id} /> */}
        <div className="flex flex-col justify-between gap-2 rounded-t lg:rounded-l lg:gap-4">
          <div>
            <Title year={year} make={make} model={model} large />
            <CoverImage
              listingId={listing.id}
              owner={listing.userId === currentUser?.id}
              url={listing.coverImage as string}
            />
          </div>
          {/* <ProgressBar endTime={listing.auctionEndsAt} listingId={listing.id} /> */}
          <AuctionStatusBar
            listing={listing}
            currentUser={currentUser?.id}
            commentsCount={comments.length}
            bidsCount={bids.length}
          />
          {currentUser?.id === listing.userId &&
            listing.status === "UPCOMING" && (
              <AuctionStartForm listingId={listing.id} />
            )}
          <Description description={description} />
          <Gallery
            listingId={listing.id}
            owner={listing.userId === currentUser?.id}
          />
          {listing.status !== "UPCOMING" && (
            <Bids
              listing={listing}
              bids={bids}
              sellerName={seller?.name}
              sellerEmail={seller?.email}
            />
          )}
          <Comments
            initialComments={comments}
            initialBids={bids}
            listingId={id}
          />
        </div>
      </main>
      <Aside auctions={liveAuctions} variant="live" />
    </div>
  );
};

export default Listing;
