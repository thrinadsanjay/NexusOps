export type DiscoveredNetwork = { cidr: string; interface: string }

/** Gateway probes and SCAN_NETWORKS entries are real LAN prefixes; iface names are Docker. */
export function isLanDiscovery(n: DiscoveredNetwork): boolean {
  return n.interface === "configured" || n.interface === "auto-detected"
}

export function formatApiDetail(detail: unknown): string {
  if (typeof detail === "string" && detail.trim()) {
    return detail
  }
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === "string") return item
      if (item && typeof item === "object" && "msg" in item) {
        return String((item as { msg: unknown }).msg)
      }
      return ""
    }).filter(Boolean)
    if (parts.length) return parts.join("; ")
  }
  return "Failed to add subnet"
}
