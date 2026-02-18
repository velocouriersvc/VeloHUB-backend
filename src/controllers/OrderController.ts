import { Orders } from "../old-models/Orders";
import { BaseController } from "./BaseController";

export class OrderController extends BaseController<Orders> {
    constructor() {
        super(Orders);
    }
}
