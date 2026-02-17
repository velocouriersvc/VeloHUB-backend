import { Request, Response } from "express";
import { EntityTarget, Repository, ObjectLiteral } from "typeorm";
import { AppDataSource } from "../db/data-source";

export abstract class BaseController<T extends ObjectLiteral> {
    protected repository: Repository<T>;

    constructor(entity: EntityTarget<T>) {
        this.repository = AppDataSource.getRepository(entity);
    }

    getAll = async (req: Request, res: Response) => {
        try {
            const items = await this.repository.find();
            res.json(items);
        } catch (error) {
            res.status(500).json({ message: "Error fetching items", error });
        }
    };

    getOne = async (req: Request, res: Response) => {
        try {
            const id = req.params.id as any;
            const item = await this.repository.findOneBy({ id } as any);
            if (!item) {
                return res.status(404).json({ message: "Item not found" });
            }
            res.json(item);
        } catch (error) {
            res.status(500).json({ message: "Error fetching item", error });
        }
    };

    create = async (req: Request, res: Response) => {
        try {
            const newItem = this.repository.create(req.body);
            const savedItem = await this.repository.save(newItem);
            res.status(201).json(savedItem);
        } catch (error) {
            res.status(500).json({ message: "Error creating item", error });
        }
    };

    update = async (req: Request, res: Response) => {
        try {
            const id = req.params.id as any;
            const itemToUpdate = await this.repository.findOneBy({ id } as any);
            if (!itemToUpdate) {
                return res.status(404).json({ message: "Item not found" });
            }
            this.repository.merge(itemToUpdate, req.body);
            const updatedItem = await this.repository.save(itemToUpdate);
            res.json(updatedItem);
        } catch (error) {
            res.status(500).json({ message: "Error updating item", error });
        }
    };

    delete = async (req: Request, res: Response) => {
        try {
            const id = req.params.id as any;
            const result = await this.repository.delete(id);
            if (result.affected === 0) {
                return res.status(404).json({ message: "Item not found" });
            }
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ message: "Error deleting item", error });
        }
    };
}
