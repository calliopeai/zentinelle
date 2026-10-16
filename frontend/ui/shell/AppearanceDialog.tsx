"use client";

import {
  AppearancePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@calliopelabs/ui";

export interface AppearanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  title = "Appearance",
  description = "Ground, accent, density and corners, for you on this console.",
}: AppearanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <AppearancePicker />
      </DialogContent>
    </Dialog>
  );
}
