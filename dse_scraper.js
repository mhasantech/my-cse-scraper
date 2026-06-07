const axios = require('axios');
const admin = require('firebase-admin');

try {
    const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const decodedKey = Buffer.from(base64Key, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(decodedKey);

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    console.log("DSE API স্ক্রাপার: ফায়ারবেইজ সফলভাবে ইনিশিয়ালাইজ হয়েছে।");
} catch (initError) {
    console.error("DSE API স্ক্রাপার: ফায়ারবেইজ ইনিশিয়ালাইজেশন এরর:", initError.message);
    process.exit(1);
}

const db = admin.firestore();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// এক লাইনের টেক্সট (যেমন: "17.50% 2024, 14% 2022") ভেঙে বছরভিত্তিক আলাদা ফিল্ড করার ফাংশন
function parseDividendHistory(text, type, infoObj) {
    if (!text || text === "N/A" || text === "-" || typeof text !== 'string') return;
    
    const parts = text.split(',');
    parts.forEach(part => {
        const trimmed = part.trim();
        // চার ডিজিটের বছর বের করার লজিক (যেমন: 2024, 2023)
        const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);
        
        if (yearMatch) {
            const year = yearMatch[0];
            // বছর বাদে বাকি অংশটুকু হলো পার্সেন্টেজ বা রেট (যেমন: 17.50%)
            const rate = trimmed.replace(year, '').trim();
            if (rate) {
                infoObj[`${type}_${year}`] = rate;
            }
        }
    });
}

async function fetchFromDSEApi(companyCode, todayDate) {
    const apiUrl = `https://dse-scrape.vercel.app/api/scrape?action=all&tradingCode=${companyCode}`;
    
    try {
        const response = await axios.get(apiUrl, { timeout: 15000 });
        
        // আপনার এপিআই স্ট্রাকচার অনুযায়ী response.data.data.details রিড করা হচ্ছে
        if (response.data && response.data.success && response.data.data && response.data.data.details) {
            const details = response.data.data.details;

            let dividendInfo = {
                code: companyCode,
                date: todayDate,
                listing_year: details.listingYear || "N/A",
                share_category: details.shareCategory || "N/A",
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            };

            // এপিআই-এর নির্দিষ্ট cashDividend এবং stockDividend ফিল্ড নেওয়া হচ্ছে
            const rawCash = details.cashDividend || "N/A";
            const rawStock = details.stockDividend || "N/A";

            // টেক্সট ভেঙে বছরভিত্তিক আলাদা ফিল্ডে রূপান্তর করা হচ্ছে
            parseDividendHistory(rawCash, 'cash_dividend', dividendInfo);
            parseDividendHistory(rawStock, 'stock_dividend', dividendInfo);

            // ফায়ারবেইজের 'dse_dividend_data' কালেকশনে ডকুমেন্ট মার্জ করা হচ্ছে
            await db.collection('dse_dividend_data').doc(`${todayDate}_${companyCode}`).set(dividendInfo, { merge: true });
            console.log(`성공 (DSE API): ${companyCode} -> ক্যাশ ও স্টক ডিভিডেন্ড আলাদা করে সেভ করা হয়েছে।`);
            
        } else {
            console.log(`তথ্য মেলেনি: ${companyCode} এর সঠিক ডিটেইলস অবজেক্ট আপনার এপিআই-তে পাওয়া যায়নি।`);
        }
    } catch (err) {
        console.error(`API ভুল: ${companyCode} এর ডেটা রিড করতে সমস্যা -`, err.message);
    }
}

async function startScraper() {
    console.log("প্রথম ধাপে সিএসই কালেকশন থেকে আজকের কোম্পানির তালিকা নেওয়া হচ্ছে...");
    const todayDate = new Date().toISOString().split('T')[0];
    let companies = [];

    try {
        const snapshot = await db.collection('cse_detailed_data').where('date', '==', todayDate).get();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.code) {
                companies.push(data.code);
            }
        });

        // ব্যাকআপ তালিকা (যদি সিএসই কালেকশন কোনো কারণে ফাঁকা থাকে)
        if (companies.length === 0) {
            console.log("আজকের সিএসই তালিকা পাওয়া যায়নি। ব্যাকআপ লিস্ট ব্যবহার করা হচ্ছে...");
            companies = ["UTTARABANK", "BDTHAI", "ACI", "BEXIMCO", "BATBC", "GP", "LHBL", "SQURPHARMA"];
        }

        console.log(`মোট ${companies.length}টি কোম্পানির ডিভিডেন্ড ডাটা আপনার API থেকে আনা শুরু হচ্ছে...`);

        // একসাথে ৫টি করে কোম্পানির রিকোয়েস্ট পাঠানো হচ্ছে
        const chunkSize = 5; 
        for (let i = 0; i < companies.length; i += chunkSize) {
            const chunk = companies.slice(i, i + chunkSize);
            console.log(`[DSE API] [${i + 1}-${Math.min(i + chunkSize, companies.length)} / ${companies.length}] প্রসেস হচ্ছে...`);
            
            await Promise.all(chunk.map(code => fetchFromDSEApi(code, todayDate)));
            await delay(1000); // ভার্সেল সার্ভার সুরক্ষার জন্য ১ সেকেন্ড বিরতি
        }

        console.log("অভিনন্দন! আপনার নিজস্ব এপিআই ব্যবহার করে ডিএসই-র সব ডিভিডেন্ড তথ্য নিখুঁতভাবে ফায়ারবেইজে সংরক্ষিত হয়েছে।");

    } catch (error) {
        console.error("প্রধান প্রসেস রান করতে সমস্যা হয়েছে:", error.message);
    }
}

startScraper();
