import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  type CellData,
  type Column as TanStackColumn,
  type ColumnDef as TanStackColumnDef,
  type ReactTable,
  type RowData,
} from "@tanstack/react-table";

// The TanStack Table v9 features every data table uses: sorting, column and
// global filtering, client paging, column visibility and row selection.
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns,
  sortFns,
});

export type DataTableFeatures = typeof dataTableFeatures;

export type ColumnDef<
  TData extends RowData,
  TValue extends CellData = CellData,
> = TanStackColumnDef<DataTableFeatures, TData, TValue>;

export type Column<
  TData extends RowData,
  TValue extends CellData = CellData,
> = TanStackColumn<DataTableFeatures, TData, TValue>;

export type Table<TData extends RowData> = ReactTable<DataTableFeatures, TData>;
