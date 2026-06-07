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
    console.log("DSE স্ক্রাপার: ফায়ারবেইজ সফলভাবে ইনিশিয়ালাইজ হয়েছে।");
} catch (initError) {
    console.error("DSE স্ক্রাপার: ফায়ারবেইজ ইনিশিয়ালাইজেশন এরর:", initError.message);
    process.exit(1);
}

const db = admin.firestore();
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ১. DSEX ইনডেক্স ভ্যালু স্ক্র্যাপ করার জন্য নতুন ও ডেডিকেটেড সোর্স ফাংশন
async function scrapeDSEIndices(todayDate) {
    console.log("DSE নির্দিষ্ট পেজ থেকে ইনডেক্স ভ্যালু (DSEX) সংগ্রহ করা হচ্ছে...");
    // এই পেজটি শুধুমাত্র ইনডেক্স ডাটা দেখানোর জন্য ডেডিকেটেড
    const indexUrl = "https://dsebd.org/dseX_share.php";
    
    try {
        const { data } = await axios.get(indexUrl, {
            httpsAgent: httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        
        // ডিএসই-র ইনডেক্স টেবিলের ডাটা রো রিড করা হচ্ছে
        $('table tr').each((index, element) => {
            const cols = $(element).find('td');
            
            if (cols.length >= 4) {
                let indexName = $(cols[0]).text().trim().replace(/[/\\.#$/[\]]/g, "-");
                let value = $(cols[1]).text().trim();
                let change = $(cols[2]).text().trim();
                let changePercent = $(cols[3]).text().trim();

                // ক্লীনআপ এবং নাম ফিল্টারিং
                if (indexName.includes('DSEX') || indexName.includes('DSES') || indexName.includes('D30')) {
                    
                    if (indexName.includes('DSEX')) indexName = 'DSEX';
                    if (indexName.includes('DSES')) indexName = 'DSES';
                    if (indexName.includes('D30')) indexName = 'D30';

                    // ফায়ারবেইজের কালেকশনে অবজেক্ট তৈরি
                    const indexInfo = {
                        index_name: indexName,
                        date: todayDate,
                        value: value,
                        change: change,
                        change_percent: changePercent,
                        updated_at: admin.firestore.FieldValue.serverTimestamp()
                    };

                    // ফায়ারবেইজে ফোর্স রাইট (set with merge) করা হচ্ছে
                    db.collection('dse_index_data').doc(`${todayDate}_${indexName}`).set(indexInfo, { merge: true });
                    console.log(`-> সফলভাবে ইন্ডেক্স ডাটাবেজে যুক্ত হয়েছে: ${indexName} = ${value}`);
                }
            }
        });

    } catch (err) {
        console.error("DSEX ইনডেক্স পেজ স্ক্র্যাপ করতে সমস্যা হয়েছে, তবে মূল প্রসেস সচল থাকবে। এরর:", err.message);
    }
}

// ডিভিডেন্ড টেক্সট স্প্লিট করার হেল্পার ফাংশন
function parseDividendHistory(text, type, infoObj) {
    if (!text || text === "N/A" || text === "-" || typeof text !== 'string') return;
    
    const parts = text.split(',');
    parts.forEach(part => {
        const trimmed = part.trim();
        const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);
        
        if (yearMatch) {
            const year = yearMatch[0];
            const rate = trimmed.replace(year, '').trim();
            if (rate) {
                infoObj[`${type}_${year}`] = rate;
            }
        }
    });
}

// ২. আপনার এপিআই থেকে কোম্পানির ডিভিডেন্ড আনার ফাংশন
async function fetchFromDSEApi(companyCode, todayDate) {
    const apiUrl = `https://dse-scrape.vercel.app/api/scrape?action=all&tradingCode=${companyCode}`;
    
    try {
        const response = await axios.get(apiUrl, { timeout: 15000 });
        
        if (response.data && response.data.success && response.data.data && response.data.data.details) {
            const details = response.data.data.details;

            let dividendInfo = {
                code: companyCode,
                date: todayDate,
                listing_year: details.listingYear || "N/A",
                share_category: details.shareCategory || "N/A",
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            };

            const rawCash = details.cashDividend || "N/A";
            const rawStock = details.stockDividend || "N/A";

            parseDividendHistory(rawCash, 'cash_dividend', dividendInfo);
            parseDividendHistory(rawStock, 'stock_dividend', dividendInfo);

            await db.collection('dse_dividend_data').doc(`${todayDate}_${companyCode}`).set(dividendInfo, { merge: true });
        }
    } catch (err) {
        // লগের সাইজ কমানোর জন্য এরর শুধু কনসোলে রাখা হলো
    }
}

// ৩. কোড এক্সিকিউশনের প্রধান ফাংশน
async function startScraper() {
    const todayDate = new Date().toISOString().split('T')[0];
    
    // কোম্পানি ডিভিডেন্ড রান করার আগে ইনডেক্স স্ক্র্যাপার রান হবে
    await scrapeDSEIndices(todayDate);
    await delay(2000); 

    console.log("দ্বিতীয় ধাপে সিএসই কালেকশন থেকে আজকের কোম্পানির তালিকা নেওয়া হচ্ছে...");
    let companies = [];

    try {
        const snapshot = await db.collection('cse_detailed_data').where('date', '==', todayDate).get();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.code) {
                companies.push(data.code);
            }
        });

        if (companies.length === 0) {
            console.log("আজকের সিএসই তালিকা পাওয়া যায়নি। ব্যাকআপ লিস্ট ব্যবহার করা হচ্ছে...");
            companies = ["UTTARABANK", "BDTHAI", "ACI", "BEXIMCO", "BATBC", "GP", "LHBL", "SQURPHARMA"];
        }

        console.log(`মোট ${companies.length}টি কোম্পানির ডিভিডেন্ড ডাটা আপনার API থেকে আনা শুরু হচ্ছে...`);

        const chunkSize = 5; 
        for (let i = 0; i < companies.length; i += chunkSize) {
            const chunk = companies.slice(i, i + chunkSize);
            await Promise.all(chunk.map(code => fetchFromDSEApi(code, todayDate)));
            await delay(500); 
        }

        console.log("অভিনন্দন! DSEX ভ্যালু এবং সমস্ত কোম্পানির ডিভিডেন্ড তথ্য সফলভাবে ফায়ারবেইজে সংরক্ষিত হয়েছে।");

    } catch (error) {
        console.error("প্রধান প্রসেস রান করতে সমস্যা হয়েছে:", error.message);
    }
}

startScraper();
