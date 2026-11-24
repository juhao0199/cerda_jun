import type { Role } from '@/lib/session-api';

export const sections = ['overview', 'leads', 'clients', 'quotations', 'team', 'security', 'settings'] as const;
export type Section = typeof sections[number];
export type NavItem = { id: Section; label: string; href: string; roles: readonly Role[]; group: string };
export const navigation: readonly NavItem[] = [
  { id: 'overview', label: 'Overview', href: '/workspace', roles: ['owner', 'staff', 'client'], group: 'Workspace' },
  { id: 'leads', label: 'Leads', href: '/workspace/leads', roles: ['owner', 'staff'], group: 'Sales' },
  { id: 'clients', label: 'Clients', href: '/workspace/clients', roles: ['owner', 'staff'], group: 'Sales' },
  { id: 'quotations', label: 'Quotations', href: '/workspace/quotations', roles: ['owner', 'staff'], group: 'Sales' },
  { id: 'team', label: 'Team & access', href: '/workspace/team', roles: ['owner'], group: 'Administration' },
  { id: 'security', label: 'Security activity', href: '/workspace/security', roles: ['owner'], group: 'Administration' },
  { id: 'settings', label: 'Account settings', href: '/workspace/settings', roles: ['owner', 'staff', 'client'], group: 'Administration' },
];
export function isSection(value: string): value is Section {
  return (sections as readonly string[]).includes(value);
}
export function canView(role: Role, section: Section): boolean {
  return navigation.some(item => item.id === section && item.roles.includes(role));
}
