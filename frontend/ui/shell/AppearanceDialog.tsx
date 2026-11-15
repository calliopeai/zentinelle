"use client";

import {
  AppearancePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

export interface AppearanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The catalog's copy (`shell.appearance`, `shell.appearanceDialog`) unless given. */
  title?: string;
  description?: string;
}

/**
 * Ground, accent, density and corners, from the user menu (§4.1: personal
 * settings leave Settings, which becomes admin-only). The package's picker
 * writes through the AppearanceProvider above the shell.
 */
export function AppearanceDialog({
  open,
  onOpenChange,
  title,
  description,
}: AppearanceDialogProps) {
  const t = useTranslations("shell");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title ?? t("appearance")}</DialogTitle>
          <DialogDescription>
            {description ?? t("appearanceDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <AppearancePicker />
      </DialogContent>
    </Dialog>
  );
}
