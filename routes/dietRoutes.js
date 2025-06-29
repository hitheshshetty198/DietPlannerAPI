const express = require('express');
const router = express.Router();
const { generateDietPlan, saveDietPlan,updateDietPlan,deleteDietPlan } = require('../controllers/dietController');
const { authMiddleware } = require('../middleware/authMiddleware');




// Protect this route
router.post('/generate', generateDietPlan);
// Secure this route
router.post('/save', authMiddleware, saveDietPlan);
router.put('/update/:planId', authMiddleware, updateDietPlan);
router.delete('/delete/:planId', authMiddleware, deleteDietPlan);
module.exports = router;
