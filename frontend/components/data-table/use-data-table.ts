import * as React from "react";
import {
  type ColumnFiltersState,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
// TanStack Table v9 replaced useReactTable/get*RowModel with a modular
// features API. @tanstack/react-table/legacy is the library's own v8
// compatibility layer (see its JSDoc) and keeps this file's behavior
// unchanged; see zentinelle#402 for graduating off it.
import {
  type LegacyColumnDef as ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useLegacyTable,
} from "@tanstack/react-table/legacy";

type UseDataTableOptions<TData extends RowData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  getRowId?: (row: TData) => string;
  initialSorting?: SortingState;
  pageSize?: number;
};

export const useDataTable = <TData extends RowData>(options: UseDataTableOptions<TData>) => {
  const { data, columns, getRowId, initialSorting = [], pageSize = 10 } = options;

  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  const table = useLegacyTable({
    data,
    columns,
    getRowId,
    state: { sorting, columnFilters, globalFilter, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater);
      resetPage();
    },
    onGlobalFilterChange: (value) => {
      setGlobalFilter(value);
      resetPage();
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return { table };
};
