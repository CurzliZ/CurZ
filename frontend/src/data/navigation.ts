import {
  Brain,
  FileText,
  Home,
  ListChecks,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const navigationItems: NavigationItem[] = [
  { label: "Home", path: "/", icon: Home },
  { label: "Notes", path: "/notes", icon: FileText },
  { label: "Brain", path: "/brain", icon: Brain },
  { label: "Review", path: "/review", icon: ListChecks },
  { label: "Settings", path: "/settings", icon: Settings },
];
