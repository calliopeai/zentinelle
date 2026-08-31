export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
      {message}
    </div>
  );
}
