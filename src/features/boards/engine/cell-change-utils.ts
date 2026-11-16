const TZ = 'Asia/Kolkata';

export function formatDateTimeIST(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch { return ''; }
}

export function formatRelativeIST(iso?: string | null): string {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return diffMin + ' min ago';
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return diffH + ' hour' + (diffH === 1 ? '' : 's') + ' ago';
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return diffD + ' day' + (diffD === 1 ? '' : 's') + ' ago';
    return formatDateTimeIST(iso);
  } catch { return formatDateTimeIST(iso); }
}

export function getUserLabel(name?: string | null, members?: Array<{ user_id: string; id?: string; name?: string; full_name?: string; email?: string }>): string {
  if (!name || (typeof name === 'string' && name.trim() === '')) { return 'Former member'; }
  if (members && members.length > 0 && typeof name === 'string') {
    const member = members.find(m => m.user_id === name || m.id === name);
      if (member) {
        const displayName = member.name || (member as any).full_name || member.email;
        if (displayName && displayName.trim()) { return displayName; }
        return 'Former member';
      }
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) {
        return 'Former member';
      }
  } else if (typeof name === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) {
    console.log('DEBUG_GUL_LOADING', name, members?.length);
    return '';
  }
  console.log('DEBUG_GUL_FALLBACK', name);
  return name;
}
