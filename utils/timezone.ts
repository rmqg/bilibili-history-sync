export const SYSTEM_TIME_ZONE = "system";

export type TimeZonePreference = typeof SYSTEM_TIME_ZONE | string;

export const TIME_ZONE_OPTIONS = [
  { value: SYSTEM_TIME_ZONE, label: "跟随当前设备" },
  { value: "Asia/Shanghai", label: "中国标准时间（北京）" },
  { value: "America/New_York", label: "美国东部时间（纽约）" },
  { value: "America/Chicago", label: "美国中部时间（芝加哥）" },
  { value: "America/Denver", label: "美国山地时间（丹佛）" },
  { value: "America/Los_Angeles", label: "美国太平洋时间（洛杉矶）" },
  { value: "Europe/London", label: "英国时间（伦敦）" },
  { value: "Asia/Tokyo", label: "日本时间（东京）" },
  { value: "UTC", label: "世界协调时间（UTC）" },
] as const;

export const getSystemTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export const resolveTimeZone = (preference: TimeZonePreference = SYSTEM_TIME_ZONE) =>
  preference === SYSTEM_TIME_ZONE ? getSystemTimeZone() : preference;

const getDateParts = (timestampMs: number, preference: TimeZonePreference) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(preference),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(timestampMs));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  return { year: read("year"), month: read("month"), day: read("day") };
};

export const formatDateKey = (timestampMs: number, preference: TimeZonePreference) => {
  const { year, month, day } = getDateParts(timestampMs, preference);
  return `${year}-${month}-${day}`;
};

export const getTodayDateKey = (preference: TimeZonePreference) =>
  formatDateKey(Date.now(), preference);

export const formatDateTime = (timestampMs: number, preference: TimeZonePreference) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: resolveTimeZone(preference),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestampMs));
