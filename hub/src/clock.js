/**
 * World clock — real wall-clock time, no game compression.
 * Ticks every 60 seconds, broadcasting real local time.
 */

const DEFAULT_TIMEZONE = 'Pacific/Auckland';

function getPeriod(hour) {
  if (hour >= 6 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 21) return 'evening';
  return 'night';
}

function getTimeState(timezone) {
  const tz = timezone || DEFAULT_TIMEZONE;
  const now = new Date();

  // Format in the target timezone
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const parts = {};
  for (const { type, value } of fmt.formatToParts(now)) {
    parts[type] = value;
  }

  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const date = `${parts.year}-${parts.month}-${parts.day}`;

  return {
    date,
    hour,
    minute,
    timezone: tz,
    period: getPeriod(hour),
    wallclock: now.toISOString(),
  };
}

function startClock(onTick, timezone) {
  // Tick immediately on start
  onTick(getTimeState(timezone));

  // Then tick every 60 seconds
  const interval = setInterval(() => {
    onTick(getTimeState(timezone));
  }, 60_000);

  return () => clearInterval(interval);
}

module.exports = { startClock, getTimeState, getPeriod };
