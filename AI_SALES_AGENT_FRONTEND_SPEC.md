# BinsApp AI Sales Agent Engine — Frontend Integration Specification & API/Socket Contract

**Document Version:** 1.0.0  
**Target Platform:** Web (Desktop & Mobile Responsive), React / Next.js / Vue / Vanilla JS  
**Backend Gateway URL:** `https://api.binsapp.ai`  
**WebSocket Namespace:** `https://api.binsapp.ai/sales-agent`  

---

## 1. Architecture Overview & Widget Lifecycle

The **BinsApp AI Sales Agent** is a real-time consultative sales engine embedded on all BinsApp web surfaces. It provides instant pricing, dumpster sizing recommendations, lead capture, and frictionless zero double-entry booking redirects.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Visitor Enters Website                                 │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
                    ┌────────────────────────────────────────────────┐
                    │ 1. Initialize `visitorSessionId` in LocalStore │
                    │ 2. Connect to Socket.io `/sales-agent`         │
                    └───────────────────────┬────────────────────────┘
                                            │
                    ┌───────────────────────┴────────────────────────┐
                    │                                                │
                    ▼                                                ▼
     [Returning Visitor with History]                 [New / Idle Visitor (5-7s Delay)]
                    │                                                │
                    ▼                                                ▼
     `sales:init_session` -> Restore Dialogue         Trigger Proactive Greeting Bubble
                    │                                                │
                    └───────────────────────┬────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. Conversational Streaming & Interactive Action Cards (`sales:action_card`)          │
│    • Quick Replies • Sizing Cards (10-40yd) • Photo Uploader • Prefilled Booking Link │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 4. Zero Double-Entry Booking Redirect                                                 │
│    `/book/dumpster-rental?ref_token=<TOKEN>` -> Hydrate Form via GET /checkout-session │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1.1 Visitor Session ID Lifecycle
Every browser client must generate and persist a unique `visitorSessionId` (UUIDv4) in `localStorage`.

```typescript
// src/utils/salesAgentSession.ts
export function getOrCreateSessionId(): string {
  const KEY = "bins_sales_session_id";
  let sessionId = localStorage.getItem(KEY);
  if (!sessionId) {
    sessionId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem(KEY, sessionId);
  }
  return sessionId;
}
```

### 1.2 Proactive Greeting Triggers
The proactive chat bubble must automatically appear on landing pages when any of the following conditions are met:
1. **Idle Time:** User has spent **5 to 7 seconds** on the page without opening the widget.
2. **Scroll Depth:** User scrolls past **40% of the viewport height**.
3. **High-Intent Pages:** Immediate (1.5s delay) on `/dumpster-rental`, `/junk-removal`, `/tree-service`, `/porta-potty`.
4. **Dismiss Logic:** If the user closes the proactive bubble (`×`), store `bins_greeting_dismissed = "true"` in `sessionStorage` so it is not shown again during the current browsing session.

---

## 2. Real-Time Socket.io Contract

### 2.1 Connection Setup
- **Namespace:** `/sales-agent`
- **Full Connection URL:** `https://api.binsapp.ai/sales-agent`
- **Transports:** `["websocket", "polling"]`

```typescript
import { io, Socket } from "socket.io-client";
import { getOrCreateSessionId } from "./salesAgentSession";

const sessionId = getOrCreateSessionId();
const userJwtToken = localStorage.getItem("user_token") || "";

export const salesAgentSocket: Socket = io("https://api.binsapp.ai/sales-agent", {
  transports: ["websocket", "polling"],
  auth: {
    sessionId,
    token: userJwtToken, // Optional JWT if user is already logged in
  },
  query: {
    sessionId,
  },
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});
```

---

### 2.2 Client-to-Server Events

#### `sales:init_session`
Initiates session handshake and fetches previous chat history (Redis sliding window buffer).

* **When to send:** Immediately on socket `connect` event.
* **Payload:**
```json
{
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192"
}
```
* **Server Callback Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192",
    "history": [
      {
        "role": "user",
        "content": "Hi, what size dumpster do I need for a garage cleanout?",
        "timestamp": "2026-09-02T14:30:00.000Z"
      },
      {
        "role": "assistant",
        "content": "For a standard 1-2 car garage cleanout, a **15-yard** or **20-yard dumpster** is typically the perfect fit!",
        "timestamp": "2026-09-02T14:30:02.000Z"
      }
    ],
    "meta": {
      "currentFunnel": "service_booking"
    },
    "isPaused": false
  }
}
```

---

#### `sales:send_message`
Sends visitor input to the conversational engine.

* **Payload:**
```json
{
  "message": "Can I get a 20 yard dumpster delivered to 78701 this Friday?",
  "funnel": "service_booking",
  "location": {
    "zipCode": "78701",
    "city": "Austin",
    "state": "TX"
  }
}
```

---

#### `sales:user_typing`
Notifies server that visitor is actively typing.

* **Payload:**
```json
{
  "isTyping": true
}
```

---

#### `sales:request_human`
Explicit request by visitor for live operator assistance or instant phone callback.

* **Payload:**
```json
{
  "reason": "Need custom pricing for 5 commercial job sites",
  "contact": {
    "name": "Alex Miller",
    "phone": "+15125550199",
    "email": "alex@millerconstruction.com"
  }
}
```
* **Server Callback Response:**
```json
{
  "success": true,
  "message": "Human specialist requested."
}
```

---

### 2.3 Server-to-Client Events

#### `sales:stream_token`
Token-by-token incremental chunks produced by OpenAI (`gpt-4o-mini`).

* **Payload:**
```json
{
  "token": "We ",
  "chunkIndex": 0,
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192"
}
```
* **UI Rendering Rule:** Append `token` to the current assistant message container. Parse with a Markdown renderer (e.g., `marked`, `react-markdown`) to support bolding, bullet points, and pricing links.

---

#### `sales:stream_end`
Signals that the current streaming response turn has finished.

* **Payload:**
```json
{
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192",
  "fullResponse": "We have 20-yard roll-off containers available in Austin (78701) for Friday delivery! Pricing starts at $425 with 3 tons included.",
  "actionCards": []
}
```

---

#### `sales:typing_indicator`
Controls the animated loading dots in the chat interface.

* **Payload:**
```json
{
  "isTyping": true,
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192"
}
```

---

#### `sales:action_card`
Pushes rich interactive components directly into the conversation thread.

* **Payload:**
```json
{
  "cardType": "sizing_picker" | "checkout_link" | "quick_replies" | "media_upload" | "lead_form",
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192",
  "payload": { ... }
}
```

---

#### `sales:handoff_initiated`
Signals that a staff operator has claimed the chat session.

* **Payload:**
```json
{
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192",
  "operatorName": "Sarah Specialist",
  "message": "Sarah Specialist has joined the conversation."
}
```
* **UI Rule:** Display an amber banner: `👨‍💼 Live Specialist Joined`. Disable the AI bot avatar.

---

#### `sales:operator_message`
Direct message sent by a human staff member.

* **Payload:**
```json
{
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192",
  "operatorName": "Sarah Specialist",
  "message": "Hello Alex! I see you need 5 commercial dumpsters. I can apply our commercial contractor rate of 15% off.",
  "timestamp": "2026-09-02T14:35:00.000Z"
}
```

---

#### `sales:handoff_ended`
Signals that the human operator has released the session back to the AI.

* **Payload:**
```json
{
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192",
  "message": "Conversation has been returned to the AI assistant."
}
```

---

#### `sales:error`
Graceful error notifications.

* **Payload:**
```json
{
  "code": "SALES_AGENT_TURN_ERROR" | "RATE_LIMITED",
  "message": "An error occurred while generating response."
}
```

---

## 3. Action Cards & Dynamic UI Payloads (`sales:action_card`)

### 3.1 Quick Reply Choice Buttons
Rendered as clickable pill buttons below the message.

**Payload (`cardType: "quick_replies"`):**
```json
{
  "cardType": "quick_replies",
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192",
  "payload": {
    "title": "How can we assist you today?",
    "options": [
      { "label": "🗑 Dumpster Rental", "value": "I need a dumpster rental quote" },
      { "label": "🚛 Junk Removal", "value": "I need junk removal service" },
      { "label": "🌳 Tree Removal", "value": "I need a tree removal estimate" },
      { "label": "🚽 Porta Potty Rental", "value": "I need porta potty rental pricing" },
      { "label": "🤝 Join as a Provider", "value": "I want to join BinsApp as a hauler/provider" }
    ]
  }
}
```

---

### 3.2 Dumpster Sizing Selector Cards
Interactive carousel showing container dimensions, weight capacities, and pricing.

**Payload (`cardType: "sizing_picker"`):**
```json
{
  "cardType": "sizing_picker",
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192",
  "payload": {
    "title": "Select Recommended Dumpster Size",
    "sizes": [
      {
        "size": "10 Yard",
        "dimensions": "14ft L × 7.5ft W × 3.5ft H",
        "capacity": "~3-4 Pickup Loads (2 Tons Included)",
        "bestFor": "Small garage/basement cleanouts, single room remodel, yard debris",
        "startingPrice": 349
      },
      {
        "size": "20 Yard",
        "dimensions": "22ft L × 8ft W × 4.5ft H",
        "capacity": "~6-8 Pickup Loads (3 Tons Included)",
        "bestFor": "Deck removal, multi-room cleanout, roof replacement (most popular)",
        "startingPrice": 425,
        "isPopular": true
      },
      {
        "size": "30 Yard",
        "dimensions": "22ft L × 8ft W × 6ft H",
        "capacity": "~9-12 Pickup Loads (4 Tons Included)",
        "bestFor": "Major home addition, demolition, new home construction",
        "startingPrice": 525
      },
      {
        "size": "40 Yard",
        "dimensions": "22ft L × 8ft W × 8ft H",
        "capacity": "~12-16 Pickup Loads (5-6 Tons Included)",
        "bestFor": "Large commercial cleanout, industrial demolition, tree clearings",
        "startingPrice": 649
      }
    ]
  }
}
```

---

### 3.3 Photo Upload Trigger Card (Tree & Junk Removal)
Displays an inline dropzone for uploading project photos.

**Payload (`cardType: "media_upload"`):**
```json
{
  "cardType": "media_upload",
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192",
  "payload": {
    "title": "Upload Project Photos for Accurate Quote",
    "description": "Upload up to 5 photos of your junk pile or tree location.",
    "serviceType": "Junk Removal",
    "acceptedFormats": ["image/jpeg", "image/png", "image/webp"],
    "maxFiles": 5
  }
}
```

* **Frontend Upload Procedure:**
  1. User selects images.
  2. Frontend sends `POST /api/upload-image` (`multipart/form-data`, field name: `image`).
  3. Server responds with `{ "file": "https://storage.googleapis.com/..." }`.
  4. Frontend sends a `sales:send_message` with:
     `"I uploaded project photos: https://storage.googleapis.com/..."`.

---

### 3.4 Prefilled Checkout Redirect CTA Card
Pushed when the user is ready to book. Contains the single-use `ref_token`.

**Payload (`cardType: "checkout_link"`):**
```json
{
  "cardType": "checkout_link",
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192",
  "payload": {
    "title": "Ready to Complete Your Booking",
    "token": "4a92bc7801df42f88325a74e2d19bc32",
    "checkoutUrl": "https://www.binsapp.ai/book/dumpster-rental?ref_token=4a92bc7801df42f88325a74e2d19bc32&zip=78701&size=20+Yard&date=2026-09-04",
    "summary": {
      "serviceType": "Dumbster",
      "sizeOrVolume": "20 Yard",
      "zipCode": "78701",
      "estimatedPrice": 425,
      "deliveryDate": "2026-09-04"
    },
    "buttonText": "Continue to Instant Checkout"
  }
}
```

---

## 4. Zero Double-Entry Checkout Handoff (`ref_token`)

### 4.1 The Redirection Flow
When the user clicks `"Continue to Instant Checkout"`:
1. Browser navigates to `/book/:serviceType?ref_token=<TOKEN>`.
2. The checkout page extracts `ref_token` from URL parameters.
3. The checkout page immediately fetches prefilled booking data from the public hydration endpoint.

### 4.2 Checkout Hydration Endpoint

```http
GET /api/sales-agent/checkout-session/:token HTTP/1.1
Host: api.binsapp.ai
Accept: application/json
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "token": "4a92bc7801df42f88325a74e2d19bc32",
    "serviceType": "Dumbster",
    "sizeOrVolume": "20 Yard",
    "zipCode": "78701",
    "deliveryAddress": "1100 Congress Ave, Austin, TX 78701",
    "customerName": "John Doe",
    "customerPhone": "+15125550188",
    "customerEmail": "john@example.com",
    "deliveryDate": "2026-09-04",
    "notes": "Driveway placement, left side near garage.",
    "estimatedPrice": 425,
    "createdAt": "2026-09-02T14:40:00.000Z"
  }
}
```

#### Expired / Invalid Token Response (`404 Not Found`):
```json
{
  "success": false,
  "code": "CHECKOUT_SESSION_EXPIRED",
  "message": "Checkout session has expired or does not exist. Please restart booking."
}
```

#### Frontend Hydration Hook Example (React):
```typescript
// hooks/usePrefilledCheckout.ts
import { useEffect, useState } from "react";

export function usePrefilledCheckout() {
  const [loading, setLoading] = useState(false);
  const [prefilledData, setPrefilledData] = useState<any>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("ref_token");
    if (!token) return;

    setLoading(true);
    fetch(`https://api.binsapp.ai/api/sales-agent/checkout-session/${token}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          setPrefilledData(res.data);
        }
      })
      .catch((err) => console.error("Checkout hydration error:", err))
      .finally(() => setLoading(false));
  }, []);

  return { loading, prefilledData };
}
```

---

## 5. REST API Endpoints

### 5.1 Image / Photo Upload
* **Endpoint:** `POST https://api.binsapp.ai/api/upload-image`
* **Content-Type:** `multipart/form-data`
* **Form Field:** `image` (binary file)
* **Allowed Types:** `image/jpeg`, `image/png`, `image/webp`
* **Max Size:** 50MB
* **Response (`200 OK`):**
```json
{
  "file": "https://storage.googleapis.com/dumpster-df2b0.appspot.com/uploads/1775645696505.png"
}
```

---

### 5.2 Offline Callback & Lead Submission (Fallback)
Used if the WebSocket is disconnected or if the visitor prefers a phone callback during off-hours.

* **Endpoint:** `POST https://api.binsapp.ai/api/sales-agent/lead-capture`
* **Content-Type:** `application/json`
* **Request Body:**
```json
{
  "name": "Maria Garcia",
  "phone": "+15125550144",
  "email": "maria@example.com",
  "zipCode": "78704",
  "serviceType": "Tree Removal",
  "notes": "Large oak tree limb hanging over power lines.",
  "sessionId": "b4e85741-2c09-4819-bf93-90d45b736192"
}
```
* **Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Your request has been received. A specialist will call you shortly!",
  "data": {
    "leadId": "67c570b5569cf6e01a884c88"
  }
}
```

---

## 6. Edge Case Handling for Frontend

### 6.1 Mobile Responsive & Virtual Keyboard (`visualViewport`)
When the mobile virtual keyboard opens on iOS Safari or Android Chrome, standard CSS `100vh` can cause the message input field to be hidden behind the keyboard.

```typescript
// In ChatWidget.tsx
useEffect(() => {
  if (!window.visualViewport) return;

  const handleResize = () => {
    const currentHeight = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty("--chat-viewport-height", `${currentHeight}px`);
  };

  window.visualViewport.addEventListener("resize", handleResize);
  window.visualViewport.addEventListener("scroll", handleResize);
  return () => {
    window.visualViewport?.removeEventListener("resize", handleResize);
    window.visualViewport?.removeEventListener("scroll", handleResize);
  };
}, []);
```

```css
/* Widget container uses dynamic viewport variable */
.bins-sales-agent-modal-mobile {
  height: var(--chat-viewport-height, 100dvh);
  max-height: var(--chat-viewport-height, 100dvh);
}
```

### 6.2 Network Drop & Auto-Reconnection
1. If the socket drops, show a subtle yellow pill at the top of the chat: `"Connecting to live sales agent..."`.
2. When the socket triggers `connect`, automatically emit `sales:init_session` with `visitorSessionId`.
3. The backend returns the latest 10 messages from Redis, ensuring no dialogue turns are lost.

### 6.3 Rate Limiting Safeguards
If a user spams messages rapidly, the backend emits `sales:error` (`code: "RATE_LIMITED"`).
- Temporarily disable the message input and submit button for 3 seconds.
- Show an inline notification: `"Please wait a moment before sending another message."`

---

## 7. Frontend Integration Checklist

- [ ] Add `getOrCreateSessionId()` and persist UUID in `localStorage`.
- [ ] Connect to `https://api.binsapp.ai/sales-agent` with `auth: { sessionId }`.
- [ ] Emit `sales:init_session` on connect and restore dialogue state from `history`.
- [ ] Implement `sales:stream_token` string appender with Markdown rendering.
- [ ] Render action cards for `sizing_picker`, `quick_replies`, `checkout_link`, `media_upload`.
- [ ] Implement mobile placement offset (`bottom: 84px`) to prevent collision with sticky bottom CTA bars.
- [ ] Hook `/book/:serviceType` pages to extract `ref_token` and call `GET /api/sales-agent/checkout-session/:token` for zero double-entry form hydration.
- [ ] Implement `sales:handoff_initiated` and `sales:operator_message` live human operator takeover states.
- [ ] Wire `POST /api/upload-image` for project photo attachments.
- [ ] Wire `POST /api/sales-agent/lead-capture` for offline callback requests.
