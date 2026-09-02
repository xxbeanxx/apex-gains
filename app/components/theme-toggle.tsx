import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import * as React from "react"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

export type Theme = "light" | "dark" | "system"

const STORAGE_KEY = "theme"

/**
 * Applied before first paint so there is no light-mode flash on a dark-mode
 * load. Kept as a string because it has to run as a blocking inline script in
 * <head>, before React exists.
 *
 * Deliberately client-only: no cookie, no loader change. The server renders
 * theme-agnostic markup and this script decides the class.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY
)});var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})();`

function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  const root = document.documentElement
  root.classList.toggle("dark", isDark)
  root.style.colorScheme = isDark ? "dark" : "light"
}

function ThemeToggle() {
  // Starts null so the first client render matches the server's (no checkmark
  // rendered yet). The visible icon is driven by CSS, not by this state, so
  // the trigger is correct from the very first paint.
  const [theme, setTheme] = React.useState<Theme | null>(null)

  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    setTheme(stored ?? "system")
  }, [])

  // Follow the OS while the preference is "system".
  React.useEffect(() => {
    if (theme !== "system") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyTheme("system")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [theme])

  function select(next: Theme) {
    setTheme(next)
    if (next === "system") localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Change theme">
          <SunIcon className="dark:hidden" aria-hidden="true" />
          <MoonIcon className="hidden dark:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={theme ?? undefined}
          onValueChange={(value) => select(value as Theme)}
        >
          <DropdownMenuRadioItem value="light">
            <SunIcon aria-hidden="true" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon aria-hidden="true" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon aria-hidden="true" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { ThemeToggle }
