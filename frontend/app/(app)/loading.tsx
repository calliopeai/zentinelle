import { Skeleton } from "@calliopelabs/ui";

const CARD = "bg-card flex flex-col gap-4 rounded-lg border p-6";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={CARD}>
            <div className="flex flex-row items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
            <div>
              <Skeleton className="mb-2 h-8 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`${CARD} lg:col-span-2`}>
          <div>
            <Skeleton className="mb-1 h-5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <div>
            <Skeleton className="h-[240px] w-full rounded-md" />
          </div>
        </div>

        <div className={CARD}>
          <div>
            <Skeleton className="mb-1 h-5 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div>
            <Skeleton className="h-[240px] w-full rounded-md" />
          </div>
        </div>
      </div>

      <div className={CARD}>
        <div>
          <Skeleton className="mb-1 h-5 w-36" />
          <Skeleton className="h-3 w-52" />
        </div>
        <div>
          <Skeleton className="h-[200px] w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
