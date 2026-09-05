import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-semibold text-gray-500">404</p>
      <h1 className="text-2xl font-bold">Auction not found</h1>
      <p className="text-gray-600">
        This auction may have been removed or the link may be incorrect.
      </p>
      <Link
        href="/"
        className="rounded-md bg-gray-900 px-4 py-2 font-semibold text-white hover:bg-gray-700"
      >
        Browse auctions
      </Link>
    </div>
  );
}
