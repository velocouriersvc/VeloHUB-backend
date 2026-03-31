import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const apiToken = process.env.PRELUDE_API_KEY?.trim();
console.log(`Testing Prelude Key (RAW): ${apiToken?.substring(0, 8)}... (Length: ${apiToken?.length})`);

async function test() {
    try {
        console.log("Sending raw POST to https://api.prelude.dev/v2/verification...");
        const response = await axios.post('https://api.prelude.dev/v2/verification', 
            {
                target: {
                    type: "phone_number",
                    value: "+233550745627", 
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log("SUCCESS!", response.data);
    } catch (error: any) {
        console.error("FAILED!", error.response?.status, error.response?.data || error.message);
    }
}

test();
