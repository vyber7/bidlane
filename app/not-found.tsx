import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-semibold text-gray-500">404</p>
      <h1 className="text-balance text-2xl font-bold">Page Not Found</h1>
      <p className="text-gray-600">
        This page may have moved, or the link may be incorrect.
      </p>
      <Link
        href="/"
        className="rounded-md bg-gray-900 px-4 py-2 font-semibold text-white hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
      >
        Browse Auctions
      </Link>
    </div>
  );
}
