import * as React from "react";
import {
  type ColumnFiltersState,
  type PaginationState,
  type RowData,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import { type ColumnDef, dataTableFeatures } from "./features";

type UseDataTableOptions<TData extends RowData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  getRowId?: (row: TData) => string;
  initialSorting?: SortingState;
  pageSize?: number;
};

export const useDataTable = <TData extends RowData>(
  options: UseDataTableOptions<TData>,
) => {
  const {
    data,
    columns,
    getRowId,
    initialSorting = [],
    pageSize = 10,
  } = options;

  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  const table = useTable({
    features: dataTableFeatures,
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
  });

  return { table };
};
