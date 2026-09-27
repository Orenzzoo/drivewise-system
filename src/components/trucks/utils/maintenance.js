/**
 * Utility functions for the Maintenance tab.
 * These are distinct from the PMS utilities which calculate whether a truck
 * is overdue, scheduled, or completed based on mileage and dates.
 * The maintenance tab focuses on the status of the most recent maintenance
 * record (e.g., "In Progress", "Completed", "Scheduled").
 */

import { supabase } from "../../../lib/supabaseClient.js";

/**
 * Return the most recent maintenance record from an array sorted in
 * descending order (newest first). Returns `null` if the array is empty.
 */
export function getLatestMaintenance(maintenanceRecords) {
  if (!Array.isArray(maintenanceRecords) || maintenanceRecords.length === 0) {
    return null;
  }
  return maintenanceRecords[0];
}

/**
 * Determine the status to display on the Maintenance Status card.
 * An open ("In Progress") record means the truck is currently being
 * serviced, so it wins over the newest-first rule -- otherwise a newer
 * Completed log (paperwork for a different service, or a same-start_date
 * ordering tie) buries the still-open maintenance and the card wrongly
 * reads "Completed". Falls back to the newest record's status, then "N/A".
 */
export function getMaintenanceCardStatus(truck, maintenanceRecords) {
  if (Array.isArray(maintenanceRecords) && maintenanceRecords.length > 0) {
    const inProgress = maintenanceRecords.find(
      (r) => r.status === "In Progress",
    );
    if (inProgress) {
      return "In Progress";
    }
    const latest = getLatestMaintenance(maintenanceRecords);
    if (latest && latest.status) {
      return latest.status;
    }
  }
  // If there is no maintenance record, display "N/A" as the fallback.
  return "N/A";
}

/**
 * Map a maintenance status to a Tailwind tone class used by `StatTile`.
 * Supports both custom statuses ("In Progress", "Completed", "Scheduled")
 * and the original PMS statuses ("overdue", "scheduled", "completed").
 */
export function getMaintenanceStatusTone(status) {
  const mapping = {
    "In Progress": "amber",
    Completed: "emerald",
    Scheduled: "amber",
    overdue: "rose",
    scheduled: "amber",
    completed: "emerald",
  };
  return mapping[status] || "slate";
}

/**
 * Return the date (ISO string) that should be displayed for the "Last Maintenance" card.
 * For a completed record we prefer the `end_date`; otherwise we fall back to `start_date`.
 * Returns `null` when no record is provided.
 */
export function getLastMaintenanceDate(latestRecord) {
  if (!latestRecord) return null;
  if (latestRecord.status === "Completed" && latestRecord.end_date) {
    return latestRecord.end_date;
  }
  return latestRecord.start_date || null;
}

/**
 * Return the mileage recorded at the time of service for the latest maintenance record.
 * The database column is `mileage_at_service`. Returns `null` if unavailable.
 */
export function getPreviousMileage(latestRecord) {
  if (!latestRecord) return null;
  return latestRecord.mileage_at_service ?? null;
}

/**
 * Return the mileage recorded at service for the most recent maintenance
 * record that actually contains a `mileage_at_service` value. This is useful
 * when the newest record (by start_date) does not have that column – for
 * example, older records created before the column existed. The function
 * falls back to the same logic as `getPreviousMileage` when a suitable
 * record is found, otherwise returns `null`.
 */
export function getPreviousMileageFromRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return null;
  // Records are already sorted by start_date descending in the UI fetch.
  // Find the first record with a defined mileage_at_service.
  const recordWithMileage = records.find(
    (rec) =>
      rec.mileage_at_service !== undefined && rec.mileage_at_service !== null,
  );
  return recordWithMileage ? recordWithMileage.mileage_at_service : null;
}

/**
 * The single write behind "a maintenance has started": archive the truck's
 * Current Mileage into Previous Mileage, then reset Current Mileage to 0.
 * Returns the `trucks` update payload so every path that starts a maintenance
 * (Sup/Admin profile log modal, AddTruckModal, SupTrucks inline edit) applies
 * the exact same rule instead of duplicating the fields.
 *
 * This is the ONLY thing allowed to reset current_mileage. It must never run
 * from a page-load effect -- the old page-open reset wiped accumulated GPS
 * distance every time a profile was viewed.
 *
 * @param {number|string|null|undefined} currentMileage - truck.current_mileage
 *   at the moment the maintenance starts (becomes the new previous_mileage).
 * @param {string} [startDate] - maintenance start date (YYYY-MM-DD); also
 *   written to previous_maintenance_date so the PMS time clock restarts with
 *   the maintenance.
 */
export function maintenanceStartMileageUpdate(currentMileage, startDate) {
  return {
    previous_mileage: Number(currentMileage) || 0,
    current_mileage: 0,
    ...(startDate ? { previous_maintenance_date: startDate } : {}),
  };
}

/**
 * Auto-complete a truck's "In Progress" maintenance record and roll its PMS
 * baseline forward (previous_mileage/previous_maintenance_date). The
 * current_mileage reset intentionally does NOT happen here -- mileage is only
 * reset when a maintenance starts (see maintenanceStartMileageUpdate above),
 * never when one finishes. Same effect SupTruckProfile.jsx/
 * AdminTruckProfile.jsx already run in a page-mounted useEffect. That effect
 * only fires while a
 * Supervisor/Admin happens to have that specific truck's Profile page open --
 * this is the same logic, called directly from wherever a truck's status is
 * actually set to "Available" (SupTrucks.jsx/AdminTrucks.jsx's edit-submit
 * handlers), so completion isn't dependent on which page the status change
 * happened from. Safe to call even when there's no "In Progress" record (a
 * no-op) -- callers don't need to check first.
 */
export async function completeInProgressMaintenance(truckId) {
  const { data: inProgress, error: fetchError } = await supabase
    .from("maintenance_records")
    .select("id, mileage_at_service")
    .eq("truck_id", truckId)
    .eq("status", "In Progress")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchError || !inProgress) return { error: fetchError || null };

  const today = new Date().toISOString().split("T")[0];
  const { error: completeError } = await supabase
    .from("maintenance_records")
    .update({ status: "Completed", end_date: today })
    .eq("id", inProgress.id);
  if (completeError) return { error: completeError };

  const { error: truckError } = await supabase
    .from("trucks")
    .update({
      previous_mileage: inProgress.mileage_at_service,
      previous_maintenance_date: today,
    })
    .eq("id", truckId);
  return { error: truckError || null };
}
