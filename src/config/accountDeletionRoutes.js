import User from "../models/User.js";
import { deleteUser } from "../modules/users/service.js";
import { deleteUserEmail } from "../utils/emailservice.js";

const publicApiBase = (req) => {
  const host = req.get("host") || "api.binsapp.ai";
  const protocol =
    req.get("x-forwarded-proto") || (req.secure ? "https" : "http");
  return `${protocol}://${host}`;
};

const deletionFormHtml = (error) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BINS APP — Account deletion</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root { --green: #22C55E; --black: #0F172A; --muted: #64748B; }
        body { font-family: Inter, sans-serif; background: #F8FAFC; margin: 0; padding: 24px; color: var(--black); }
        .card { max-width: 560px; margin: 40px auto; background: #fff; padding: 2rem; border-radius: 1rem;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.08); }
        h1 { font-size: 1.5rem; margin: 0 0 1rem; }
        p { color: var(--muted); line-height: 1.6; }
        label { display: block; font-weight: 600; margin-bottom: 0.5rem; }
        input[type="email"] { width: 100%; box-sizing: border-box; padding: 0.75rem; border: 1px solid #cbd5e1;
            border-radius: 0.5rem; margin-bottom: 1rem; font-size: 1rem; }
        button { width: 100%; padding: 0.875rem; background: var(--black); color: #fff; border: none;
            border-radius: 0.75rem; font-weight: 600; font-size: 1rem; cursor: pointer; }
        button:hover { background: var(--green); }
        .error { color: #dc2626; font-weight: 600; margin-bottom: 1rem; }
        .logo { font-weight: 800; margin-bottom: 1.5rem; }
        .logo span { color: var(--green); }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">Bins<span>App</span></div>
        <h1>Delete your account &amp; data</h1>
        <p>
            To permanently delete your BINS APP account and associated data, enter the email address on your account.
            We will email you a confirmation link. After you confirm, your account is deleted and cannot be restored.
        </p>
        <p>
            Phone-only accounts: email <a href="mailto:support@binsapp.ai">support@binsapp.ai</a> from the address
            linked to your account, or delete your account in the app under Profile.
        </p>
        ${error ? '<p class="error">Please enter a valid email address.</p>' : ""}
        <form action="/submit-email" method="post">
            <label for="email">Email on your account</label>
            <input type="email" id="email" name="email" required autocomplete="email">
            <button type="submit">Request deletion link</button>
        </form>
    </div>
</body>
</html>`;

const simpleMessageHtml = (title, body) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>body{font-family:Inter,sans-serif;background:#F8FAFC;padding:24px;color:#0F172A}
.card{max-width:560px;margin:40px auto;background:#fff;padding:2rem;border-radius:1rem}
p{line-height:1.6;color:#64748B}</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;

export function registerAccountDeletionRoutes(app) {
  app.get("/delete/users", (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(deletionFormHtml(req.query.error === "1"));
  });

  app.post("/submit-email", async (req, res) => {
    const raw = req.body?.email;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const lowerCaseEmail = String(raw || "")
      .toLowerCase()
      .trim();

    if (!lowerCaseEmail || !emailRegex.test(lowerCaseEmail)) {
      return res.redirect("/delete/users?error=1");
    }

    try {
      const findUser = await User.findOne({ email: lowerCaseEmail });

      if (!findUser) {
        return res
          .status(200)
          .send(
            simpleMessageHtml(
              "Account not found",
              `No account was found for <strong>${lowerCaseEmail}</strong>. Check the spelling or contact <a href="mailto:support@binsapp.ai">support@binsapp.ai</a>.`,
            ),
          );
      }

      if (findUser.status === "deleted") {
        return res
          .status(200)
          .send(
            simpleMessageHtml(
              "Already deleted",
              "This account has already been deleted. Contact support if you need help.",
            ),
          );
      }

      if (findUser.status === "deactivated") {
        return res
          .status(200)
          .send(
            simpleMessageHtml(
              "Account deactivated",
              "This account is deactivated. Contact <a href=\"mailto:support@binsapp.ai\">support@binsapp.ai</a> for assistance.",
            ),
          );
      }

      findUser.delete_request = true;
      await findUser.save();

      const deleteLink = `${publicApiBase(req)}/user/delete/${findUser._id}`;
      await deleteUserEmail(lowerCaseEmail, deleteLink);

      return res
        .status(200)
        .send(
          simpleMessageHtml(
            "Check your email",
            `We sent a confirmation link to <strong>${lowerCaseEmail}</strong>. Open that email and click the link to permanently delete your account.`,
          ),
        );
    } catch {
      return res
        .status(500)
        .send(
          simpleMessageHtml(
            "Something went wrong",
            "We could not process your request. Please try again later or email support@binsapp.ai.",
          ),
        );
    }
  });

  app.get("/user/delete/:id", async (req, res) => {
    try {
      const findUser = await User.findOne({
        _id: req.params.id,
        delete_request: true,
      });

      if (!findUser) {
        return res
          .status(200)
          .send(
            simpleMessageHtml(
              "Invalid or expired link",
              "This deletion link is invalid or has already been used.",
            ),
          );
      }

      if (findUser.status === "deleted" || findUser.status === "deactivated") {
        return res
          .status(200)
          .send(
            simpleMessageHtml(
              "Already deleted",
              "This account is no longer active.",
            ),
          );
      }

      await deleteUser(findUser._id.toString());

      return res
        .status(200)
        .send(
          simpleMessageHtml(
            "Account deleted",
            "Your BINS APP account and associated data have been deleted.",
          ),
        );
    } catch {
      return res
        .status(500)
        .send(
          simpleMessageHtml(
            "Something went wrong",
            "We could not delete your account. Please try again or contact support@binsapp.ai.",
          ),
        );
    }
  });
}
