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

export function getUserLabel(name?: string | null): string {
  if (!name || name.trim() === '') return 'Former member';
  return name;
}
