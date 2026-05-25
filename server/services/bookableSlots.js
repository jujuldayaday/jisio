const { getRenderingSlotsForDate } = require("./renderingSchedule");

/**
 * Rows shaped for buildSlotsFromRenderingRows: { start_time, end_time }.
 */
async function getBookableSlotRowsForDate(db, counselorId, isoDate) {
  if (!isoDate) return { rows: [], mode: "none", sessionDurationMinutes: null };
  const weekly = await getRenderingSlotsForDate(db, counselorId, isoDate);
  return { rows: weekly, mode: weekly.length ? "weekly" : "none", sessionDurationMinutes: null };
}

module.exports = { getBookableSlotRowsForDate };
