import axios from 'axios';

const PROD_API_URL = 'https://api.velocouriersvc.com/api/v1';
const API_KEY = 'your-api-key-here'; // From .env
const ADMIN_PHONE = '+233200000000'; // Standard admin phone for sync

const rawCountries = `
British Indian Ocean Territory (IO)
Brunei Darussalam (BN)
Burkina Faso (BF)
Burundi (BI)
Cabo Verde (CV)
Cambodia (KH)
Cameroon (CM)
Cayman Islands (KY)
Central African Republic (CF)
Chad (TD)
Chile (CL)
China (CN)
Christmas Island (CX)
Cocos (Keeling) Islands (CC)
Colombia (CO)
Comoros (KM)
Congo (CG)
Congo, Democratic Republic of the (CD)
Cook Islands (CK)
Costa Rica (CR)
Côte d'Ivoire (CI)
Cuba (CU)
Curaçao (CW)
Djibouti (DJ)
Dominica (DM)
Dominican Republic (DO)
Ecuador (EC)
Egypt (EG)
El Salvador (SV)
Equatorial Guinea (GQ)
Eritrea (ER)
Eswatini (SZ)
Ethiopia (ET)
Falkland Islands (Malvinas) (FK)
Faroe Islands (FO)
Fiji (FJ)
French Guiana (GF)
French Polynesia (PF)
French Southern Territories (TF)
Gabon (GA)
Gambia (GM)
Georgia (GE)
Gibraltar (GI)
Greenland (GL)
Grenada (GD)
Guadeloupe (GP)
Guam (GU)
Guatemala (GT)
Guernsey (GG)
Guinea (GN)
Guinea-Bissau (GW)
Guyana (GY)
Haiti (HT)
Heard Island and McDonald Islands (HM)
Holy See (Vatican City) (VA)
Honduras (HN)
Hong Kong (HK)
Iceland (IS)
India (IN)
Indonesia (ID)
Iran (IR)
Iraq (IQ)
Isle of Man (IM)
Israel (IL)
Jamaica (JM)
Japan (JP)
Jersey (JE)
Jordan (JO)
Kazakhstan (KZ)
Kiribati (KI)
Korea, Democratic People's Republic of (KP)
Korea, Republic of (KR)
Kuwait (KW)
Kyrgyzstan (KG)
Lao People's Democratic Republic (LA)
Lebanon (LB)
Lesotho (LS)
Liberia (LR)
Libya (LY)
Liechtenstein (LI)
Macao (MO)
Madagascar (MG)
Malawi (MW)
Malaysia (MY)
Maldives (MV)
Mali (ML)
Marshall Islands (MH)
Martinique (MQ)
Mauritania (MR)
Mauritius (MU)
Mayotte (YT)
Mexico (MX)
Micronesia (Federated States of) (FM)
Moldova (MD)
Monaco (MC)
Mongolia (MN)
Montenegro (ME)
Montserrat (MS)
Morocco (MA)
Mozambique (MZ)
Myanmar (MM)
Namibia (NA)
Nauru (NR)
Nepal (NP)
New Caledonia (NC)
New Zealand (NZ)
Nicaragua (NI)
Niger (NE)
North Macedonia (MK)
Norway (NO)
Oman (OM)
Pakistan (PK)
Palau (PW)
Palestine, State of (PS)
Papua New Guinea (PG)
Paraguay (PY)
Peru (PE)
Philippines (PH)
Pitcairn (PN)
Puerto Rico (PR)
Qatar (QA)
Réunion (RE)
Russian Federation (RU)
Rwanda (RW)
Saint Barthélemy (BL)
Saint Helena, Ascension and Tristan da Cunha (SH)
Saint Kitts and Nevis (KN)
Saint Lucia (LC)
Saint Martin (French part) (MF)
Saint Pierre and Miquelon (PM)
Saint Vincent and the Grenadines (VC)
Samoa (WS)
San Marino (SM)
Sao Tome and Principe (ST)
Saudi Arabia (SA)
Serbia (RS)
Seychelles (SC)
Sierra Leone (SL)
Singapore (SG)
Sint Maarten (Dutch part) (SX)
Solomon Islands (SB)
Somalia (SO)
South Georgia and the South Sandwich Islands (GS)
South Sudan (SS)
Sri Lanka (LK)
Sudan (SD)
Suriname (SR)
Svalbard and Jan Mayen (SJ)
Switzerland (CH)
Syrian Arab Republic (SY)
Taiwan (Province of China) (TW)
Tajikistan (TJ)
Thailand (TH)
Timor-Leste (TL)
Tokelau (TK)
Tonga (TO)
Trinidad and Tobago (TT)
Tunisia (TN)
Türkiye (TR)
Turkmenistan (TM)
Turks and Caicos Islands (TC)
Tuvalu (TV)
Uganda (UG)
Ukraine (UA)
United Arab Emirates (AE)
United Kingdom (GB)
United States Minor Outlying Islands (UM)
Uruguay (UY)
Uzbekistan (UZ)
Vanuatu (VU)
Venezuela (VE)
Viet Nam (VN)
Virgin Islands (British) (VG)
Virgin Islands (U.S.) (VI)
Wallis and Futuna (WF)
Western Sahara (EH)
Yemen (YE)
Zambia (ZM)
Zimbabwe (ZW)
`;

async function sync() {
    const lines = rawCountries.split("\n").filter(l => l.trim().length > 0);
    const client = axios.create({
        baseURL: PROD_API_URL,
        headers: {
            'x-api-key': API_KEY,
            'x-user-phone': ADMIN_PHONE,
            'Content-Type': 'application/json'
        }
    });

    console.log(`Ensuring admin user ${ADMIN_PHONE} exists on production...`);
    try {
        await axios.post(`${PROD_API_URL}/setup/create-admin`, {
            phoneNumber: ADMIN_PHONE,
            fullName: "System Admin (Sync)",
            email: "admin@velo.com"
        }, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log("Admin user ready.");
    } catch (error: any) {
        console.error("Failed to ensure admin user. Sync might fail if not already admin.", error.response?.data || error.message);
    }

    console.log(`Starting sync of ${lines.length} countries to production...`);

    for (const line of lines) {
        const match = line.match(/(.+)\s\(([A-Z]{2,4})\)/);
        if (match) {
            const name = match[1].trim();
            const code = match[2];

            try {
                // First check if it exists (assuming GET /waitlist/countries returns all)
                // Actually, the API might not support efficient existence checks, so we might just try to POST
                // and handle the "already exists" error.
                await client.post('/waitlist/countries', { name, code, isActive: true, phoneNumber: ADMIN_PHONE });
                console.log(`Successfully added: ${name} (${code})`);
            } catch (error: any) {
                if (error.response?.data?.message?.includes('already exists')) {
                    console.log(`Skipped: ${name} (${code}) - already exists`);
                } else {
                    console.error(`Error adding ${name} (${code}):`, error.response?.data || error.message);
                }
            }
        }
    }

    console.log("Production sync complete.");
}

sync().catch(console.error);
