import { Router } from "express";
import { AdminController } from "../controllers/AdminController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const adminController = new AdminController();

// All admin routes require API Key and Admin Role
router.use(apiKeyMiddleware);
const adminRole = requireRole(["admin"]);

router.get("/drivers", adminRole, adminController.getDrivers);
router.get("/merchants", adminRole, adminController.getMerchants);
router.get("/rides", adminRole, adminController.getRides);
router.get("/users", adminRole, adminController.getUsers);
router.patch("/drivers/:id", adminRole, adminController.updateDriverStatus);
router.patch("/merchants/:id", adminRole, adminController.updateMerchantStatus);

export default router;
