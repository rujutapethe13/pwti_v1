import {
  User as ProfileIcon,
  ShieldCheck,
  Eye,
  Bell,
  Palette,
  Users,
} from "lucide-react";

export interface AccountNavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  requiresManage?: boolean;
}

export const ACCOUNT_NAV_ITEMS: AccountNavItem[] = [
  { id: "profile", label: "Profile", href: "/account/settings/profile", icon: ProfileIcon },
  { id: "security", label: "Account & security", href: "/account/settings/security", icon: ShieldCheck },
  { id: "privacy", label: "Privacy", href: "/account/settings/privacy", icon: Eye },
  { id: "notifications", label: "Notifications", href: "/account/settings/notifications", icon: Bell },
  { id: "appearance", label: "Appearance", href: "/account/settings/appearance", icon: Palette },
  {
    id: "members",
    label: "Members & access",
    href: "/account/settings/members",
    icon: Users,
    requiresManage: true,
  },
];

const ACTIVE_PREFIXES: Record<string, string[]> = {
  profile: ["/account/settings/profile"],
  security: ["/account/settings/security"],
  privacy: ["/account/settings/privacy"],
  notifications: ["/account/settings/notifications"],
  appearance: ["/account/settings/appearance"],
  members: ["/account/settings/members"],
};

export function isAccountNavItemActive(
  pathname: string,
  itemHref: string,
): boolean {
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}