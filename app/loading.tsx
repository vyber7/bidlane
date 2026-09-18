export default function Loading() {
  return (
    <div
      className="mx-auto max-w-5xl animate-pulse px-2 pb-8 pt-16"
      aria-label="Loading page"
      aria-busy="true"
    >
      <div className="mb-5 h-6 w-48 rounded bg-gray-300" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-md bg-white shadow">
            <div className="h-48 bg-gray-300" />
            <div className="space-y-3 p-4">
              <div className="h-4 w-3/4 rounded bg-gray-300" />
              <div className="h-4 w-1/2 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
