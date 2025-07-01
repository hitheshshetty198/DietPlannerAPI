const Food = require("../models/Food");
const DietPlan = require('../models/SaveDietPlan');

// Helper to extract average amount per kg from range strings like "₹120–₹180/kg"
const parseAmountPerKg = (amountStr) => {
  if (!amountStr) return null;
  const nums = amountStr.match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const avg = nums.reduce((sum, n) => sum + parseInt(n), 0) / nums.length;
  return Math.round(avg);
};

// Map professions to activity multiplier
const activityMultipliers = {
  developer: 1.2,
  teacher: 1.4,
  athlete: 1.8,
  construction_worker: 1.7,
  student: 1.3
};

exports.generateDietPlan = async (req, res) => {
  try {
    const {
      age,
      gender,
      weight,
      height,
      health_issues,
      profession,
      goal,
      budget_per_month,
      duration_in_months,
      preference
    } = req.body;

    const heightInMeters = height / 100;
    const bmi = weight / (heightInMeters * heightInMeters);

    let bmiCategory = "normal";
    if (bmi < 18.5) bmiCategory = "underweight";
    else if (bmi > 25) bmiCategory = "overweight";

    // BMR base calculation
    let bmr = gender === "male"
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;

    const activityMultiplier = activityMultipliers[profession?.toLowerCase()] || 1.3;
    bmr *= activityMultiplier;

    if (goal === "weight_loss") bmr -= 500;
    if (goal === "weight_gain") bmr += 300;

    const daily_calories = Math.round(bmr);
    const total_days = duration_in_months * 30;

    // STEP 1: Query food items with full filters
    let query = {
      suitable_for: goal,
      type: preference,
      suitable_bmi: bmiCategory
    };
    if (health_issues?.length > 0) {
      query.health_tags = { $in: health_issues };
    }

    let foodItems = await Food.find(query);
    console.log(`🎯 Strict match: ${foodItems.length} items`);

    // STEP 2: If no food found, relax filters
    if (foodItems.length === 0) {
      delete query.suitable_bmi;
      foodItems = await Food.find(query);
      console.log(`🔁 Relaxed (no BMI): ${foodItems.length} items`);
    }

    if (foodItems.length === 0) {
      query = { type: preference };
      foodItems = await Food.find(query);
      console.log(`⚠️ Fallback match: ${foodItems.length} items`);
    }

    // Still no items → return error
    if (foodItems.length === 0) {
      return res.status(404).json({
        error: "No food items match your preferences. Please adjust input or update the food database."
      });
    }

    // STEP 3: Group by meal_time
    const meals = { breakfast: [], lunch: [], dinner: [] };
    foodItems.forEach(food => {
      if (meals[food.meal_time]) meals[food.meal_time].push(food);
    });

    const fetchFallbackMeal = async (meal_time) => {
      return await Food.findOne({ meal_time, type: preference }) || null;
    };

    const breakfast = meals.breakfast[0] || await fetchFallbackMeal("breakfast");
    const lunch = meals.lunch[0] || await fetchFallbackMeal("lunch");
    const dinner = meals.dinner[0] || await fetchFallbackMeal("dinner");

    // STEP 4: Estimate grams + cost
    const estimateGramsAndCost = (food, requiredCalories) => {
      if (!food?.calories_per_100g || !food.amount_per_kg) {
        return { grams: 0, cost: 0 };
      }
      const calPerGram = food.calories_per_100g / 100;
      const gramsNeeded = Math.ceil(requiredCalories / calPerGram);
      const kgNeeded = gramsNeeded / 1000;
      const pricePerKg = parseAmountPerKg(food.amount_per_kg);
      if (!pricePerKg) return { grams: gramsNeeded, cost: null };
      const cost = Math.ceil(pricePerKg * kgNeeded);
      return { grams: gramsNeeded, cost };
    };

    const perMealCalories = Math.floor(daily_calories / 3);
    const breakfastStats = estimateGramsAndCost(breakfast, perMealCalories);
    const lunchStats = estimateGramsAndCost(lunch, perMealCalories);
    const dinnerStats = estimateGramsAndCost(dinner, perMealCalories);

    const totalGramsPerDay = breakfastStats.grams + lunchStats.grams + dinnerStats.grams;
    const totalCostPerDay =
      (breakfastStats.cost || 0) +
      (lunchStats.cost || 0) +
      (dinnerStats.cost || 0);

    const totalCostPerMonth = totalCostPerDay * 30;

    // STEP 5: Budget check
   // STEP 5: Budget check
let budgetMessage = null;
let plan = null;

if (budget_per_month < totalCostPerMonth) {
  budgetMessage = `Your current budget may be too low to meet your nutritional needs. Please consider increasing your budget to ₹${totalCostPerMonth}.`;
} 
else {
  const savings = budget_per_month - totalCostPerMonth;
  budgetMessage = `You're within budget! You will save ₹${savings} this month.`;

   // Build detailed plan with consumption_in_grams
  plan = [];
  for (let i = 0; i < total_days; i++) {
    const dailyBreakfast = meals.breakfast.length > 0
      ? meals.breakfast[i % meals.breakfast.length]
      : await fetchFallbackMeal("breakfast");

    const dailyLunch = meals.lunch.length > 0
      ? meals.lunch[i % meals.lunch.length]
      : await fetchFallbackMeal("lunch");

    const dailyDinner = meals.dinner.length > 0
      ? meals.dinner[i % meals.dinner.length]
      : await fetchFallbackMeal("dinner");

    const breakfastStats = estimateGramsAndCost(dailyBreakfast, perMealCalories);
    const lunchStats = estimateGramsAndCost(dailyLunch, perMealCalories);
    const dinnerStats = estimateGramsAndCost(dailyDinner, perMealCalories);

    plan.push({
      day: i + 1,
      breakfast: dailyBreakfast ? {
        ...(dailyBreakfast.toObject?.() || dailyBreakfast),
        consumption_in_grams: breakfastStats.grams
      } : null,
      lunch: dailyLunch ? {
        ...(dailyLunch.toObject?.() || dailyLunch),
        consumption_in_grams: lunchStats.grams
      } : null,
      dinner: dailyDinner ? {
        ...(dailyDinner.toObject?.() || dailyDinner),
        consumption_in_grams: dinnerStats.grams
      } : null
    });
  }

}


    // STEP 6: Response
    res.json({
      daily_calorie_goal: daily_calories,
      total_days,
      total_food_required_per_day_in_grams: totalGramsPerDay,
      estimated_daily_cost_in_rupees: totalCostPerDay || null,
      estimated_monthly_cost_in_rupees: totalCostPerMonth || null,
      budget_message: budgetMessage,
      ...(plan && { plan })
    });

  } catch (error) {
    console.error("❌ Error generating plan:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.saveDietPlan = async (req, res) => {
  try {
  const userId = req.userId; // From token in middleware

    // Destructure both user input and plan output
    const {
      age,
      gender,
      weight,
      height,
      health_issues,
      profession,
      goal,
      budget_per_month,
      duration_in_months,
      preference,
      daily_calorie_goal,
      total_days,
      total_food_required_per_day_in_grams,
      estimated_daily_cost_in_rupees,
      estimated_monthly_cost_in_rupees,
      budget_message,
      plan
    } = req.body;

    // Create new document
    const newDietPlan = new DietPlan({
      userId,
      input: {
        age,
        gender,
        weight,
        height,
        health_issues,
        profession,
        goal,
        budget_per_month,
        duration_in_months,
        preference
      },
      plan: {
        daily_calorie_goal,
        total_days,
        total_food_required_per_day_in_grams,
        estimated_daily_cost_in_rupees,
        estimated_monthly_cost_in_rupees,
        budget_message,
        plan
      }
    });

    const savedPlan = await newDietPlan.save();

    res.status(201).json({
      message: '✅ Diet plan saved successfully',
      savedPlan
    });
  } catch (error) {
    console.error('❌ Error saving diet plan:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

async function buildPlanFromInput(input) {
  try {
    const {
      age, gender, weight, height, health_issues,
      profession, goal, budget_per_month, duration_in_months, preference
    } = input;

    const heightInMeters = height / 100;
    const bmi = weight / (heightInMeters * heightInMeters);
    let bmiCategory = "normal";
    if (bmi < 18.5) bmiCategory = "underweight";
    else if (bmi > 25) bmiCategory = "overweight";

    let bmr = gender === "male"
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;

    const activityMultiplier = activityMultipliers[profession?.toLowerCase()] || 1.3;
    bmr *= activityMultiplier;

    if (goal === "weight_loss") bmr -= 500;
    if (goal === "weight_gain") bmr += 300;

    const daily_calories = Math.round(bmr);
    const total_days = duration_in_months * 30;

    let query = {
      suitable_for: goal,
      type: preference,
      suitable_bmi: bmiCategory
    };

    if (health_issues?.length > 0) {
      query.health_tags = { $in: health_issues };
    }

    let foodItems = await Food.find(query);
    if (foodItems.length === 0) {
      delete query.suitable_bmi;
      foodItems = await Food.find(query);
    }
    if (foodItems.length === 0) {
      query = { type: preference };
      foodItems = await Food.find(query);
    }
    if (foodItems.length === 0) return null;

    const meals = { breakfast: [], lunch: [], dinner: [] };
    foodItems.forEach(food => {
      if (meals[food.meal_time]) meals[food.meal_time].push(food);
    });

    const fetchFallbackMeal = async (meal_time) => {
      return await Food.findOne({ meal_time, type: preference }) || null;
    };

    const breakfast = meals.breakfast[0] || await fetchFallbackMeal("breakfast");
    const lunch = meals.lunch[0] || await fetchFallbackMeal("lunch");
    const dinner = meals.dinner[0] || await fetchFallbackMeal("dinner");

    const estimateGramsAndCost = (food, requiredCalories) => {
      if (!food?.calories_per_100g || !food.amount_per_kg) {
        return { grams: 0, cost: 0 };
      }
      const calPerGram = food.calories_per_100g / 100;
      const gramsNeeded = Math.ceil(requiredCalories / calPerGram);
      const kgNeeded = gramsNeeded / 1000;
      const pricePerKg = parseAmountPerKg(food.amount_per_kg);
      if (!pricePerKg) return { grams: gramsNeeded, cost: null };
      const cost = Math.ceil(pricePerKg * kgNeeded);
      return { grams: gramsNeeded, cost };
    };

    const perMealCalories = Math.floor(daily_calories / 3);
    const breakfastStats = estimateGramsAndCost(breakfast, perMealCalories);
    const lunchStats = estimateGramsAndCost(lunch, perMealCalories);
    const dinnerStats = estimateGramsAndCost(dinner, perMealCalories);

    const totalGramsPerDay = breakfastStats.grams + lunchStats.grams + dinnerStats.grams;
    const totalCostPerDay = (breakfastStats.cost || 0) + (lunchStats.cost || 0) + (dinnerStats.cost || 0);
    const totalCostPerMonth = totalCostPerDay * 30;

    let budgetMessage = null;
    let plan = [];

    if (budget_per_month < totalCostPerMonth) {
      return {
        error: `Your current budget may be too low to meet your nutritional needs. Please consider increasing your budget to ₹${totalCostPerMonth}.`
      }; } 
    else {
  const savings = budget_per_month - totalCostPerMonth;
  budgetMessage = `You're within budget! You will save ₹${savings} this month.`;

   // Build detailed plan with consumption_in_grams
  plan = [];
  for (let i = 0; i < total_days; i++) {
    const dailyBreakfast = meals.breakfast.length > 0
      ? meals.breakfast[i % meals.breakfast.length]
      : await fetchFallbackMeal("breakfast");

    const dailyLunch = meals.lunch.length > 0
      ? meals.lunch[i % meals.lunch.length]
      : await fetchFallbackMeal("lunch");

    const dailyDinner = meals.dinner.length > 0
      ? meals.dinner[i % meals.dinner.length]
      : await fetchFallbackMeal("dinner");

    const breakfastStats = estimateGramsAndCost(dailyBreakfast, perMealCalories);
    const lunchStats = estimateGramsAndCost(dailyLunch, perMealCalories);
    const dinnerStats = estimateGramsAndCost(dailyDinner, perMealCalories);

    plan.push({
      day: i + 1,
      breakfast: dailyBreakfast ? {
        ...(dailyBreakfast.toObject?.() || dailyBreakfast),
        consumption_in_grams: breakfastStats.grams
      } : null,
      lunch: dailyLunch ? {
        ...(dailyLunch.toObject?.() || dailyLunch),
        consumption_in_grams: lunchStats.grams
      } : null,
      dinner: dailyDinner ? {
        ...(dailyDinner.toObject?.() || dailyDinner),
        consumption_in_grams: dinnerStats.grams
      } : null
    });
  }

}
  
  
    return {
      daily_calorie_goal: daily_calories,
      total_days,
      total_food_required_per_day_in_grams: totalGramsPerDay,
      estimated_daily_cost_in_rupees: totalCostPerDay || null,
      estimated_monthly_cost_in_rupees: totalCostPerMonth || null,
      budget_message: budgetMessage,
      plan
    };

  } catch (error) {
    console.error("Error building plan:", error);
    return null;
  }
}


exports.updateDietPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const userId = req.userId;
    const input = req.body;

    // Step 1: Validate existence
    const existingPlan = await DietPlan.findOne({ _id: planId, userId });
    if (!existingPlan) return res.status(404).json({ error: 'Plan not found or unauthorized' });

    // Step 2: Generate updated plan from updated input
    const planOutput = await buildPlanFromInput(input);

    
    if (!planOutput || planOutput.error) {
  return res.status(400).json({ error: planOutput.error });
    }

    // Step 3: Update document
    existingPlan.input = input;
    existingPlan.plan = planOutput;

    await existingPlan.save();

    res.json({ message: '✅ Plan updated successfully', updatedPlan: existingPlan });

  } catch (error) {
    console.error('❌ Error updating plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.deleteDietPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const userId = req.userId; // assuming extracted via auth middleware

    const deletedPlan = await DietPlan.findOneAndDelete({ _id: planId, userId });

    if (!deletedPlan) {
      return res.status(404).json({ error: 'Diet plan not found or unauthorized' });
    }

    res.json({ message: '✅ Diet plan deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting diet plan:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getSavedDietPlans = async (req, res) => {
  try {
    const userId = req.userId;
    const plans = await DietPlan.find({ userId });

    res.json({
      message: '📦 Fetched saved diet plans successfully',
      plans
    });
  } catch (error) {
    console.error('❌ Error fetching saved diet plans:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


