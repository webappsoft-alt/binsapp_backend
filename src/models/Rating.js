import mongoose from 'mongoose';
const ratingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: false
  },
  to_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  review: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    required: true,
  },
  type: {
    type: String,
    default: 'rentee',
    enum: ['rentee', 'renter']
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
});

export default mongoose.model('Rating', ratingSchema);
