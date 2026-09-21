# BinsApp Admin Panel Push Notification & Navigation Guide

This document serves as the authoritative technical specification for frontend developers implementing real-time WebSocket listeners, FCM push notification handling, and deep-link routing for the **BinsApp Admin Panel**.

---

## 🏗 System Architecture & Delivery Channels

Admin notifications are dispatched through **three parallel channels**:

1. **MongoDB Notification Collection**: Saved to database (`Notification` model) for in-app inbox listing and unread badge counts.
2. **WebSocket Room (`user_<adminId>`)**: Real-time event push to active admin socket sessions via `io.to("user_<adminId>")`.
3. **Firebase Cloud Messaging (FCM)**: Push notification sent to admin device(s) with custom payload `metadata` for deep-linking.

---

## 🗄 1. Database Schema (`Notification` Model)

Notifications stored in the database contain the following fields:

```typescript
interface AdminNotificationDocument {
  _id: string;                // Mongo ObjectId
  user: string;               // Sender / Triggering User ObjectId
  to_id: string;              // Recipient Admin ObjectId
  type:                      // Notification Category Enum
    | "request"
    | "order"
    | "rating"
    | "message"
    | "offer"
    | "dustbin"
    | "admin-noti"
    | "support"
    | "user"
    | "company"
    | "swap_requested"
    | "swap_accepted"
    | "swap_completed"
    | "invoice_created"
    | "invoice_due"
    | "overage_recorded"
    | "lead_received"
    | "plan_assigned"
    | "weight_recorded"
    | "growth_tier_unlocked"
    | "growth_progress_milestone"
    | "growth_gate_failed"
    | "growth_tier_lost"
    | "financing_application_received"
    | "financing_application_approved"
    | "financing_application_denied"
    | "financing_application_submitted";
  order?: string;             // Associated Order ObjectId (if applicable)
  request?: string;           // Associated Request / Manual Review ObjectId
  dustbin?: string;           // Associated Bin Listing ObjectId
  title: string;              // Short notification header
  description: string;        // Full readable notification message
  isImportant: boolean;       // Priority flag (true = highlight / alert modal)
  seen: boolean;              // Read status (default: false)
  createdAt: string;          // ISO Date Timestamp
}
```

---

## ⚡ 2. Real-Time WebSocket Events Emitted to Admin

Admin clients connected via Socket.io listen to two primary WebSocket events on room `user_<adminId>`:

### Event A: `admin-noti`
Emitted for operational alerts, lifecycle state changes, and new user applications.

```json
{
  "success": true,
  "title": "New Service Request",
  "message": "Customer Name submitted a dumpster rental request #123456.",
  "type": "order",
  "orderId": "64a1b2c3d4e5f6a7b8c9d0e1",
  "service": "portaPotty",
  "userId": "64f8a1b2c3d4e5f6a7b8c9d0"
}
```

### Event B: `admin-manual-review`
Emitted when custom quote calculations require admin price review or hazard evaluation.

```json
{
  "success": true,
  "message": "New manual review request submitted",
  "requestId": "64c5d6e7f8a9b0c1d2e3f4a5",
  "service_type": "Tree Removal",
  "userId": "64f8a1b2c3d4e5f6a7b8c9d0"
}
```

### Event C: `new:notification`
Emitted for every saved notification to update the top navigation unread bell icon badge counter in real time.

---

## 📋 3. Detailed Admin Notification Catalog by Feature

Below is the complete catalog of all notification events dispatched to the Admin Panel, organized by feature area.

---

### Area 1: Order Lifecycle & Operations

#### 1.1 New Order Request Created
* **Trigger**: Customer submits a new service request (`createRequest` socket event).
* **DB Notification `type`**: `"request"`
* **Socket Event**: `admin-noti`
* **Title**: `"New Service Request"`
* **Description**: `"{Customer Name} submitted a {service_type} request #{Ref}."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "request" }`
* **Admin Navigation Target**: **Orders Management > Pending / New Requests** (`/admin/orders/requests/:orderId`)

#### 1.2 Provider Matched / Order Accepted
* **Trigger**: Operator accepts an assigned job (`acceptOffer` socket event).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Order Matched"`
* **Description**: `"{Provider Name} matched to {Customer Name}'s {service_type} order #{Ref}."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > Active Orders** (`/admin/orders/active/:orderId`)

#### 1.3 Provider On The Way
* **Trigger**: Operator marks themselves on the way (`ontheway-order` socket event).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Provider On the Way"`
* **Description**: `"{Provider Name} is on the way to drop off {service_type} order #{Ref} for {Customer Name}."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > In Transit** (`/admin/orders/active/:orderId`)

#### 1.4 Dropoff Confirmed
* **Trigger**: Operator confirms bin dropoff (`dropoff-order` socket event).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Dropoff Confirmed"`
* **Description**: `"{Provider Name} dropped off {service_type} order #{Ref} for {Customer Name}."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > Active Rentals** (`/admin/orders/active/:orderId`)

#### 1.5 Proof of Work Submitted
* **Trigger**: Operator uploads job completion photos (`proofofworkdone-order` socket event).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Proof of Work Submitted"`
* **Description**: `"{Provider Name} submitted proof for {service_type} order #{Ref}."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > Proof Review** (`/admin/orders/proof-review/:orderId`)

#### 1.6 Proof of Work Accepted
* **Trigger**: Customer approves proof of work (`complete-order` socket event).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Proof of Work Accepted"`
* **Description**: `"{Customer Name} accepted proof from {Provider Name} on #{Ref}."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > Completed** (`/admin/orders/completed/:orderId`)

#### 1.7 Proof of Work Rejected
* **Trigger**: Customer rejects proof of work with reason (`reject-proof` socket event).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Proof of Work Rejected"`
* **Description**: `"{Customer Name} rejected proof from {Provider Name} on {service_type} order #{Ref}. Reason: {Reason}"`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > Disputes / Issues** (`/admin/orders/disputes/:orderId`)

#### 1.8 Ready for Pickup
* **Trigger**: Customer marks rental ready for pickup (`readyforpickup-order` socket event).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Ready for Pickup"`
* **Description**: `"{Customer Name} marked {service_type} order #{Ref} ready for pickup."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > Pickup Dispatch** (`/admin/orders/pickups/:orderId`)

#### 1.9 Order Completed
* **Trigger**: Operator completes final pickup (`complete-pickup` or `complete-order` socket event).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Order Completed"`
* **Description**: `"{Provider Name} completed {service_type} order #{Ref} for {Customer Name}."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > Completed** (`/admin/orders/completed/:orderId`)

#### 1.10 Cancellation Requested by Operator
* **Trigger**: Operator requests order cancellation (`cancel-order` socket event).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Cancellation Requested"`
* **Description**: `"{Provider Name} requested cancel on {service_type} order #{Ref} ({Customer Name})."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > Cancellation Requests** (`/admin/orders/cancellations/:orderId`)

#### 1.11 Order Pre-Match Cancelled by Customer
* **Trigger**: Customer cancels unmatched request (`pre-match-cancel` socket event).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Request Cancelled"`
* **Description**: `"{Customer Name} cancelled unmatched {service_type} request #{Ref}. Hold released."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > Cancelled** (`/admin/orders/cancelled/:orderId`)

#### 1.12 Order Expired / Unmatched (24 Hours)
* **Trigger**: Worker thread auto-expires unaccepted order (`orderExpiryWorker.js`).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Request Expired"`
* **Description**: `"{Customer Name}'s {service_type} request #{Ref} expired unmatched. Hold released."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > Expired Requests** (`/admin/orders/expired/:orderId`)

#### 1.13 Rental Ending Soon (24h Expiry Warning)
* **Trigger**: Daily cron job finds rentals ending in <24 hours (`rentalExpiryReminderJob.js`).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Rental Ending Soon"`
* **Description**: `"{Customer Name}'s {service_type} order #{Ref} ends in less than 24 hours. Extension rate: ${rate}/day."`
* **Metadata Payload**: `{ orderId: "<OrderId>", action: "rental_ending_soon" }`
* **Admin Navigation Target**: **Orders Management > Active Rentals** (`/admin/orders/active/:orderId`)

#### 1.14 Overdue Daily Charge Applied
* **Trigger**: Midnight cron job applies overdue daily charge (`cronjobs.js`).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Overdue Rental Charge"`
* **Description**: `"Daily overdue charge of ${dayprice} applied to {Customer Name}'s {service_type} order #{Ref}. Accumulated extra: ${extra}."`
* **Metadata Payload**: `{ orderId: "<OrderId>", action: "overdue_daily_charge" }`
* **Admin Navigation Target**: **Billing & Orders > Overdue Rentals** (`/admin/billing/overdue/:orderId`)

#### 1.15 Rental Extended
* **Trigger**: Customer pays extension fee (`order-extended` socket event).
* **DB Notification `type`**: `"order"`
* **Socket Event**: `admin-noti`
* **Title**: `"Rental Extended"`
* **Description**: `"{Customer Name} extended {service_type} order #{Ref} by {days} days (${price})."`
* **Metadata Payload**: `{ orderId: "<OrderId>", type: "order" }`
* **Admin Navigation Target**: **Orders Management > Active Rentals** (`/admin/orders/active/:orderId`)

---

### Area 2: Manual Review & Custom Quotes

#### 2.1 High Tree / Hazard Risk Manual Review Request
* **Trigger**: Customer requests AI tree assessment or custom DBH quote requiring manual review (`analyze-tree-job` / `analyze-junk-job` / `request-manual-review`).
* **DB Notification `type`**: `"admin-noti"`
* **Socket Event**: `admin-manual-review` + `new:notification`
* **Title**: `"New Manual Review Request"`
* **Description**: `"Custom quote request submitted for {service_type} requiring manual intervention."`
* **Is Important**: `true` (Red priority banner)
* **Metadata Payload**: `{ requestId: "<RequestId>", service_type: "<ServiceType>", userId: "<UserId>" }`
* **Admin Navigation Target**: **Manual Review Queue > Review Detail** (`/admin/manual-reviews/:requestId`)

#### 2.2 New Bin / Porta Potty Listing Created for Approval
* **Trigger**: Operator lists a new dumpster or porta potty (`createBin` in `bin/service.js`).
* **DB Notification `type`**: `"dustbin"`
* **Socket Event**: `admin-noti`
* **Title**: `"New {Porta Potty | Bin} Request"`
* **Description**: `"{Operator Name} has created a new {porta potty | bin}"`
* **Metadata Payload**: `{ bin: "<DustbinId>", user: "<OperatorId>" }`
* **Admin Navigation Target**: **Inventory Approvals > Bin Review** (`/admin/inventory/approvals/:dustbinId`)

---

### Area 3: User Onboarding & Partner Verification

#### 3.1 New Service Application Submitted
* **Trigger**: User applies for PortaPotty, TreeRemoval, JunkRemoval, or Company partner role (`applyService` in `users/service.js`).
* **DB Notification `type`**: `"user"`
* **Socket Event**: `admin-noti`
* **Title**: `"New {Service Label} Application"`
* **Description**: `"User {Name/Email} has submitted a Company application."` / `"User {Name/Email} has applied for {Service Label}."`
* **Metadata Payload**: `{ userId: "<UserId>", service: "<serviceKey>" }`
* **Admin Navigation Target**: **Partner Management > Pending Applications** (`/admin/partners/applications/:userId`)

#### 3.2 New Company Profile Created for Verification
* **Trigger**: Operator registers a new company (`createCompany` in `company/service.js`).
* **DB Notification `type`**: `"admin-noti"`
* **Socket Event**: `admin-noti`
* **Title**: `"New Company {Company Name} Created"`
* **Description**: `"New company {Company Name} has been created please verify and approve it"`
* **Metadata Payload**: `{ companyId: "<CompanyId>", userId: "<UserId>" }`
* **Admin Navigation Target**: **Company Management > Approvals** (`/admin/companies/pending/:companyId`)

#### 3.3 Company Information Updated
* **Trigger**: Operator updates company registration details (`updateCompany` in `company/service.js`).
* **DB Notification `type`**: `"admin-noti"`
* **Socket Event**: `admin-noti`
* **Title**: `"{Company Name} updated its company information"`
* **Description**: `"{Company Name} updated its company information please check and verify"`
* **Metadata Payload**: `{ companyId: "<CompanyId>" }`
* **Admin Navigation Target**: **Company Management > Company Detail** (`/admin/companies/:companyId`)

---

### Area 4: Commercial Portal & Account Billing (`commercialNotify.js`)

#### 4.1 Commercial Bin Swap Requested
* **Trigger**: Commercial account requests container swap (`swap_requested`).
* **DB Notification `type`**: `"swap_requested"` / `"admin-noti"`
* **Socket Event**: `admin-noti`
* **Title**: `"Commercial Container Swap Requested"`
* **Description**: `"Container swap requested for Order #{Ref} at {Address}."`
* **Metadata Payload**: `{ orderId: "<OrderId>", link: "<CustomerOrOwnerLink>" }`
* **Admin Navigation Target**: **Commercial Portal > Swaps Dispatch** (`/admin/commercial/swaps/:orderId`)

#### 4.2 Commercial Lead Received
* **Trigger**: Enterprise customer submits commercial quote form (`lead_received`).
* **DB Notification `type`**: `"lead_received"`
* **Socket Event**: `admin-noti`
* **Title**: `"New Commercial Account Lead"`
* **Description**: `"Enterprise lead submitted by {Company Name}."`
* **Metadata Payload**: `{ leadId: "<LeadId>" }`
* **Admin Navigation Target**: **Commercial Portal > Enterprise Leads** (`/admin/commercial/leads/:leadId`)

---

### Area 5: Support & Customer Relations

#### 5.1 New Support Ticket Created
* **Trigger**: Customer or operator submits a support ticket (`createSupport` in `support/service.js`).
* **DB Notification `type`**: `"support"`
* **Socket Event**: `admin-noti`
* **Title**: `"New Support Ticket"`
* **Description**: `"A User have created a new Support ticket!"`
* **Is Important**: `true`
* **Metadata Payload**: `{ supportId: "<SupportId>", userId: "<UserId>" }`
* **Admin Navigation Target**: **Support Desk > Ticket View** (`/admin/support/tickets/:supportId`)

---

## 🗺 4. Master Frontend Admin Navigation Matrix

Use this lookup matrix in your Admin Panel router / push notification handler:

| DB `type` | Notification Title Key | Associated Payload Keys | Recommended Admin Route / Screen |
| :--- | :--- | :--- | :--- |
| `"request"` | New Service Request | `order`, `orderId` | `/admin/orders/requests/:orderId` |
| `"order"` | Order Matched / On The Way / Dropoff | `order`, `orderId` | `/admin/orders/active/:orderId` |
| `"order"` | Proof of Work Submitted / Accepted / Rejected | `order`, `orderId` | `/admin/orders/proof-review/:orderId` |
| `"order"` | Cancellation Requested | `order`, `orderId` | `/admin/orders/cancellations/:orderId` |
| `"order"` | Ready for Pickup / Order Completed | `order`, `orderId` | `/admin/orders/completed/:orderId` |
| `"order"` | Overdue Rental Charge / Rental Extended | `order`, `orderId` | `/admin/billing/orders/:orderId` |
| `"admin-noti"` | New Manual Review Request | `request`, `requestId` | `/admin/manual-reviews/:requestId` |
| `"dustbin"` | New Porta Potty / Bin Request | `dustbin`, `bin` | `/admin/inventory/approvals/:dustbinId` |
| `"user"` | New Application (Company/Porta/Tree/Junk) | `userId`, `user` | `/admin/partners/applications/:userId` |
| `"company"` | New Company Created / Updated | `companyId`, `user` | `/admin/companies/pending/:companyId` |
| `"swap_requested"`| Commercial Container Swap Requested | `order`, `orderId` | `/admin/commercial/swaps/:orderId` |
| `"lead_received"` | Commercial Lead Received | `leadId` | `/admin/commercial/leads/:leadId` |
| `"support"` | New Support Ticket | `supportId`, `user` | `/admin/support/tickets` |
| `"financing_application_submitted"` | Financing Application Received | `operatorId` | `/admin/growth/financing/:operatorId` |

---

## 💡 5. Recommended Frontend Implementation Code Snippet

```typescript
// Example Socket.io Listener in Admin React / Next.js Application
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";

export function useAdminNotificationListener(adminUserId: string) {
  const navigate = useNavigate();

  useEffect(() => {
    const socket = io("https://api.binsapp.ai", {
      auth: { token: localStorage.getItem("token") }
    });

    // 1. Operational & Lifecycle Notifications
    socket.on("admin-noti", (data) => {
      console.log("Admin Notification Received:", data);
      toast.info(`${data.title}: ${data.message}`);
    });

    // 2. High-Priority Manual Review Requests
    socket.on("admin-manual-review", (data) => {
      console.log("Manual Review Request:", data);
      toast.error(`MANUAL REVIEW REQUIRED: ${data.service_type}`, {
        onClick: () => navigate(`/admin/manual-reviews/${data.requestId}`)
      });
    });

    // 3. Real-Time Unread Badge Counter Update
    socket.on("new:notification", (notification) => {
      updateUnreadNotificationCount((prev) => prev + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, [adminUserId, navigate]);
}
```
