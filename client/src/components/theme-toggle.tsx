import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };
  const nextTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={toggleTheme}
      aria-label={`Theme: ${theme}. Switch to ${nextTheme}.`}
      data-testid="button-theme-toggle"
      className="hover:bg-muted"
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5" />
      ) : theme === "light" ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5 opacity-50" />
      )}
      <span className="sr-only">Theme: {theme}. Switch to {nextTheme}.</span>
    </Button>
  );
}
