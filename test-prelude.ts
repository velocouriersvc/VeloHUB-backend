import Prelude from "@prelude.so/sdk";
import dotenv from "dotenv";
dotenv.config();

const apiToken = process.env.PRELUDE_API_KEY?.trim();
console.log(`Testing Prelude Key: ${apiToken?.substring(0, 8)}... (Length: ${apiToken?.length})`);

// Explicitly setting baseURL to v2 as per documentation
const client = new Prelude({ 
    apiToken: apiToken || '',
    baseURL: 'https://api.prelude.dev/v2'
});

async function test() {
    try {
        console.log("Sending verification to +233550745627...");
        const verification = await client.verification.create({
            target: {
                type: "phone_number",
                value: "+233550745627", 
            },
        });
        console.log("SUCCESS!", verification);
    } catch (error) {
        console.error("FAILED!", (error as any).message || error);
        if ((error as any).response) {
            console.error("Response details:", (error as any).response.data);
        }
    }
}

test();
