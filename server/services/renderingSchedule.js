const { isoWeekday } = require("../config/counselorBooking");

async function getRenderingSlotsForDate(db, counselorId, isoDate) {
  if (!isoDate) return [];
  const dayOfWeek = isoWeekday(isoDate);
  const [rows] = await db.query(
    `SELECT id, day_of_week, start_time, end_time
     FROM counselor_rendering_slots
     WHERE counselor_id = ? AND day_of_week = ?
     ORDER BY start_time`,
    [counselorId, dayOfWeek]
  );
  return rows;
}

async function getRenderingSchedule(db, counselorId) {
  const [rows] = await db.query(
    `SELECT id, day_of_week, start_time, end_time, created_at
     FROM counselor_rendering_slots
     WHERE counselor_id = ?
     ORDER BY day_of_week, start_time`,
    [counselorId]
  );
  return rows;
}

module.exports = { getRenderingSlotsForDate, getRenderingSchedule };
