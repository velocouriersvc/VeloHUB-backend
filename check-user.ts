import { AppDataSource } from './src/db/data-source';
import { User } from './src/models/user';

async function checkUser() {
    await AppDataSource.initialize();
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { phoneNumber: '+23300000001' } });
    console.log('User found:', user);
    await AppDataSource.destroy();
}

checkUser().catch(console.error);
