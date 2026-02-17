import { Orders } from "../Model/Orders";
import { BaseController } from "./BaseController";

export class OrderController extends BaseController<Orders> {
    constructor() {
        super(Orders);
    }
}
