function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatMemoryDateTime(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return '时间未知';
  }

  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
