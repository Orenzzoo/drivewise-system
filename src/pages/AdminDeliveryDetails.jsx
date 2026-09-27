import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AdminLayout from "../layout/AdminLayout.jsx";
import { supabase } from "../lib/supabaseClient.js";
// Shared with the Supervisor portal: the exact same Details / Quotation /
// Trip / Analysis content SupDeliveries.jsx renders, reused here so an Admin
// sees the full delivery report without entering /supervisor/* (ProtectedRoute
// bounces Admins off supervisor routes, and SupLayout must never render for
// them). These report components are read-only -- the Supervisor's interactive
// quotation/assignment workflow lives in the inbox modal, not here.
import {
  mapDbRequest,
  mapFleetCrewMember,
  mapFleetTruck,
} from "../lib/deliveryRequestMapping.js";
// Shared report components (see the export note in SupDeliveries.jsx).
import {
  CancelledDeliveryDetails,
  CompletedDeliveryReport,
} from "./SupDeliveries.jsx";

// Same column list loadInbox (SupDeliveries.jsx) selects for delivery_requests.
// suggested_route is deliberately excluded -- CompletedDeliveryReport
// lazy-loads it per-delivery itself, and pulling it here would only duplicate
// that fetch on every page load.
const DELIVERY_COLUMNS =
  "id, customer_auth_id, item_type, other_item_type, truck_type, cargo_weight, pickup_date, pickup_time, pickup_time_end, dropoff_date, dropoff_time, dropoff_time_end, pickup_location, pickup_lat, pickup_lng, dropoff_location, dropoff_lat, dropoff_lng, stops, pickup_photo_url, dropoff_photo_url, pickup_completed_at, dropoff_completed_at, pickup_arrived_at, dropoff_arrived_at, budget_min, budget_max, notes, status, created_at, customer_counter_min, customer_counter_max, cancelled_by, cancel_reason, cancelled_at, cancelled_from_status, received_confirmed, received_confirmed_at, completed_at, assigned_driver_id, assigned_helper_ids, assigned_truck_plate, assigned_at";

// Attach quotations exactly the way loadInbox does, so QuotationTab sees the
// identical shape it already handles.
function attachQuotations(mapped, qtns) {
  const qmap = {};
  for (const q of qtns || []) {
    qmap[q.quotation_type] = q;
  }
  return {
    ...mapped,
    quotation: qmap.initial
      ? {
          amount: qmap.initial.amount,
          breakdown: qmap.initial.breakdown,
          notes: qmap.initial.notes,
          validUntil: qmap.initial.valid_until,
        }
      : null,
    updatedQuotation: qmap.updated
      ? {
          amount: qmap.updated.amount,
          breakdown: qmap.updated.breakdown,
          notes: qmap.updated.notes,
          validUntil: qmap.updated.valid_until,
        }
      : null,
  };
}

export default function AdminDeliveryDetails() {
  const { deliveryId } = useParams();
  const navigate = useNavigate();
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      setNotFound(false);
      try {
        // All five reads are independent -- one Promise.all, same pattern as
        // SupDeliveries.jsx's loadInbox.
        const [deliveryRes, qtnsRes, clientsRes, trucksRes, crewRes] =
          await Promise.all([
            supabase
              .from("delivery_requests")
              .select(DELIVERY_COLUMNS)
              .eq("id", deliveryId)
              .maybeSingle(),
            supabase
              .from("delivery_quotations")
              .select("*")
              .eq("delivery_id", deliveryId),
            supabase.functions.invoke("admin-users", {
              body: { action: "list-clients" },
            }),
            // Real fleet for rebuilding the assigned crew names (trucks is
            // RLS-open for direct query, same as the Supervisor inbox).
            supabase.from("trucks").select("*"),
            supabase.functions.invoke("admin-users", {
              body: { action: "list-crew" },
            }),
          ]);
        if (!isMounted) return;
        if (deliveryRes.error) {
          throw deliveryRes.error;
        }
        if (!deliveryRes.data) {
          setNotFound(true);
          return;
        }
        const row = deliveryRes.data;
        let clientName = "Client";
        const clients = clientsRes.data?.clients;
        if (!clientsRes.error && Array.isArray(clients)) {
          const match = clients.find((c) => c.id === row.customer_auth_id);
          if (match?.name) clientName = match.name;
        }
        // Client/crew lookups fail open -- the report still renders, just
        // with fallback names, matching loadInbox's degraded-mode behavior.
        const fleet = { drivers: [], helpers: [], trucks: [] };
        if (!trucksRes.error) {
          fleet.trucks = (trucksRes.data || []).map(mapFleetTruck);
        }
        const crew = crewRes.data?.crew;
        if (!crewRes.error && Array.isArray(crew)) {
          for (const m of crew) {
            if (m.deactivated_at || !m.record_id) continue;
            const mapped = mapFleetCrewMember(m);
            if (m.role === "Driver") fleet.drivers.push(mapped);
            else if (m.role === "Helper") fleet.helpers.push(mapped);
          }
        }
        const mapped = mapDbRequest(row, clientName, fleet);
        setDelivery(
          qtnsRes.error
            ? mapped
            : attachQuotations(mapped, qtnsRes.data || []),
        );
      } catch (e) {
        if (isMounted) {
          setLoadError(
            `Failed to load delivery ${deliveryId || ""}. Please try again. (${e?.message || e?.code || "unexpected error"})`,
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    if (deliveryId) {
      load();
    } else {
      // No id in the URL (route requires :deliveryId, so this is only a
      // safety net) -- deferred like other render-phase-adjacent setStates
      // in this codebase to satisfy react-hooks/set-state-in-effect.
      Promise.resolve().then(() => {
        setNotFound(true);
        setLoading(false);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [deliveryId]);

  return (
    <AdminLayout
      title={delivery ? `Delivery ${delivery.id}` : "Delivery Details"}
      background={null}
      bg="bg-[#F6F7FB]"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-24 shadow-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-violet-600" />
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center shadow-sm">
            <p className="text-sm font-semibold text-rose-700">{loadError}</p>
          </div>
        ) : notFound || !delivery ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-800">
              Delivery {deliveryId || ""} was not found.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              It may have been deleted, or the link is incorrect.
            </p>
          </div>
        ) : delivery.status === "CANCELLED" ? (
          <CancelledDeliveryDetails delivery={delivery} />
        ) : (
          // hideEmptyTabs: tabs with genuinely no data (no quotation, no
          // trip sessions) are hidden instead of rendering empty -- Details
          // always stays. (An empty Quotation tab before the
          // 20260927120000_admin_read_delivery_quotations migration is
          // deployed is a permissions gap, not missing data -- see STATUS.md.)
          <CompletedDeliveryReport delivery={delivery} hideEmptyTabs />
        )}
      </div>
    </AdminLayout>
  );
}
