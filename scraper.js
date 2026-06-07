const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');
const https = require('https');

try {
    const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const decodedKey = Buffer.from(base64Key, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(decodedKey);

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    console.log("ফায়ারবেইজ অ্যাডমিন সফলভাবে ইনিশিয়ালাইজ হয়েছে।");
} catch (initError) {
    console.error("ফায়ারবেইজ ইনিশিয়ালাইজ করতে সমস্যা হয়েছে।", initError.message);
    process.exit(1);
}

const db = admin.firestore();
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// বিরতি বা ডিলের জন্য একটি হেল্পার ফাংশন
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeSingleCompany(companyCode, todayDate) {
    const detailUrl = `https://www.cse.com.bd/index.php?/company/companydetails/${companyCode}`;
    try {
        const { data } = await axios.get(detailUrl, {
            httpsAgent: httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(data);
        
        // এখানে পেজের ভেতর থেকে সুনির্দিষ্ট তথ্য খোঁজা হচ্ছে
        // সিএসই-র কোম্পানি ডিটেইলস পেজের স্ট্রাকচার অনুযায়ী এই টেবিল ডেটা নেওয়া
        let companyInfo = {
            code: companyCode,
            date: todayDate,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        // পেজের ভেতরের বিভিন্ন টেবিল থেকে তথ্য বের করার লজিক
        $('table.table tr').each((i, el) => {
            const label = $(el).find('td').eq(0).text().trim().toLowerCase();
            const value = $(el).find('td').eq(1).text().trim();

            if (label.includes('market category') || label.includes('category')) {
                companyInfo.category = value;
            } else if (label.includes('p/e') || label.includes('pe ratio')) {
                companyInfo.pe_ratio = value;
            } else if (label.includes('authorized capital')) {
                companyInfo.authorized_capital = value;
            } else if (label.includes('paid up capital')) {
                companyInfo.paid_up_capital = value;
            }
        });

        // ফায়ারবেইজের 'cse_detailed_data' নামক নতুন কালেকশনে সেভ হবে
        await db.collection('cse_detailed_data').doc(`${todayDate}_${companyCode}`).set(companyInfo, { merge: true });
        console.log(`성공: ${companyCode} এর বিস্তারিত তথ্য সেভ হয়েছে।`);

    } catch (err) {
        console.error(`ভুল হয়েছে ${companyCode} স্ক্র্যাপ করতে:`, err.message);
    }
}

async function startScraper() {
    console.log("প্রথম ধাপে কারেন্ট মার্কেট থেকে কোম্পানির তালিকা আনা হচ্ছে...");
    const listUrl = "https://www.cse.com.bd/market/current_price"; 
    const todayDate = new Date().toISOString().split('T')[0];

    try {
        const { data } = await axios.get(listUrl, {
            httpsAgent: httpsAgent,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const $ = cheerio.load(data);
        let companies = [];

        // টেবিল থেকে কোম্পানির কোডগুলো (যেমন: BDTHAI) খুঁজে বের করা
        $('table tr').each((index, element) => {
            if (index === 0) return;
            const cols = $(element).find('td');
            if (cols.length >= 2) {
                const companyCode = $(cols[1]).text().trim().replace(/[/\\.#$/[\]]/g, "-");
                if (companyCode && companyCode !== "" && !companies.includes(companyCode)) {
                    companies.push(companyCode);
                }
            }
        });

        console.log(`মোট ${companies.length}টি কোম্পানি পাওয়া গেছে। এবার বিস্তারিত তথ্য স্ক্র্যাপ করা শুরু হচ্ছে...`);

        // লুপ চালিয়ে প্রতিটি কোম্পানির লিংকে আলাদাভাবে ঢোকা
        for (let i = 0; i < companies.length; i++) {
            console.log(`[${i + 1}/${companies.length}] ${companies[i]} এর পেজে ঢোকা হচ্ছে...`);
            
            await scrapeSingleCompany(companies[i], todayDate);
            
            // সিএসই সার্ভার যেন ব্লক না করে, সেজন্য প্রতি পেজের মাঝে ২ সেকেন্ড (২০০০ মিলিসেকেন্ড) অপেক্ষা করা
            await delay(2000); 
        }

        console.log("অভিনন্দন! সব কোম্পানির বিস্তারিত তথ্য স্ক্র্যাপ করা শেষ হয়েছে।");

    } catch (error) {
        console.error("প্রধান তালিকা স্ক্র্যাপ করতে সমস্যা হয়েছে:", error.message);
    }
}

startScraper();
