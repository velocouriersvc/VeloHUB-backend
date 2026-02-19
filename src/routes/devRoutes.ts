
import { Router } from "express";
import { DevController } from "../controllers/DevController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";

const router = Router();
const devController = new DevController();

// Apply API Key Middleware? 
// Yes, let's keep it consistent. User can enter it in the UI.
router.use(apiKeyMiddleware);

router.get("/db-data", devController.getAllData);

export default router;
