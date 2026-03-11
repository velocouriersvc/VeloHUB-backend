import axios from 'axios';

const API_BASE_URL = 'http://localhost:3008/api/v1'; // Port from .env
const API_KEY = '12345';
const ADMIN_PHONE = '+233200000000'; // We will ensure this user exists and has admin role

async function testAdminAPI() {
    console.log('--- Testing Admin API ---');

    const client = axios.create({
        baseURL: API_BASE_URL,
        headers: {
            'x-api-key': API_KEY,
            'x-user-phone': ADMIN_PHONE,
        },
    });

    try {
        console.log('1. Testing GET /admin/drivers...');
        const driversRes = await client.get('/admin/drivers');
        console.log(`   Success! Found ${driversRes.data.length} drivers.`);

        console.log('2. Testing GET /admin/merchants...');
        const merchantsRes = await client.get('/admin/merchants');
        console.log(`   Success! Found ${merchantsRes.data.length} merchants.`);

        console.log('3. Testing GET /admin/rides...');
        const ridesRes = await client.get('/admin/rides');
        console.log(`   Success! Found ${ridesRes.data.length} rides.`);

        console.log('4. Testing GET /admin/users...');
        const usersRes = await client.get('/admin/users');
        console.log(`   Success! Found ${usersRes.data.length} users.`);

        if (driversRes.data.length > 0) {
            const driver = driversRes.data[0];
            console.log(`5. Testing PATCH /admin/drivers/${driver.id}...`);
            const patchRes = await client.patch(`/admin/drivers/${driver.id}`, { status: 'suspended' });
            console.log(`   Success! Status updated to ${patchRes.data.status}.`);
        }

    } catch (error: any) {
        console.error('API Test Failed:');
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data:`, JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(`   Error: ${error.message}`);
        }
    }
}

testAdminAPI();
