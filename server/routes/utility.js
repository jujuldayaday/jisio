const express = require("express");
const { getPool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { resolveCounselorProfile, resolveSlotsForDate, isOfficeBookableDay, isSaturday } = require("../config/counselorBooking");
const { getRenderingSlotsForDate } = require("../services/renderingSchedule");
const { getDateSlotsForDate } = require("../services/availabilitySchedule");

const router = express.Router();

router.get("/counselors", async (req, res) => {
  const { date } = req.query;
  const db = getPool();
  let query = `
    SELECT id, full_name AS name, email
    FROM users
    WHERE role = 'counselor' AND is_active = 1 AND email_verified = 1
  `;
  const params = [];
  if (date) {
    query += `
      AND id NOT IN (
        SELECT counselor_id FROM counselor_unavailabilities
        WHERE unavailable_date = ? AND start_time IS NULL AND end_time IS NULL
      )
    `;
    params.push(date);
  }
  query += ` ORDER BY full_name`;
  const [rows] = await db.query(query, params);
  res.json(rows);
});

router.get("/booking-options", requireAuth, async (req, res) => {
  const counselorId = Number(req.query.counselorId);
  const dateRaw = req.query.date ? String(req.query.date).slice(0, 10) : "";
  if (!counselorId) return res.status(400).json({ message: "counselorId is required" });

  const db = getPool();
  const [rows] = await db.query(
    "SELECT id, full_name AS fullName, email FROM users WHERE id = ? AND role = 'counselor' AND is_active = 1 AND email_verified = 1",
    [counselorId]
  );
  const c = rows[0];
  if (!c) return res.status(404).json({ message: "Counselor not found" });

  const profile = resolveCounselorProfile(c.fullName, c.email);
  let dayNote = "";
  if (dateRaw) {
    if (isSaturday(dateRaw)) dayNote = "Bookings are not available on Saturdays.";
    else if (!isOfficeBookableDay(dateRaw)) dayNote = "Bookings are only available Monday through Friday.";
  }
  let slots = [];
  if (dateRaw && isOfficeBookableDay(dateRaw)) {
    const dateSlotRows = await getDateSlotsForDate(db, counselorId, dateRaw);
    const renderingRows = await getRenderingSlotsForDate(db, counselorId, dateRaw);
    slots = resolveSlotsForDate(profile, dateRaw, renderingRows, dateSlotRows);
    if (!slots.length && dateSlotRows.length === 0 && renderingRows.length === 0) {
      dayNote = dayNote || "No time slots are set for this date.";
    }
  }

  res.json({
    counselorId,
    date: dateRaw || null,
    services: profile.services,
    slots,
    dayNote: dayNote || null
  });
});

module.exports = router;
