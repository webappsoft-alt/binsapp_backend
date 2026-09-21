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
    const account = await paymentController.createAccount(user);
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
    <title>Loading...</title>
    <style>
        body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f0f0f0;
            font-family: Arial, sans-serif;
        }

        .loader {
            border: 8px solid #f3f3f3; /* Light grey */
            border-top: 8px solid #3498db; /* Blue */
            border-radius: 50%;
            width: 60px;
            height: 60px;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .loading-text {
            margin-top: 20px;
            font-size: 1.2em;
            color: #555;
        }
    </style>
</head>
<body>

    <div class="loader"></div>
    <div class="loading-text">Loading, please wait...</div>

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