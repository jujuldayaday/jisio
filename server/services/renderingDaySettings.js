async function getDaySettings(db, counselorId) {
  const [rows] = await db.query(
    `SELECT day_of_week, session_duration_minutes
     FROM counselor_rendering_day_settings
     WHERE counselor_id = ?
     ORDER BY day_of_week`,
    [counselorId]
  );
  return rows.map((r) => ({
    dayOfWeek: r.day_of_week,
    sessionDurationMinutes: r.session_duration_minutes
  }));
}

async function getSessionMinutesForDay(db, counselorId, dayOfWeek) {
  const [rows] = await db.query(
    `SELECT session_duration_minutes FROM counselor_rendering_day_settings
     WHERE counselor_id = ? AND day_of_week = ?`,
    [counselorId, dayOfWeek]
  );
  return rows[0]?.session_duration_minutes ?? null;
}

async function upsertDaySetting(db, counselorId, dayOfWeek, sessionMinutes) {
  await db.query(
    `INSERT INTO counselor_rendering_day_settings (counselor_id, day_of_week, session_duration_minutes)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE session_duration_minutes = VALUES(session_duration_minutes)`,
    [counselorId, dayOfWeek, sessionMinutes]
  );
}

module.exports = { getDaySettings, getSessionMinutesForDay, upsertDaySetting };
