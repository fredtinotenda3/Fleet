export default function Loading() {
  return (
    <div className="container mx-auto p-6">
      <div className="animate-pulse space-y-6">
        <div className="h-10 bg-muted rounded w-1/3 mb-8" />
        <div className="space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-[400px] bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  );
}
