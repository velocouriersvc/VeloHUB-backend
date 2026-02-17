import { Router } from "express";
import { ProfileController } from "../controllers/ProfileController";

const router = Router();
const profileController = new ProfileController();

router.get("/", profileController.getAll);
router.get("/:id", profileController.getOne);
router.post("/", profileController.create);
router.put("/:id", profileController.update);
router.delete("/:id", profileController.delete);

export default router;
