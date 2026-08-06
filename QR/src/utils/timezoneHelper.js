/**
 * Timezone utilities to enforce Asia/Singapore (SGT, UTC+8) timezone in the frontend.
 * Web-compatible JS version.
 */
 
// Helper to shift a Date to Singapore Time (UTC+8) so we can format it as UTC
function toSgtDate(date) {
  // SGT is UTC+8
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}
 
export function getSingaporeDateString(date = new Date()) {
  const sgt = toSgtDate(date);
  const year = sgt.getUTCFullYear();
  const month = String(sgt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(sgt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
 
export function formatToSingaporeDate(
  dateInput,
  options = { day: 'numeric', month: 'short' }
) {
  if (!dateInput) return "";
  const date = parseDatabaseDate(dateInput);
  if (isNaN(date.getTime())) return "";
  const sgt = toSgtDate(date);
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: 'UTC'
  }).format(sgt);
}
 
export function formatToSingaporeTime(
  dateInput,
  options = { hour: '2-digit', minute: '2-digit', hour12: true }
) {
  if (!dateInput) return "";
  const date = parseDatabaseDate(dateInput);
  if (isNaN(date.getTime())) return "";
  const sgt = toSgtDate(date);
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: 'UTC'
  }).format(sgt);
}
 
export function formatToSingaporeDateTime(dateInput) {
  if (!dateInput) return "";
  const date = parseDatabaseDate(dateInput);
  if (isNaN(date.getTime())) return "";
  const dateStr = formatToSingaporeDate(date, { day: 'numeric', month: 'short' });
  const timeStr = formatToSingaporeTime(date, { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${dateStr} • ${timeStr}`;
}
 
export function getSingaporeDate() {
  const now = new Date();
  return toSgtDate(now);
}
 
export function getSingaporeTimeTodayRange() {
  const nowSgt = getSingaporeDate();
  const from = new Date(nowSgt);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(nowSgt);
  return { from, to };
}
 
export function parseDatabaseDate(dateInput) {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput === 'number') return new Date(dateInput);
 
  let str = String(dateInput).trim();
  if (str.endsWith('Z')) {
    str = str.slice(0, -1) + '+08:00';
  } else if (str.endsWith('+00:00')) {
    str = str.slice(0, -6) + '+08:00';
  } else if (!str.includes('+') && !str.includes('-') && str.includes('T')) {
    str = str + '+08:00';
  } else if (!str.includes('T') && str.includes(' ')) {
    str = str.replace(' ', 'T') + '+08:00';
  }
 
  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) {
    return new Date(dateInput);
  }
  return parsed;
}
