import { Schema, model } from "mongoose";


const transactionSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    order: {
        type: Schema.Types.ObjectId,
        ref: 'Order',
    },
    amount: {
        type: Number,
        default: 0,
    },
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true,
    },
    stripePaymentIntentId: {
        type: String,
    },
    metadata: {
        type: Schema.Types.Mixed,
        default: {},
    },
}, {
    timestamps: true,
});
const TransactionModel = model("Transaction", transactionSchema);
export default TransactionModel;