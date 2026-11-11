import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@calliopelabs/ui";
import { DownloadIcon } from "lucide-react";
import type * as React from "react";

export interface ExportFormat {
  key: string;
  label: string;
  /** One line on what the file holds. */
  description?: string;
  /** The download URL, with the active filters already in its query. */
  href: string;
}

export interface ExportMenuProps {
  formats: readonly ExportFormat[];
  label?: string;
  /** A note under the formats: what the export covers. */
  scope?: React.ReactNode;
  disabled?: boolean;
}

/**
 * The formats the backend can export, each a real download link carrying
 * the list's filters (audit M2). A link, not a fetch, so the browser streams
 * a large file to disk.
 */
export function ExportMenu({
  formats,
  label = "Export",
  scope,
  disabled,
}: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="outline" size="sm">
          <DownloadIcon aria-hidden />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Format</DropdownMenuLabel>
        {formats.map((format) => (
          <DropdownMenuItem key={format.key} asChild>
            <a
              href={format.href}
              download
              className="flex flex-col items-start gap-0.5"
            >
              <span>{format.label}</span>
              {format.description && (
                <span className="text-xs text-muted-foreground">
                  {format.description}
                </span>
              )}
            </a>
          </DropdownMenuItem>
        ))}
        {scope && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{scope}</p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
