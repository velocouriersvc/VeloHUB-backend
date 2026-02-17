import { Profiles } from "../Model/Profiles";
import { BaseController } from "./BaseController";

export class ProfileController extends BaseController<Profiles> {
    constructor() {
        super(Profiles);
    }
}
