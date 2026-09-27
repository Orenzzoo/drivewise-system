import { formatManilaDateTime } from "./manilaTime.js";

// Shared delivery_requests -> UI request-shape mapping, factored out of
// SupDeliveries.jsx so both portals render identical delivery details:
//  - SupDeliveries.jsx (Supervisor inbox, reports, assignment pickers)
//  - AdminDeliveryDetails.jsx (Admin read-only report page, route
//    /admin/deliveries/:deliveryId)
// Lives here (not in the page module) so importing pages don't trip the
// react-refresh only-export-components rule, and so Fast Refresh keeps
// working for both page modules.

// "Aug 3, 2026, 11:02 PM" style used for pickup/drop-off dates. Pinned to
// Asia/Manila (see lib/manilaTime.js) -- previously used the browser's own
// local timezone via Date's local getters, correct only by coincidence on
// dev machines already set to Manila time.
export function formatIsoDateTime(iso) {
  return formatManilaDateTime(iso, { includeYear: true });
}

export function mapFleetTruck(t) {
  return {
    id: t.id,
    plateNumber: t.plate_number,
    truckType: t.truck_type,
    brand: t.brand,
    model: t.model,
    capacity:
      t.max_capacity != null
        ? `${Number(t.max_capacity).toLocaleString()} kg`
        : null,
    capacityKg: t.max_capacity,
  };
}

// Map one `list-crew` member (Driver/Helper user merged with their *_records
// row) to the assignment picker shape. `id` is the crew record id (D001/H001)
// — what assignCrew persists as assigned_driver_id / assigned_helper_ids.
export function mapFleetCrewMember(m) {
  return {
    id: (m.record_id || "").trim(),
    authId: m.id,
    name: [m.first_name, m.middle_name, m.last_name]
      .filter(Boolean)
      .join(" ")
      .trim(),
    role: m.role,
    // Client names (customer_records.client_name) this crew member
    // specializes in, attached by list-crew via crew_client_specialties.
    clientSpecialties: m.client_specialties || [],
    // Self-set weekly working days (crew_availability) — feeds the
    // Available/Unavailable badge in the assignment pickers.
    workingDays: m.working_days || [],
  };
}

// Rebuild the assigned crew (driver/helpers/truck) from the persisted
// assignment columns using the real fleet loaded for the pickers.
function buildAssignedCrew(row, fleet) {
  if (!row.assigned_driver_id) return null;
  return {
    driver: fleet.drivers.find((d) => d.id === row.assigned_driver_id) || null,
    helpers: (row.assigned_helper_ids || [])
      .map((id) => fleet.helpers.find((h) => h.id === id))
      .filter(Boolean),
    truck: row.assigned_truck_plate
      ? fleet.trucks.find((t) => t.plateNumber === row.assigned_truck_plate) ||
        null
      : null,
  };
}

export function mapDbRequest(row, clientName, fleet) {
  const name = clientName || "Client";
  return {
    id: row.id,
    customerAuthId: row.customer_auth_id,
    customerName: name,
    companyName: name,
    itemType: row.item_type
      ? row.item_type.charAt(0).toUpperCase() + row.item_type.slice(1)
      : row.item_type,
    otherItemType: row.other_item_type,
    truckType: row.truck_type,
    cargoWeight: row.cargo_weight,
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    pickupTimeEnd: row.pickup_time_end || null,
    dropoffDate: row.dropoff_date,
    dropoffTime: row.dropoff_time,
    dropoffTimeEnd: row.dropoff_time_end || null,
    pickupAddress: row.pickup_location,
    pickupLat: row.pickup_lat,
    pickupLng: row.pickup_lng,
    deliveryAddress: row.dropoff_location,
    dropoffLat: row.dropoff_lat,
    dropoffLng: row.dropoff_lng,
    // Reference-only intermediate stops between pickup/dropoff, customer-entered
    // at booking time — read-only here (02B_MULTI_STOP_DELIVERIES.md).
    stops: Array.isArray(row.stops) ? row.stops : [],
    // Proof-photo state for the first two items in the chain (Pickup,
    // Drop-off), written by the Helper's completion actions — read-only here
    // (02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md).
    pickupPhotoUrl: row.pickup_photo_url || null,
    dropoffPhotoUrl: row.dropoff_photo_url || null,
    // pickupCompletedAt/pickupArrivedAt/dropoffArrivedAt were all missing
    // from this mapper (found 2026-09-09, live end-to-end test): Progress
    // Timeline's "Pickup Confirmed" row always showed "—" with no
    // timestamp, and Trip Details' per-location Arrival always showed "Not
    // recorded for this trip" even on trips where the Driver genuinely
    // tapped Arrived and the Helper genuinely confirmed Pickup — the real
    // columns existed and were populated, buildRealTripAndBehaviorReport
    // already read delivery.pickupCompletedAt/pickupArrivedAt/
    // dropoffArrivedAt correctly, this mapper just never carried them
    // through from the raw row in the first place.
    pickupCompletedAt: row.pickup_completed_at || null,
    dropoffCompletedAt: row.dropoff_completed_at || null,
    pickupArrivedAt: row.pickup_arrived_at || null,
    dropoffArrivedAt: row.dropoff_arrived_at || null,
    // Frozen planned route (Pickup -> Drop-off -> Stops), if the Driver
    // app's pre-trip screen already saved one — feeds the real Route
    // Deviation Report (buildRealTripAndBehaviorReport, 11_ROUTE_COMPARISON.md).
    // Deliberately null here (2026-09-09) -- the bulk list query no longer
    // fetches suggested_route at all (perf fix, see loadInbox's query
    // comment); this field is overwritten locally once loaded lazily, by
    // whichever of the two loadSuggestedRoute effects applies to this row.
    suggestedRoute: Array.isArray(row.suggested_route)
      ? row.suggested_route
      : null,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    quotation: null,
    updatedQuotation: null,
    customerCounterMin: row.customer_counter_min,
    customerCounterMax: row.customer_counter_max,
    cancelledBy: row.cancelled_by,
    cancelReason: row.cancel_reason,
    cancelledAt: row.cancelled_at ? formatIsoDateTime(row.cancelled_at) : null,
    cancelledFromStatus: row.cancelled_from_status,
    // Customer confirmation state (written by the customer via
    // CustomerDeliveries.jsx; the Completed module reads these).
    receivedConfirmed: row.received_confirmed,
    receivedConfirmedAt: row.received_confirmed_at
      ? formatIsoDateTime(row.received_confirmed_at)
      : null,
    completedAt: row.completed_at ? formatIsoDateTime(row.completed_at) : null,
    // Rebuild the assigned crew (same shape the assignment pickers produce)
    // from the persisted columns so an assigned request still shows its
    // driver/helpers/truck after a reload.
    crew: row.assigned_driver_id
      ? buildAssignedCrew(
          row,
          fleet || { drivers: [], helpers: [], trucks: [] },
        )
      : null,
    assignedAt: row.assigned_at ? formatIsoDateTime(row.assigned_at) : null,
  };
}
