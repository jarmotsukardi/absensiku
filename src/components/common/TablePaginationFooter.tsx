import { Button } from "@/components/ui/button";

type TablePaginationFooterProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  itemLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
};

export function TablePaginationFooter({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  itemLabel = "item",
  onPrevious,
  onNext,
}: TablePaginationFooterProps) {
  const safePage = Math.min(Math.max(currentPage, 1), Math.max(totalPages, 1));
  const showingFrom = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const showingTo = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Menampilkan {showingFrom}-{showingTo} dari {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={safePage <= 1} onClick={onPrevious}>
          Sebelumnya
        </Button>
        <span className="text-sm text-muted-foreground">
          Halaman {safePage} / {Math.max(totalPages, 1)}
        </span>
        <Button type="button" variant="outline" size="sm" disabled={safePage >= totalPages} onClick={onNext}>
          Berikutnya
        </Button>
      </div>
    </div>
  );
}
