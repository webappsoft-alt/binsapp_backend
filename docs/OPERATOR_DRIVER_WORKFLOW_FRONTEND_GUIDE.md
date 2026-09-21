# BINS APP — Operator Acceptance, Driver Assignment & Delivery Workflow
## Frontend Integration & UI/UX Developer Guide

---

## 1. Overview & Workflow Lifecycle

This guide covers the end-to-end integration for the **Operator Job Flow**, **Driver Job Execution**, and **Customer Real-Time Tracking**.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  JOB ALERT   │ ──> │    ACCEPT    │ ──> │    ASSIGN DRIVER     │ ──> │   DISPATCH   │ ──> │   COMPLETE   │ ──> │   GET PAID   │
│ (Push/Socket)│     │  (Immediate) │     │ (Modal Automatically)│     │ (Push/SMS/WS)│     │(Photo Proofs)│     │ (Auto-Payout)│
└──────────────┘     └──────────────┘     └──────────────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### Role Separation
| Role | Allowed Access & Scope | Restricted / Scrubbed |
|---|---|---|
| **Operator / Owner** | Full operational + financial data, driver roster management, dispatch, payouts, pricing breakdown | N/A |
| **Driver / Sub-User** | Operational job details, pickup/drop-off destination, unit number, customer placement photos, driveway surface type, gate codes, access instructions, contact preferences | **Financials, pricing strategy, company earnings, customer total, stripe payouts, other drivers' jobs** |
| **Customer / Rentee** | Order tracking, driver en-route status, drop-off photos, delivery confirmation, swap/pickup requests | Driver internal notes, company payouts, operator pricing margins |

---

## 2. Operator Flow (Mobile & Web)

### Step 2.1: Job Alert & Acceptance
When an operator accepts an order, the frontend must **NOT** navigate away or make the operator find the Drivers section. The **Assign Driver Modal** must appear **immediately**.

#### Socket Event: Operator Accepts Job
```javascript
// Operator clicks "ACCEPT"
socket.emit("update-request-renter", {
  orderId: "65b...",
  status: "accepted"
}, (response) => {
  if (response.success) {
    // 1. response.driverAssignmentRequired === true
    // 2. response.driversData contains saved company drivers + operator profile
    // 3. Open Assign Driver Modal immediately with response.driversData
    openAssignDriverModal({
      orderId: response.orderId,
      order: response.order,
      driversData: response.driversData
    });
  }
});

// Listener for real-time trigger across multiple devices
socket.on("operator:assign-driver-prompt", ({ orderId, order, driversData }) => {
  openAssignDriverModal({ orderId, order, driversData });
});
```

---

### Step 2.2: Assign Driver Modal
The modal presents 3 clear options to the operator:

```
┌─────────────────────────────────────────────────────────┐
│                    ASSIGN DRIVER                        │
│  Order #BINS-9824  •  10 Yard Dumpster  •  4.2 miles    │
├─────────────────────────────────────────────────────────┤
│ [1] ASSIGN DRIVER (Select from Saved List)              │
│     ○ John Doe  (Active Jobs: 1)                        │
│     ○ Alex Smith (Active Jobs: 0)  [Recommended]        │
│                                                         │
│ [2] DO IT MYSELF                                        │
│     ○ Assign to Me (Owner / Operator)                   │
│                                                         │
│ [3] + ADD DRIVER                                        │
│     [ Import from Contacts ]  or  [ Add Manually ]      │
│     • Name: [ Mike Johnson ]                            │
│     • Phone: [ +1 (555) 234-5678 ]                      │
│     (Automatically saved to Company Driver list)        │
│                                                         │
│ Unit / Equipment #: [ BINS-UNIT-102 ] (Optional)        │
├─────────────────────────────────────────────────────────┤
│ [  ASSIGN DRIVER  ]    or    [  ASSIGN & DISPATCH NOW  ]│
└─────────────────────────────────────────────────────────┘
```

#### Fetch Saved Drivers (if needed independently):
- **Socket**: `socket.emit("operator:get-drivers", {}, callback)`
- **REST**: `GET /api/assignOrder/operator/drivers` (Header: `Authorization: Bearer <TOKEN>`)

**Response Shape**:
```json
{
  "success": true,
  "operator": {
    "_id": "65a1...",
    "name": "Acme Hauling Inc (Owner)",
    "phone": "+15551112222",
    "email": "owner@acmehauling.com",
    "isSelf": true
  },
  "drivers": [
    {
      "_id": "65b2...",
      "name": "John Doe",
      "phone": "+15553334444",
      "email": "john@acmehauling.com",
      "status": "active",
      "activeJobsCount": 1
    }
  ]
}
```

#### Option A: Assign Existing Driver
```javascript
socket.emit("operator:assign-driver", {
  orderId: "65c3...",
  driverId: "65b2...",
  driverType: "driver",
  unitNumber: "UNIT-102",
  autoDispatch: false // or true to dispatch immediately
}, (res) => {
  if (res.success) {
    // Update UI to show "Assigned Driver: John Doe" and enable "DISPATCH JOB"
  }
});
```

#### Option B: Do It Myself (Assign to Owner/Operator)
```javascript
socket.emit("operator:assign-driver", {
  orderId: "65c3...",
  driverType: "self",
  autoDispatch: true
}, (res) => { ... });
```

#### Option C: Add New Driver (Manual or Contacts Import)
```javascript
socket.emit("operator:assign-driver", {
  orderId: "65c3...",
  driverType: "driver",
  newDriverData: {
    name: "Mike Johnson",
    phone: "+15557778888",
    email: "mike@example.com"
  },
  autoDispatch: false
}, (res) => { ... });
```

---

### Step 2.3: Dispatching the Job
Once assigned, the job displays `Assigned Driver: [Driver Name]`. Clicking **DISPATCH JOB** triggers:

- **Socket**: `socket.emit("operator:dispatch-job", { orderId: "65c3..." }, callback)`
- **REST**: `POST /api/assignOrder/operator/dispatch` `{ "orderId": "65c3..." }`

**What Happens**:
- Driver receives Push Notification + SMS with direct route link (`https://api.binsapp.ai/assign-driver?token=...`).
- Driver's app receives socket event `driver:job-dispatched`.
- Operator dashboard updates status to `DISPATCHED`.

---

### Step 2.4: Change Driver (Reassignment)
Operators can reassign any active job to another driver at any time:

```javascript
socket.emit("operator:change-driver", {
  orderId: "65c3...",
  newDriverId: "65b9...",
  reason: "Previous driver truck maintenance"
}, (res) => {
  // Previous driver gets revoked notice
  // New driver receives full dispatch job package
});
```

---

## 3. Driver Flow (Driver Mobile App / Mobile Web)

The driver receives scoped operational data without sensitive company financials.

### Step 3.1: Load Scoped Job Details
- **Socket**: `socket.emit("driver:get-job-details", { orderId: "65c3..." }, (res) => { ... })`
- **REST**: `GET /api/assignOrder/driver/job-details/:orderId`

**Driver Payload Structure**:
```json
{
  "_id": "65c3...",
  "orderNumber": "BN-8291",
  "service_type": "Dumbster",
  "address": "123 Main St, Austin, TX 78701",
  "location": { "coordinates": [-97.7431, 30.2672] },
  "drivewaySurfaceType": "Concrete (Protect with wooden boards)",
  "gateAccessCode": "#4821",
  "accessInstructions": "Gate on left side of driveway. Dog inside fence.",
  "placementLocation": "Right side of driveway near garage",
  "placementPhotos": [
    "https://storage.googleapis.com/binsapp/placement_1.jpg"
  ],
  "obstaclesNotes": "Low hanging oak tree branches at entrance",
  "contactPreference": "call_on_arrival",
  "deliveryWorkflow": {
    "status": "dispatched",
    "unitNumber": "UNIT-102",
    "assignedDriverName": "John Doe"
  },
  "user": {
    "name": "Sarah Jenkins (Customer)",
    "phone": "+15559876543"
  }
}
```

---

### Step 3.2: Delivery / Drop-Off Progression

```
[ 1. EN ROUTE ] ───> [ 2. ARRIVED ] ───> [ 3. REVIEW PLACEMENT ] ───> [ 4. PROOF PHOTOS ] ───> [ 5. COMPLETE ]
```

#### 1. Tap "EN ROUTE"
Notifies customer and operator that the driver is on the way.
```javascript
socket.emit("driver:en-route", {
  orderId: "65c3...",
  currentlat: 30.2672,
  currentlng: -97.7431
}, (res) => { ... });
```

#### 2. Tap "I HAVE ARRIVED"
Records GPS arrival timestamp and displays customer placement instructions prominently.
```javascript
socket.emit("driver:arrived", {
  orderId: "65c3...",
  currentlat: 30.2672,
  currentlng: -97.7431
}, (res) => { ... });
```

#### 3. Upload Drop-Off Proof Photos
Driver takes geotagged drop-off photos and enters unit number / drop-off notes.
```javascript
socket.emit("driver:upload-delivery-proof", {
  orderId: "65c3...",
  deliveryPhotos: [
    "https://storage.googleapis.com/binsapp/dropoff_photo1.jpg",
    "https://storage.googleapis.com/binsapp/dropoff_photo2.jpg"
  ],
  deliveryNotes: "Placed on wooden boards on right driveway as requested.",
  unitNumber: "UNIT-102"
}, (res) => { ... });
```

#### 4. Tap "COMPLETE DELIVERY"
Finalizes the drop-off step and notifies customer & operator.
```javascript
socket.emit("driver:complete-delivery", {
  orderId: "65c3..."
}, (res) => {
  if (res.success) {
    // Show success screen: "Delivery Complete!"
  }
});
```

---

### Step 3.3: Pickup Progression

```
[ 1. PICKUP EN ROUTE ] ───> [ 2. ARRIVED ] ───> [ 3. BEFORE PHOTO / ISSUE ] ───> [ 4. AFTER PHOTO ] ───> [ 5. COMPLETE PICKUP ]
```

#### 1. Pickup En Route & Arrive
- **En Route**: `socket.emit("driver:pickup-en-route", { orderId, currentlat, currentlng })`
- **Arrived**: `socket.emit("driver:pickup-arrived", { orderId, currentlat, currentlng })`

#### 2. Report Pickup Issue (e.g. Blocked Driveway / Overfilled Dumpster)
```javascript
socket.emit("driver:report-pickup-issue", {
  orderId: "65c3...",
  issueType: "Blocked Access", // "Overfilled", "Hazardous Material", "Blocked Access", "Other"
  notes: "A vehicle is parked directly blocking the dumpster.",
  photos: ["https://storage.googleapis.com/binsapp/issue_photo1.jpg"]
}, (res) => {
  // Operator is alerted immediately in real-time
});
```

#### 3. Upload Pickup Proof Photos (Before & After)
```javascript
socket.emit("driver:upload-pickup-proof", {
  orderId: "65c3...",
  beforePickupPhotos: ["https://storage.googleapis.com/binsapp/before_pickup.jpg"],
  afterPickupPhotos: ["https://storage.googleapis.com/binsapp/clean_site.jpg"],
  pickupNotes: "Dumpster hauled away, driveway swept clean."
}, (res) => { ... });
```

#### 4. Complete Pickup & Auto-Payout
```javascript
socket.emit("driver:complete-pickup", {
  orderId: "65c3..."
}, (res) => {
  // Payout automatically settled to operator account
});
```

---

### Step 3.4: Dumpster Swap Progression
```javascript
socket.emit("driver:complete-swap", {
  orderId: "65c3...",
  existingUnitPhotos: ["https://storage.googleapis.com/binsapp/old_unit.jpg"],
  replacementUnitNumber: "UNIT-204",
  replacementPhotos: ["https://storage.googleapis.com/binsapp/new_unit.jpg"],
  swapNotes: "Replaced 20 yard dumpster with fresh 20 yard unit."
}, (res) => { ... });
```

---

## 4. Customer Flow (Order Creation & Live Tracking)

### Step 4.1: Customer Booking Payload
When customer submits order (`send-request-rentee` socket event or REST booking), include all placement instructions:

```javascript
socket.emit("send-request-rentee", {
  service_type: "Dumbster",
  dumbsterId: "65a9...",
  price: 450,
  address: "123 Main St, Austin, TX 78701",
  location: { type: "Point", coordinates: [-97.7431, 30.2672] },
  start_date: "2026-08-20",
  end_date: "2026-08-27",

  // --- Customer Placement Instructions ---
  placementPhotos: [
    "https://storage.googleapis.com/binsapp/customer_driveway.jpg"
  ],
  drivewaySurfaceType: "Asphalt",
  gateAccessCode: "#1234",
  accessInstructions: "Call gate upon arrival",
  placementLocation: "Left side of driveway",
  obstaclesNotes: "Low telephone line overhead",
  contactPreference: "call_on_arrival", // "call_on_arrival" | "text_on_arrival" | "do_not_disturb"
  specialInstructions: "Please place wood boards under wheels"
}, (callback) => { ... });
```

### Step 4.2: Real-Time Customer Tracking Events
The customer app should listen for these live updates:
```javascript
// Driver is approaching
socket.on("onway-order-rentee", ({ order, title, message }) => {
  showNotification({ title, message });
  updateOrderMapStatus("DRIVER_ON_THE_WAY");
});

// Dumpster is dropped off & ready
socket.on("dropoff-order-rentee", ({ order, title, message }) => {
  showNotification({ title: "Dumpster Delivered!", message });
  displayDropoffPhotos(order.deliveryWorkflow?.deliveryPhotos || [order.dropoffimage]);
});

// Order updates
socket.on("update-order-rentee", ({ order, title, message }) => {
  refreshOrderDetails(order);
});
```

---

## 5. REST API Quick Reference

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/api/assignOrder/operator/drivers` | Operator | Get saved company drivers + operator profile |
| `POST` | `/api/assignOrder/operator/drivers` | Operator | Save new driver to company roster |
| `POST` | `/api/assignOrder/operator/assign-driver` | Operator | Assign driver (saved, self, or new) |
| `POST` | `/api/assignOrder/operator/dispatch` | Operator | Dispatch assigned job |
| `POST` | `/api/assignOrder/operator/change-driver` | Operator | Reassign job to different driver |
| `GET` | `/api/assignOrder/operator/live-dashboard` | Operator | Live overview of all active jobs & drivers |
| `GET` | `/api/assignOrder/driver/job-details/:orderId` | Driver | Get role-sanitized operational job details |
| `POST` | `/api/assignOrder/driver/en-route` | Driver | Mark driver en-route to site |
| `POST` | `/api/assignOrder/driver/arrived` | Driver | Record arrival timestamp & GPS |
| `POST` | `/api/assignOrder/driver/delivery-proof` | Driver | Upload delivery proof photos & notes |
| `POST` | `/api/assignOrder/driver/complete-delivery` | Driver | Complete delivery step |
| `POST` | `/api/assignOrder/driver/pickup-proof` | Driver | Upload before/after pickup photos |
| `POST` | `/api/assignOrder/driver/report-issue` | Driver | Report pickup access/capacity issue |
| `POST` | `/api/assignOrder/driver/complete-pickup` | Driver | Finalize pickup & trigger payout |
| `POST` | `/api/assignOrder/driver/complete-swap` | Driver | Complete dumpster swap |

---

## 6. Real-Time Socket Event Summary Table

| Event Name | Direction | Payload Parameters | Purpose |
|---|---|---|---|
| `update-request-renter` | Operator → Server | `{ orderId, status: "accepted" }` | Accepts job & returns `driverAssignmentRequired: true` + `driversData` |
| `operator:assign-driver-prompt` | Server → Operator | `{ orderId, order, driversData }` | Pops Assign Driver modal immediately |
| `operator:get-drivers` | Operator → Server | `{}` | Returns saved driver roster |
| `operator:add-driver` | Operator → Server | `{ name, phone, email, notes }` | Adds driver to company list |
| `operator:assign-driver` | Operator → Server | `{ orderId, driverId, driverType, autoDispatch, unitNumber }` | Assigns driver & creates assignment record |
| `operator:dispatch-job` | Operator → Server | `{ orderId, workflowType }` | Dispatches job & notifies driver |
| `operator:change-driver` | Operator → Server | `{ orderId, newDriverId, reason }` | Reassigns job |
| `operator:dashboard-live` | Operator → Server | `{}` | Live dashboard summary |
| `driver:job-dispatched` | Server → Driver | `{ orderId, workflowType, job }` | Real-time dispatch notice to driver |
| `driver:get-job-details` | Driver → Server | `{ orderId }` | Returns scrubbed operational job data |
| `driver:en-route` | Driver → Server | `{ orderId, currentlat, currentlng }` | Status → En Route |
| `driver:arrived` | Driver → Server | `{ orderId, currentlat, currentlng }` | Status → Arrived (GPS recorded) |
| `driver:upload-delivery-proof` | Driver → Server | `{ orderId, deliveryPhotos, deliveryNotes, unitNumber }` | Uploads delivery proof |
| `driver:complete-delivery` | Driver → Server | `{ orderId }` | Status → Delivered |
| `onway-order-rentee` | Server → Customer | `{ orderId, order, title, message }` | Customer alert: Driver on the way |
| `dropoff-order-rentee` | Server → Customer | `{ orderId, order, title, message }` | Customer alert: Dumpster delivered |
| `driver:report-pickup-issue` | Driver → Server | `{ orderId, issueType, notes, photos }` | Reports issue to operator |
| `driver:complete-pickup` | Driver → Server | `{ orderId }` | Finalizes pickup & triggers payout |
| `driver:complete-swap` | Driver → Server | `{ orderId, existingUnitPhotos, replacementUnitNumber, replacementPhotos }` | Finalizes swap |
