const mongoose = require("mongoose");

const foodSchema = new mongoose.Schema({
  name: String,
  type: String, // veg/non-veg
  meal_time: String, // breakfast, lunch, dinner
  calories_per_100g: Number,
  protein: Number,
  fat: Number,
  carbs: Number,
  suitable_for: [String], // weight_loss, weight_gain
  health_tags: [String], // diabetic_friendly, heart
  amount_per_kg: String,
  image: String
});

module.exports = mongoose.model("Food", foodSchema);
