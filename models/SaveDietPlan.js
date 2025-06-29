// models/DietPlan.js
const mongoose = require('mongoose');

const DietPlanSchema = new mongoose.Schema({
 userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  input: {
    age: Number,
    gender: String,
    weight: Number,
    height: Number,
    health_issues: [String],
    profession: String,
    goal: String,
    budget_per_month: Number,
    duration_in_months: Number,
    preference: String
  },
  plan: {
    daily_calorie_goal: Number,
    total_days: Number,
    total_food_required_per_day_in_grams: Number,
    estimated_daily_cost_in_rupees: Number,
    estimated_monthly_cost_in_rupees: Number,
    budget_message: String,
    plan: [Object] // array of day-wise plans
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('SavedPlan', DietPlanSchema);
