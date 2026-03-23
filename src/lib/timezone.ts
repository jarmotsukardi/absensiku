import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';

// Common Indonesian timezones
export const INDONESIA_TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'WIB (GMT+7) - Jakarta, Bandung, Surabaya', offset: '+07:00' },
  { value: 'Asia/Makassar', label: 'WITA (GMT+8) - Makassar, Denpasar, Balikpapan', offset: '+08:00' },
  { value: 'Asia/Jayapura', label: 'WIT (GMT+9) - Jayapura, Ambon, Manokwari', offset: '+09:00' },
];

// All major timezones for international support
export const ALL_TIMEZONES = [
  ...INDONESIA_TIMEZONES,
  { value: 'Asia/Singapore', label: 'SGT (GMT+8) - Singapore', offset: '+08:00' },
  { value: 'Asia/Kuala_Lumpur', label: 'MYT (GMT+8) - Malaysia', offset: '+08:00' },
  { value: 'Asia/Bangkok', label: 'ICT (GMT+7) - Bangkok, Vietnam', offset: '+07:00' },
  { value: 'Asia/Tokyo', label: 'JST (GMT+9) - Tokyo', offset: '+09:00' },
  { value: 'Asia/Seoul', label: 'KST (GMT+9) - Seoul', offset: '+09:00' },
  { value: 'Australia/Sydney', label: 'AEST (GMT+10) - Sydney', offset: '+10:00' },
  { value: 'Europe/London', label: 'GMT (GMT+0) - London', offset: '+00:00' },
  { value: 'America/New_York', label: 'EST (GMT-5) - New York', offset: '-05:00' },
];

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

/**
 * Convert a UTC timestamp to the organization's timezone for display
 */
export function formatToTimezone(
  utcDate: string | Date,
  timezone: string = DEFAULT_TIMEZONE,
  formatStr: string = 'dd MMM yyyy HH:mm'
): string {
  try {
    const date = typeof utcDate === 'string' ? parseISO(utcDate) : utcDate;
    return formatInTimeZone(date, timezone, formatStr, { locale: id });
  } catch (error) {
    console.error('Error formatting date to timezone:', error);
    return '-';
  }
}

/**
 * Format time only in organization's timezone
 */
export function formatTimeToTimezone(
  utcDate: string | Date,
  timezone: string = DEFAULT_TIMEZONE
): string {
  return formatToTimezone(utcDate, timezone, 'HH:mm');
}

/**
 * Format date only in organization's timezone
 */
export function formatDateToTimezone(
  utcDate: string | Date,
  timezone: string = DEFAULT_TIMEZONE
): string {
  return formatToTimezone(utcDate, timezone, 'dd MMM yyyy');
}

/**
 * Format date key YYYY-MM-DD in a specific timezone.
 */
export function formatDateKeyInTimezone(
  utcDate: string | Date,
  timezone: string = DEFAULT_TIMEZONE
): string {
  try {
    const date = typeof utcDate === 'string' ? parseISO(utcDate) : utcDate;
    return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
  } catch (error) {
    console.error('Error formatting date key to timezone:', error);
    return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
  }
}

/**
 * Get the current local date key for a specific timezone.
 */
export function getCurrentDateStringInTimezone(
  timezone: string = DEFAULT_TIMEZONE
): string {
  return formatDateKeyInTimezone(new Date(), timezone);
}

/**
 * Get the current time in a specific timezone
 */
export function getCurrentTimeInTimezone(timezone: string = DEFAULT_TIMEZONE): Date {
  return toZonedTime(new Date(), timezone);
}

/**
 * Convert a local time from organization's timezone to UTC for storage
 */
export function localToUTC(
  localDate: Date,
  timezone: string = DEFAULT_TIMEZONE
): Date {
  return fromZonedTime(localDate, timezone);
}

/**
 * Check if current time is within work hours (in organization's timezone)
 */
export function isWithinWorkHours(
  startTime: string, // HH:mm format
  endTime: string,   // HH:mm format
  timezone: string = DEFAULT_TIMEZONE
): boolean {
  const now = getCurrentTimeInTimezone(timezone);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/**
 * Calculate late minutes based on organization's timezone
 */
export function calculateLateMinutes(
  checkInTime: string | Date,
  workStartTime: string, // HH:mm format
  timezone: string = DEFAULT_TIMEZONE
): number {
  try {
    const checkIn = typeof checkInTime === 'string' ? parseISO(checkInTime) : checkInTime;
    const checkInZoned = toZonedTime(checkIn, timezone);
    const checkInMinutes = checkInZoned.getHours() * 60 + checkInZoned.getMinutes();
    
    const [startHour, startMin] = workStartTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    
    return Math.max(0, checkInMinutes - startMinutes);
  } catch (error) {
    console.error('Error calculating late minutes:', error);
    return 0;
  }
}

/**
 * Get timezone display name
 */
export function getTimezoneDisplayName(timezone: string): string {
  const tz = ALL_TIMEZONES.find(t => t.value === timezone);
  return tz?.label || timezone;
}

/**
 * Validate if a timezone string is valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
