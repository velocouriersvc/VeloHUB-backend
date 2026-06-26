
import { inferCountryFromPhone } from "./utils/phone";
import { getCountryName } from "./utils/country";

const testCases = [
    { phone: "+17327637793", expected: "United States" },
    { phone: "+2347065703529", expected: "Nigeria" },
    { phone: "+233245359098", expected: "Ghana" },
    { phone: "0245359098", expected: "Ghana" },
    { phone: "18483863189", expected: "United States" },
    { phone: "+441234567890", expected: "United Kingdom" },
];

console.log("--- Testing Country Inference ---");
testCases.forEach(({ phone, expected }) => {
    const code = inferCountryFromPhone(phone);
    const name = getCountryName(code || "GH");
    console.log(`Phone: ${phone} -> Code: ${code} -> Name: ${name} (Expected: ${expected})`);
    if (name !== expected) {
        console.error(`FAILED: Expected ${expected} but got ${name}`);
    }
});

console.log("\n--- Testing Name Fallbacks ---");
const mockUsers = [
    { 
        email: "test@example.com", 
        buyerProfile: { fullName: "Buyer Name" } 
    },
    { 
        email: "merchant@example.com", 
        merchantProfile: { businessName: "Merchant Shop" } 
    },
    { 
        email: "driver@example.com", 
        driverProfile: { fullName: "Driver Name" } 
    },
    { 
        email: "no_profile@example.com" 
    }
];

function extractNames(u: any) {
    const fullName = u.buyerProfile?.fullName || u.merchantProfile?.businessName || u.driverProfile?.fullName || u.email?.split("@")[0] || "Unknown";
    const names = fullName.split(" ");
    const firstName = names[0] || "";
    const lastName = names.slice(1).join(" ") || "";
    return { firstName, lastName, fullName };
}

mockUsers.forEach(u => {
    const { firstName, lastName, fullName } = extractNames(u);
    console.log(`Email: ${u.email} -> Full: ${fullName}, First: ${firstName}, Last: ${lastName}`);
});
