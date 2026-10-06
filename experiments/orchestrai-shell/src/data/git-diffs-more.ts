import { file, hunk, type ChangedFile } from "@/data/git-diffs"

/** acme-web, checkout-apple-pay: the button exists, the method list learns about it. */
export const APPLE_PAY_FILES: ChangedFile[] = [
  file("src/checkout/PaymentMethods.tsx", "M", [
    hunk(1, 1, "", `
 import { CardForm } from "./CardForm";
+import { ApplePayButton, canUseApplePay } from "./ApplePayButton";
 import type { CheckoutSession } from "./types";
`),
    hunk(24, 25, "export function PaymentMethods({ session }: { session: CheckoutSession }) {", `
   return (
     <section aria-label="Payment method" className="payment-methods">
-      <h2>Pay with card</h2>
+      <h2>Payment method</h2>
+      {canUseApplePay(session) && (
+        <>
+          <ApplePayButton session={session} />
+          <p className="divider">or pay with card</p>
+        </>
+      )}
       <CardForm session={session} />
-      <p className="fine-print">Cards are charged in {session.currency}.</p>
+      <p className="fine-print">Charged in {session.currency}. Apple Pay uses the card in your Wallet.</p>
     </section>
   );
`),
  ]),
  file("src/checkout/ApplePayButton.tsx", "U", [
    hunk(0, 1, "", `
+import { loadStripe, type PaymentRequest } from "@stripe/stripe-js";
+import { useEffect, useState } from "react";
+
+import type { CheckoutSession } from "./types";
+
+const stripe = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
+
+/** Safari on a device with a card in Wallet; everything else keeps the card form. */
+export function canUseApplePay(session: CheckoutSession) {
+  return session.country === "US" && "ApplePaySession" in window;
+}
+
+export function ApplePayButton({ session }: { session: CheckoutSession }) {
+  const [request, setRequest] = useState<PaymentRequest | null>(null);
+
+  useEffect(() => {
+    let cancelled = false;
+    void stripe.then((client) => {
+      if (!client || cancelled) return;
+      const next = client.paymentRequest({
+        country: session.country,
+        currency: session.currency.toLowerCase(),
+        total: { label: "Acme order", amount: session.amountCents },
+      });
`),
  ], { total: { additions: 118, deletions: 0 } }),
]

/** payments-api, refund-idempotency: a key per refund request, enforced in the database. */
export const REFUND_FILES: ChangedFile[] = [
  file("internal/refunds/handler.go", "M", [
    hunk(42, 42, "func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {", `
 	var req CreateRefundRequest
 	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
 		writeError(w, http.StatusBadRequest, "invalid_body", err)
 		return
 	}
-	refund, err := h.store.CreateRefund(r.Context(), req)
+	key := r.Header.Get("Idempotency-Key")
+	if key == "" {
+		writeError(w, http.StatusBadRequest, "missing_idempotency_key", nil)
+		return
+	}
+	refund, replayed, err := h.store.CreateRefundOnce(r.Context(), key, req)
 	if err != nil {
 		writeError(w, http.StatusInternalServerError, "refund_failed", err)
 		return
 	}
+	if replayed {
+		w.Header().Set("Idempotent-Replayed", "true")
+	}
 	writeJSON(w, http.StatusCreated, refund)
`),
  ], { total: { additions: 61, deletions: 14 } }),
  file("internal/refunds/handler_test.go", "M", [
    hunk(88, 88, "func TestCreateRefund(t *testing.T) {", `
 }
+
+func TestCreateRefundReplaysSameKey(t *testing.T) {
+	h := newTestHandler(t)
+	first := h.post(t, "/refunds", refundBody("ch_3Pq9", 1200), "key-a1")
+	second := h.post(t, "/refunds", refundBody("ch_3Pq9", 1200), "key-a1")
+
+	require.Equal(t, http.StatusCreated, second.Code)
+	require.Equal(t, "true", second.Header().Get("Idempotent-Replayed"))
+	require.Equal(t, first.Body.String(), second.Body.String())
+	require.Equal(t, 1, h.countRefunds(t, "ch_3Pq9"))
+}
`),
  ], { total: { additions: 52, deletions: 0 } }),
  file("internal/refunds/idempotency.go", "U", [
    hunk(0, 1, "", `
+package refunds
+
+import (
+	"context"
+	"errors"
+
+	"github.com/jackc/pgx/v5"
+	"github.com/jackc/pgx/v5/pgconn"
+)
+
+// CreateRefundOnce creates the refund, or returns the one already created
+// under key. The unique index on (merchant_id, key) is what makes two racing
+// requests safe; the lookup before it only saves a failed insert.
+func (s *Store) CreateRefundOnce(ctx context.Context, key string, req CreateRefundRequest) (Refund, bool, error) {
+	if existing, err := s.refundByKey(ctx, req.MerchantID, key); err == nil {
+		return existing, true, nil
+	} else if !errors.Is(err, pgx.ErrNoRows) {
+		return Refund{}, false, err
+	}
`),
  ], { total: { additions: 73, deletions: 0 } }),
  file("migrations/0042_refund_idempotency_keys.sql", "U", [
    hunk(0, 1, "", `
+-- One refund per (merchant, idempotency key). Keys expire after 24 hours,
+-- the window clients are told to retry within.
+CREATE TABLE refund_idempotency_keys (
+    merchant_id   uuid        NOT NULL REFERENCES merchants (id),
+    key           text        NOT NULL,
+    refund_id     uuid        NOT NULL REFERENCES refunds (id),
+    request_hash  bytea       NOT NULL,
+    created_at    timestamptz NOT NULL DEFAULT now(),
+    PRIMARY KEY (merchant_id, key)
+);
+
+CREATE INDEX refund_idempotency_keys_created_at
+    ON refund_idempotency_keys (created_at);
`),
  ]),
]

/** handbook, main: a direct edit to the on-call index. */
export const HANDBOOK_FILES: ChangedFile[] = [
  file("oncall/README.md", "M", [
    hunk(9, 9, "## Escalation", `
 ## Escalation
 
-Page the secondary after 15 minutes without an acknowledgement.
-If the secondary does not answer, call the engineering manager.
+Page the secondary after 10 minutes without an acknowledgement. The pager
+escalates on its own; you do not need to page by hand.
+
+If neither answers within 20 minutes, call the incident commander on duty
+(the rota is pinned in #incidents). Do not wait for the manager.
+
 See [Severity levels](severity.md) before declaring an incident.
`),
  ]),
]

export const SHELVED_MERMAID: ChangedFile[] = [
  file("desktop/src/components/MermaidDiagram.tsx", "M", [
    hunk(51, 51, "export function MermaidDiagram({ source }: { source: string }) {", `
   return (
-    <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
+    <div className="mermaid-diagram">
+      <div className="mermaid-zoom" style={{ transform: "scale(" + zoom + ")" }} dangerouslySetInnerHTML={{ __html: svg }} />
+      <div className="mermaid-zoom-controls">
+        <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>−</button>
+        <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>+</button>
+      </div>
+    </div>
   );
`),
  ]),
]

export const STASHED_TILE: ChangedFile[] = [
  file("desktop/src/views/mission-control/SessionTile.tsx", "M", [
    hunk(31, 31, "export function SessionTile({ session, onContinue }: Props) {", `
-    <article className="session-tile rounded-md border p-3">
+    <article className="session-tile rounded-md border p-3 data-[forked=true]:border-dashed" data-forked={session.forkedFrom ? "true" : undefined}>
`),
  ]),
]

export const STASHED_VT100: ChangedFile[] = [
  file("Cargo.toml", "M", [
    hunk(28, 28, "[dependencies]", `
 portable-pty = "0.8"
-vt100 = "0.15"
+vt100 = "0.16"
 ratatui = "0.29"
`),
  ]),
  file("Cargo.lock", "M", [
    hunk(2417, 2417, "", `
 [[package]]
 name = "vt100"
-version = "0.15.2"
+version = "0.16.0"
 source = "registry+https://github.com/rust-lang/crates.io-index"
-checksum = "84cd863bf0db7e392ba3bd04994be3473491b31e66340672af5d11943c6274de"
+checksum = "a6a1c44b4cb80b1fc4b0d16c8e2a7a8fd38b3a62ad8e0d36c3a9b3ee5c8e0c71"
`),
  ], { total: { additions: 4, deletions: 4 } }),
]
