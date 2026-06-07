const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');
const https = require('https');

// ফায়ারবেইজ অলরেডি অন্য ফাইলে ইনিশিয়ালাইজ হয়ে থাকলেও যেন এরর না দেয়
try {
    const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const decodedKey = Buffer.from(base64Key, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(decodedKey);

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    console.log("DSE স্ক্রাপার: ফায়ারবেইজ সফলভাবে ইনিশিয়ালাইজ হয়েছে।");
} catch (initError) {
    console.error("DSE স্ক্রাপার: ফায়ারবেইজ ইনিশিয়ালাইজেশন এরর:", initError.message);
    process.exit(1);
}

const db = admin.firestore();
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// প্রতিটি কোম্পানির ডিটেইলস পেজ থেকে ডিভিডেন্ড স্ক্র্যাপ করার ফাংশন
async function scrapeDSESingle(companyCode, todayDate) {
    // ডিএসই-র কোম্পানি ডিটেইলস পেজের লিংক
    const detailUrl = `https://www.dsebd.org/displayCompany.php?name=${companyCode}`;
    try {
        const { data } = await axios.get(detailUrl, {
            httpsAgent: httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(data);
        
        let dseInfo = {
            code: companyCode,
            date: todayDate,
            cash_dividend: "N/A",
            stock_dividend: "N/A",
            dividend_year: "N/A",
            record_date: "N/A",
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        // ডিএসই ওয়েবসাইটের "Dividend History" বা "Financial Performance" টেবিল খোঁজা
        $('#company div, table').find('tr').each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 2) {
                const label = $(cols[0]).text().trim().toLowerCase();
                const value = $(cols[1]).text().trim();

                // ডিভিডেন্ড এবং রেকর্ড ডেটের তথ্য ফিল্টার করা হচ্ছে
                if (label.includes('dividend') && label.includes('cash')) {
                    dseInfo.cash_dividend = value;
                } else if (label.includes('dividend') && label.includes('bonus/stock')) {
                    dseInfo.stock_dividend = value;
                } else if (label.includes('dividend year')) {
                    dseInfo.dividend_year = value;
                } else if (label.includes('record date')) {
                    dseInfo.record_date = value;
                }
            }
        });

        // ফায়ারবেইজের 'dse_dividend_data' নামক নতুন কালেকশনে সেভ হবে
        await db.collection('dse_dividend_data').doc(`${todayDate}_${companyCode}`).set(dseInfo, { merge: true });
        console.log(`성공 (DSE): ${companyCode} -> Dividend Year: ${dseInfo.dividend_year}, Record Date: ${dseInfo.record_date}`);

    } catch (err) {
        console.error(`DSE ভুল: ${companyCode} স্ক্র্যাপ করতে সমস্যা -`, err.message);
    }
}

async function startDSEScraper() {
    console.log("DSE কোম্পানির তালিকা সংগ্রহ করা হচ্ছে...");
    const listUrl = "https://www.dsebd.org/latest_share_price_All.php"; 
    const todayDate = new Date().toISOString().split('T')[0];

    try {
        const { data } = await axios.get(listUrl, {
            httpsAgent: httpsAgent,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const $ = cheerio.load(data);
        let companies = [];

        // ডিএসই-র মেইন প্রাইস টেবিল থেকে ট্রেডিং কোড (যেমন: BDTHAI) সংগ্রহ করা
        $('.table-responsive table tr').each((index, element) => {
            const cols = $(element).find('td');
            if (cols.length >= 2) {
                // ডিএসই টেবিলে সাধারণত ২ নম্বর কলামে কোম্পানির কোড লিংক আকারে থাকে
                const companyCode = $(cols[1]).find('a').text().trim().replace(/[/\\.#$/[\]]/g, "-");
                if (companyCode && companyCode !== "" && !companies.includes(companyCode)) {
                    companies.push(companyCode);
                }
            }
        });

        console.log(`DSE-তে মোট ${companies.length}টি কোম্পানি পাওয়া গেছে। ডিভিডেন্ড স্ক্র্যাপিং শুরু হচ্ছে...`);

        // একসাথে ১০টি করে কোম্পানির ডেটা প্যারালালে প্রসেস করা হচ্ছে (Chunking)
        const chunkSize = 10; 
        for (let i = 0; i < companies.length; i += chunkSize) {
            const chunk = companies.slice(i, i + chunkSize);
            console.log(`[DSE] [${i + 1}-${Math.min(i + chunkSize, companies.length)} / ${companies.length}] কোম্পানিগুলো প্রসেস হচ্ছে...`);
            
            await Promise.all(chunk.map(code => scrapeDSESingle(code, todayDate)));
            await delay(500); // ডিএসই সার্ভার সুরক্ষার জন্য ০.৫ সেকেন্ড বিরতি
        }

        console.log("অভিনন্দন! ডিএসই-র সব কোম্পানির ডিভিডেন্ড তথ্য ফায়ারবেইজে সেভ হয়েছে।");

    } catch (error) {
        console.error("DSE প্রধান তালিকা স্ক্র্যাপ করতে সমস্যা হয়েছে:", error.message);
    }
}

startDSEScraper();
