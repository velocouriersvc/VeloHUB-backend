/**
 * Mock for src/db/data-source.ts
 *
 * AdminService calls AppDataSource.getRepository(...) for every repo at class
 * initialization time.  This stub returns a plain object so the constructor
 * doesn't throw; individual tests then replace the specific repo they need on
 * the service instance via `(svc as any).xRepo = mockRepo`.
 */
const stubRepo = () => ({
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((data: any) => data),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        withDeleted: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getMany: jest.fn().mockResolvedValue([]),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getCount: jest.fn().mockResolvedValue(0),
        addGroupBy: jest.fn().mockReturnThis(),
    })),
    softDelete: jest.fn(),
});

export const AppDataSource = {
    getRepository: jest.fn(() => stubRepo()),
};
