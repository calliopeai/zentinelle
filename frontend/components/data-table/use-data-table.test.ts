// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { type ColumnDef } from "./features";
import { useDataTable } from "./use-data-table";

type Row = { id: string; name: string; status: string; score: number };

const data: Row[] = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i}`,
  name: `item ${String(i).padStart(2, "0")}`,
  status: i % 3 === 0 ? "open" : "closed",
  score: (i * 7) % 12,
}));

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: (row, _, value) => row.original.status === value,
  },
  { accessorKey: "score", header: "Score" },
  { id: "actions", header: "", enableSorting: false, cell: () => null },
];

const setup = () =>
  renderHook(() =>
    useDataTable({ data, columns, getRowId: (r) => r.id, pageSize: 5 }),
  );

const ids = (table: ReturnType<typeof useDataTable<Row>>["table"]) =>
  table.getRowModel().rows.map((r) => r.id);

describe("useDataTable (TanStack Table v9 features)", () => {
  it("pages client-side", () => {
    const { result } = setup();
    expect(ids(result.current.table)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
    expect(result.current.table.getPageCount()).toBe(3);
    expect(result.current.table.getCanPreviousPage()).toBe(false);

    act(() => result.current.table.lastPage());
    expect(ids(result.current.table)).toEqual(["r10", "r11"]);
    expect(result.current.table.getCanNextPage()).toBe(false);

    act(() => result.current.table.firstPage());
    act(() => result.current.table.setPageSize(10));
    expect(result.current.table.getRowModel().rows).toHaveLength(10);
  });

  it("sorts by column and respects enableSorting", () => {
    const { result } = setup();
    expect(result.current.table.getColumn("actions")?.getCanSort()).toBe(false);

    act(() => result.current.table.getColumn("name")?.toggleSorting(true));
    expect(result.current.table.getColumn("name")?.getIsSorted()).toBe("desc");
    expect(ids(result.current.table)[0]).toBe("r11");
  });

  it("filters by column and globally, resetting to the first page", () => {
    const { result } = setup();
    act(() => result.current.table.nextPage());
    expect(result.current.table.state.pagination.pageIndex).toBe(1);

    act(() => result.current.table.getColumn("status")?.setFilterValue("open"));
    expect(result.current.table.state.pagination.pageIndex).toBe(0);
    expect(result.current.table.getFilteredRowModel().rows).toHaveLength(4);
    expect(result.current.table.state.columnFilters).toEqual([
      { id: "status", value: "open" },
    ]);

    act(() => result.current.table.resetColumnFilters());
    act(() => result.current.table.setGlobalFilter("item 1"));
    expect(ids(result.current.table)).toEqual(["r10", "r11"]);
    expect(result.current.table.state.globalFilter).toBe("item 1");
  });

  it("renders visible cells and exposes row selection", () => {
    const { result } = setup();
    const [row] = result.current.table.getRowModel().rows;
    expect(row.getVisibleCells().map((c) => c.column.id)).toEqual([
      "name",
      "status",
      "score",
      "actions",
    ]);
    expect(row.getIsSelected()).toBe(false);
    expect(result.current.table.getHeaderGroups()[0].headers).toHaveLength(4);
  });
});
