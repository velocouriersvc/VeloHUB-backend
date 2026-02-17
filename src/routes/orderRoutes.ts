import { Router } from "express";
import { OrderController } from "../controllers/OrderController";

const router = Router();
const orderController = new OrderController();

router.get("/", orderController.getAll);
router.get("/:id", orderController.getOne);
router.post("/", orderController.create);
router.put("/:id", orderController.update);
router.delete("/:id", orderController.delete);

export default router;
