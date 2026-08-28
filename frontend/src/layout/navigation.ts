export type NavLinkItem = {
  label: string
  to: string
  permission: string | null
  description: string
}

export type NavGroup = {
  id: string
  label: string
  items: NavLinkItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/', permission: null, description: 'Operations home and health' }],
  },
  {
    id: 'network',
    label: 'Network',
    items: [
      { label: 'Network overview', to: '/ipam', permission: 'ipam:read', description: 'IPAM summary and discovery' },
      { label: 'VLANs', to: '/ipam/vlans', permission: 'ipam:read', description: 'Virtual LAN registry' },
      { label: 'Subnets', to: '/ipam/subnets', permission: 'ipam:read', description: 'CIDR and gateway inventory' },
      { label: 'IP addresses', to: '/ipam/addresses', permission: 'ipam:read', description: 'Assigned and available addresses' },
      { label: 'DNS', to: '/dns', permission: 'dns:read', description: 'Zones and records' },
      { label: 'DHCP', to: '/dhcp', permission: 'dhcp:read', description: 'Leases and reservations' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    items: [
      { label: 'Hosts', to: '/inventory', permission: 'inventory:read', description: 'Managed devices' },
      { label: 'Host groups', to: '/inventory/groups', permission: 'inventory:read', description: 'Logical host grouping' },
      { label: 'Tags', to: '/inventory/tags', permission: 'inventory:read', description: 'Labels for filtering hosts' },
    ],
  },
  {
    id: 'identity',
    label: 'Identity',
    items: [
      { label: 'Directory', to: '/ldap', permission: 'ldap:read', description: 'LDAP users, groups, and OUs' },
      { label: 'Users', to: '/users', permission: 'users:read', description: 'Local NexusOps accounts' },
      { label: 'Roles', to: '/roles', permission: 'roles:read', description: 'Permissions and role assignment' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    items: [{ label: 'Certificates', to: '/pki', permission: 'pki:read', description: 'CAs and certificate inventory' }],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { label: 'Tools', to: '/tools', permission: null, description: 'Integrations and API docs' },
      { label: 'Settings', to: '/settings', permission: 'settings:read', description: 'Platform config, tokens, and audit' },
    ],
  },
]

export function isPathActive(pathname: string, to: string): boolean {
  if (to === '/') {
    return pathname === '/'
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}
