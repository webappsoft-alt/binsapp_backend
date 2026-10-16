import PaymentService from "./service.js";

const paymentController = new PaymentService();

export const createPaymentController = async (req, res, next) => {
  try {
    const user = req.user._id;
    const payment = await paymentController.createPayment(user, req.body);
    res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};

export const createAccountController = async (req, res, next) => {
  try {
    const user = req.user._id;
    const returnUrl =
      req.query?.returnUrl ||
      req.query?.return_url ||
      req.query?.redirectUrl ||
      req.body?.returnUrl ||
      req.body?.return_url;
    const account = await paymentController.createAccount(user, { returnUrl });
    res.status(201).json({
      success: true,
      message: "Account created successfully",
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyAccountController = async (req, res, next) => {
  try {
    const user = req.user._id;
    const { accountId } = req.query;
    const account = await paymentController.verifyAccount(user, accountId);
    res.status(201).json({
      success: true,
      message: "Account verified successfully",
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

export const redirectCallbackController = async (req, res, next) => {
  try {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connecting Stripe...</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background-color: #f8fafc;
            color: #0f172a;
        }
        .spinner {
            width: 44px;
            height: 44px;
            border: 4px solid #e2e8f0;
            border-top-color: #11ba41;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-bottom: 16px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="spinner"></div>
    <div style="font-size: 15px; font-weight: 600;">Stripe Connected! Closing window...</div>
    <script>
        (function() {
            var params = new URLSearchParams(window.location.search);
            var accountId = params.get('account_id') || params.get('accountId');
            if (!accountId) {
                var m = window.location.href.match(/acct_[A-Za-z0-9]+/);
                if (m) accountId = m[0];
            }
            var msg = {
                type: 'binsapp_stripe_connect_complete',
                accountId: accountId || ''
            };
            if (window.opener && !window.opener.closed) {
                try {
                    window.opener.postMessage(msg, '*');
                } catch(e) {}
                setTimeout(function() {
                    window.close();
                }, 200);
            } else {
                setTimeout(function() {
                    window.location.href = '/renter/wallet';
                }, 800);
            }
        })();
    </script>
</body>
</html>
`);
  } catch (error) {
    next(error);
  }
};


export const createTransactionController = async (req, res, next) => {
  try {
    const user = req.user._id;
    const transaction = await paymentController.createTransaction(user, req.body);
    res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};


export const getTransactionsController = async (req, res, next) => {
  try {
    const user = req.user._id;
    const { page, limit, type, beforeDate, afterDate } = req.query;
    const query = {
      user,
    }
    if (type) {
      query.type = type;
    }
    if (beforeDate) {
      query.createdAt = { $lte: new Date(beforeDate) };
    }
    if (afterDate) {
      query.createdAt = { $gte: new Date(afterDate) };
    }
    const transactions = await paymentController.getTransactions(query, { page, limit });
    res.status(200).json({
      success: true,
      message: "Transactions fetched successfully",
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};


export const createTopUpPaymentController = async (req, res, next) => {
  try {
    const user = req.user._id;
    const payment = await paymentController.createTopUpPayment(user, req.body);
    res.status(201).json({
      success: true,
      message: "TopUp Payment created successfully",
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};