"use client";

import { useAppearance } from "@calliopelabs/ui";
import { SunIcon, MoonIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ThemeToggleProps {
  variant?: "sidebar" | "select";
}

export const ThemeToggle = ({ variant = "sidebar" }: ThemeToggleProps) => {
  const { product, mode, personal, setAppearance, reset } = useAppearance();
  const t = useTranslations("settings.theme");
  const isDark = mode === "dark";
  // Light and dark pick the product's default ground for that mode; system
  // clears the personal choice so the OS decides.
  const theme = personal?.ground ? mode : "system";
  const setTheme = (value: string) => {
    if (value === "light" || value === "dark") {
      setAppearance({ ground: product.defaults.ground[value] });
    } else {
      reset();
    }
  };

  if (variant === "select") {
    return (
      <Select value={theme} onValueChange={setTheme}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="light">{t("light")}</SelectItem>
          <SelectItem value="dark">{t("dark")}</SelectItem>
          <SelectItem value="system">{t("system")}</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          tooltip={isDark ? "Light mode" : "Dark mode"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="text-muted-foreground"
        >
          {isDark ? (
            <SunIcon className="size-4" />
          ) : (
            <MoonIcon className="size-4" />
          )}
          <span>{isDark ? "Light mode" : "Dark mode"}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
