/**
 * Owner Simulator — play the dumpster-owner side from your laptop while you
 * book from the frontend as a customer. Lets you test the full Uber-style
 * dispatch + accept/reject flow end-to-end with a single device.
 *
 * It connects to the SAME socket server your frontend talks to, authenticates
 * as an owner account, and prints every dispatch event with timestamps so you
 * can watch tier waves arrive. You then accept/reject interactively.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 *
 *   # Login as an owner using a static OTP phone (code 1234), connect to prod:
 *   node scripts/owner-simulator.js --phone +923117384180 --server https://api.binsapp.ai
 *
 *   # Or paste an existing owner access token (from the owner app / devtools):
 *   node scripts/owner-simulator.js --token <ACCESS_TOKEN> --server https://api.binsapp.ai
 *
 *   # Guarantee a match: create/ensure a verified active dustbin for this owner
 *   # at the exact coordinates you will book from:
 *   node scripts/owner-simulator.js --phone +923117384180 --server https://api.binsapp.ai \
 *        --setup --lng 73.1003262 --lat 31.400529 --dumpster 6749c191d35fc34208d6cb7a
 *
 * INTERACTIVE COMMANDS (type in the terminal once connected):
 *   accept [dustbinId]  Accept the latest received request (auto-picks a matching dustbin)
 *   reject              Reject the latest received request
 *   dustbins            List this owner's dustbins
 *   orders              List pending orders where this owner is a candidate
 *   online / offline    Set this owner's status in the DB (matching needs "online")
 *   setup --lng L --lat A [--dumpster ID] [--radius 40]   Ensure a test dustbin near coords
 *   whoami              Show owner id / name / status
 *   help                Show commands
 *   quit                Set offline and exit
 * ---------------------------------------------------------------------------
 */
import dotenv from "dotenv";
import readline from "readline";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import http from "http";
import https from "https";
import { io as ioClient } from "socket.io-client";

dotenv.config();

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

function ts() {
  return new Date().toISOString().slice(11, 23);
}
function log(color, ...args) {
  console.log(`${COLORS.gray}[${ts()}]${COLORS.reset} ${color}`, ...args, COLORS.reset);
}
function info(...a) { log(COLORS.cyan, ...a); }
function ok(...a) { log(COLORS.green, ...a); }
function warn(...a) { log(COLORS.yellow, ...a); }
function err(...a) { log(COLORS.red, ...a); }

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[name] = true;
    } else {
      args[name] = next;
      i += 1;
    }
  }
  return args;
}

function httpJson(url, { method = "GET", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request(
      u,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "BinsApp-OwnerSimulator/1.0",
          ...headers,
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let parsed;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            parsed = { raw: data };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function loginWithPhone(server, phone) {
  info(`Requesting OTP for ${phone} ...`);
  const send = await httpJson(`${server}/api/auth/send-otp`, {
    method: "POST",
    body: { phone },
  });
  if (send.status !== 200 || !send.body?.token) {
    throw new Error(
      `send-otp failed (${send.status}): ${JSON.stringify(send.body)}`,
    );
  }
  const code = send.body.code || "1234";
  info(`OTP token received. Verifying with code ${code} ...`);
  const verify = await httpJson(`${server}/api/auth/verify-otp`, {
    method: "POST",
    body: { code, token: send.body.token },
  });
  const accessToken = verify.body?.tokens?.accessToken;
  if (verify.status !== 200 || !accessToken) {
    throw new Error(
      `verify-otp failed (${verify.status}): ${JSON.stringify(verify.body)}`,
    );
  }
  ok(`Logged in as ${verify.body.user?.name || phone} (${verify.body.user?._id})`);
  return { accessToken, user: verify.body.user };
}

function decodeUserId(token) {
  try {
    const decoded = jwt.decode(token);
    return decoded?._id || null;
  } catch {
    return null;
  }
}

let Dustbin = null;
let User = null;
let dbReady = false;

async function ensureDb() {
  if (dbReady) return true;
  if (!process.env.MONGODB_URI) {
    warn("MONGODB_URI not set — DB commands (online/offline/dustbins/setup) disabled.");
    return false;
  }
  await mongoose.connect(process.env.MONGODB_URI);
  Dustbin = (await import("../src/models/Dustbin.js")).default;
  User = (await import("../src/models/User.js")).default;
  dbReady = true;
  return true;
}

async function setOwnerStatus(ownerId, status) {
  if (!(await ensureDb())) return;
  await User.updateOne({ _id: ownerId }, { $set: { status } });
  ok(`Owner status set to "${status}" in DB.`);
}

async function listDustbins(ownerId) {
  if (!(await ensureDb())) return [];
  const bins = await Dustbin.find({ user: ownerId }).lean();
  if (!bins.length) {
    warn("This owner has no dustbins.");
    return [];
  }
  info(`Owner has ${bins.length} dustbin(s):`);
  for (const b of bins) {
    const coords = b.location?.coordinates || b.locationObject?.coordinates || [];
    console.log(
      `  ${COLORS.bold}${b._id}${COLORS.reset} | dumpster=${b.dumbster} | verify=${b.verify} | status=${b.status} | qty=${b.availableQuantity ?? "(unset)"} | radius=${b.radius ?? 40} | coords=[${coords.join(", ")}]`,
    );
  }
  return bins;
}

async function ensureTestDustbin(ownerId, { lng, lat, dumpster, radius }) {
  if (!(await ensureDb())) return null;
  if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) {
    err("setup needs --lng and --lat.");
    return null;
  }
  const coords = [Number(lng), Number(lat)];
  const query = { user: ownerId };
  if (dumpster) query.dumbster = new mongoose.Types.ObjectId(dumpster);

  const update = {
    user: ownerId,
    verify: true,
    status: "active",
    availableQuantity: 5,
    quantity: 5,
    radius: Number(radius) || 40,
    location: { type: "Point", coordinates: coords },
    locationObject: {
      type: "Point",
      coordinates: coords,
      city: "Test City",
      country: "Test",
      address: "Owner simulator test dustbin",
    },
  };
  if (dumpster) update.dumbster = new mongoose.Types.ObjectId(dumpster);

  const existing = await Dustbin.findOne(query);
  let bin;
  if (existing) {
    Object.assign(existing, update);
    bin = await existing.save();
    ok(`Updated existing test dustbin ${bin._id} at [${coords.join(", ")}].`);
  } else {
    bin = await Dustbin.create(update);
    ok(`Created test dustbin ${bin._id} at [${coords.join(", ")}].`);
  }
  return bin;
}

async function pickDustbinForOrder(ownerId, order) {
  if (!(await ensureDb())) return null;
  const dumpsterId =
    order?.dumbster?._id?.toString() ||
    order?.dumbster?.toString() ||
    null;

  const base = { user: ownerId, verify: true, status: "active" };
  let bin = null;
  if (dumpsterId) {
    bin = await Dustbin.findOne({
      ...base,
      dumbster: new mongoose.Types.ObjectId(dumpsterId),
    }).lean();
  }
  if (!bin) bin = await Dustbin.findOne(base).lean();
  return bin?._id?.toString() || null;
}

async function main() {
  const args = parseArgs(process.argv);
  const server = (args.server || "http://localhost:8000").replace(/\/$/, "");

  let accessToken = args.token;
  let ownerId = args.owner || null;

  if (!accessToken) {
    if (!args.phone) {
      err("Provide --phone <staticOtpPhone> or --token <accessToken>.");
      process.exit(1);
    }
    const res = await loginWithPhone(server, String(args.phone));
    accessToken = res.accessToken;
    ownerId = res.user?._id || ownerId;
  }
  if (!ownerId) ownerId = decodeUserId(accessToken);
  if (!ownerId) {
    err("Could not determine owner id. Pass --owner <userId>.");
    process.exit(1);
  }

  info(`Owner id: ${ownerId}`);
  info(`Server:   ${server}`);

  // Bring owner online so matching + dispatch include them.
  await setOwnerStatus(ownerId, "online").catch((e) => warn("status set failed:", e.message));

  if (args.setup) {
    await ensureTestDustbin(ownerId, {
      lng: args.lng,
      lat: args.lat,
      dumpster: args.dumpster,
      radius: args.radius,
    });
  }
  await listDustbins(ownerId).catch(() => {});

  const socket = ioClient(server, {
    auth: { token: accessToken },
    transports: ["websocket", "polling"],
    reconnection: true,
  });

  const state = { lastOrder: null, lastRequestId: null };

  socket.on("connect", () => ok(`Socket connected (id=${socket.id}). Waiting for requests...`));
  socket.on("connect_error", (e) => err("connect_error:", e.message));
  socket.on("disconnect", (r) => warn("Socket disconnected:", r));

  const captureRequest = (label) => (payload) => {
    const order = payload?.order || payload?.request || payload?.orderId || null;
    const reqId = order?._id?.toString() || null;
    state.lastOrder = order;
    state.lastRequestId = reqId;
    console.log("");
    ok(`>>> ${label}`);
    console.log(
      `    ${COLORS.bold}orderId:${COLORS.reset} ${reqId}` +
        `  ${COLORS.bold}service:${COLORS.reset} ${order?.service_type}` +
        `  ${COLORS.bold}price:${COLORS.reset} ${order?.price}` +
        `  ${COLORS.bold}tier:${COLORS.reset} ${payload?.dispatchTier ?? "-"}`,
    );
    console.log(
      `    ${COLORS.bold}dates:${COLORS.reset} ${order?.start_date} -> ${order?.end_date}` +
        `  ${COLORS.bold}qty:${COLORS.reset} ${order?.quantity}` +
        `  ${COLORS.bold}dumpster:${COLORS.reset} ${order?.dumbster?._id || order?.dumbster}`,
    );
    warn(`    Type "accept" to take it, or "reject" to decline.`);
  };

  socket.on("receive-request-renter", captureRequest("NEW REQUEST (dispatch wave)"));
  socket.on("cancel-order-renter", (p) =>
    warn(`Order cancelled/expired: ${p?.order?._id} — ${p?.message || ""}`),
  );
  socket.on("update-request-renter", (p) =>
    info(`update-request-renter: ${p?.message || ""} (order ${p?.order?._id})`),
  );
  socket.on("accept-order-renter", (p) =>
    info(`accept-order-renter: ${p?.message || ""}`),
  );
  socket.on("admin-noti", () => {});
  socket.on("force_disconnect", (p) => err("Force disconnect:", p?.reason));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "owner> " });
  rl.prompt();

  const doAccept = async (dustbinArg) => {
    if (!state.lastRequestId) return err("No request received yet.");
    let dustbinId = dustbinArg || (await pickDustbinForOrder(ownerId, state.lastOrder));
    if (!dustbinId) return err("No matching dustbin found for this owner. Run `setup` or `dustbins`.");
    info(`Accepting order ${state.lastRequestId} with dustbin ${dustbinId} ...`);
    socket.emit(
      "update-request-renter",
      { requestId: state.lastRequestId, status: "accepted", dustbin: dustbinId },
      (resp) => {
        if (resp?.success) ok(`ACCEPTED: ${resp.message}`);
        else err(`Accept failed: ${resp?.message}`);
        rl.prompt();
      },
    );
  };

  const doReject = () => {
    if (!state.lastRequestId) return err("No request received yet.");
    info(`Rejecting order ${state.lastRequestId} ...`);
    socket.emit(
      "update-request-renter",
      { requestId: state.lastRequestId, status: "rejected" },
      (resp) => {
        if (resp?.success) ok(`REJECTED: ${resp.message}`);
        else err(`Reject failed: ${resp?.message}`);
        rl.prompt();
      },
    );
  };

  rl.on("line", async (line) => {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    try {
      switch (cmd) {
        case "":
          break;
        case "accept":
          await doAccept(rest[0]);
          return;
        case "reject":
          doReject();
          return;
        case "dustbins":
          await listDustbins(ownerId);
          break;
        case "online":
          await setOwnerStatus(ownerId, "online");
          break;
        case "offline":
          await setOwnerStatus(ownerId, "offline");
          break;
        case "setup": {
          const sub = parseArgs(["", "", ...rest]);
          await ensureTestDustbin(ownerId, {
            lng: sub.lng,
            lat: sub.lat,
            dumpster: sub.dumpster,
            radius: sub.radius,
          });
          break;
        }
        case "whoami":
          info(`Owner ${ownerId} | last order: ${state.lastRequestId || "none"}`);
          break;
        case "help":
          console.log(`Commands: accept [dustbinId], reject, dustbins, orders, online, offline, setup --lng --lat [--dumpster], whoami, quit`);
          break;
        case "quit":
        case "exit":
          await setOwnerStatus(ownerId, "offline").catch(() => {});
          socket.close();
          if (dbReady) await mongoose.disconnect();
          rl.close();
          process.exit(0);
          break;
        default:
          warn(`Unknown command "${cmd}". Type "help".`);
      }
    } catch (e) {
      err("Command error:", e.message);
    }
    rl.prompt();
  });

  process.on("SIGINT", async () => {
    warn("\nShutting down, setting owner offline...");
    await setOwnerStatus(ownerId, "offline").catch(() => {});
    socket.close();
    if (dbReady) await mongoose.disconnect();
    process.exit(0);
  });
}

main().catch((e) => {
  err(e.stack || e.message);
  process.exit(1);
});
