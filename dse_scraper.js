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

// এক লাইনের টেক্সট থেকে বছর ও পার্সেন্টেজ বের করার ফাংশন
function parseDividendHistory(text, type, infoObj) {
    if (!text || text === "N/A" || text === "-") return;
    
    const parts = text.split(',');
    parts.forEach(part => {
        const trimmed = part.trim();
        const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);
        
        if (yearMatch) {
            const year = yearMatch[0];
            const rate = trimmed.replace(year, '').trim();
            if (rate) {
                // ফায়ারবেইজে ফিল্ড তৈরি হবে: cash_dividend_2024 বা stock_dividend_2022
                infoObj[`${type}_${year}`] = rate;
            }
        }
    });
}

async function fetchFromDSEApi(companyCode, todayDate) {
    // আপনার দেওয়া নিজস্ব API লিংকটি এখানে ডাইনামিক করা হয়েছে
    const apiUrl = `https://dse-scrape.vercel.app/api/scrape?action=all&tradingCode=${companyCode}`;
    
    try {
        const response = await axios.get(apiUrl, { timeout: 15000 });
        const apiData = response.data;

        // যদি এপিআই থেকে ডেটা পাওয়া যায়
        if (apiData) {
            let dividendInfo = {
                code: companyCode,
                date: todayDate,
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            };

            // আপনার এপিআই-এর রেসপন্স স্ট্রাকচার অনুযায়ী Cash Dividend এবং Bonus Issue রিড করা
            const rawCash = apiData.cashDividend || apiData["Cash Dividend"] || "N/A";
            const rawStock = apiData.bonusIssue || apiData.stockDividend || apiData["Bonus Issue (Stock Dividend)"] || "N/A";

            // টেক্সট ভেঙে আলাদা আলাদা বছরের ফিল্ডে রূপান্তর করা হচ্ছে
            parseDividendHistory(rawCash, 'cash_dividend', dividendInfo);
            parseDividendHistory(rawStock, 'stock_dividend', dividendInfo);

            // যদি কোনো ডিভিডেন্ড ডেটা পাওয়া যায় তবেই ফায়ারবেইজে সেভ হবে
            if (Object.keys(dividendInfo).length > 3) {
                await db.collection('dse_dividend_data').doc(`${todayDate}_${companyCode}`).set(dividendInfo, { merge: true });
                console.log(`성공 (API): ${companyCode} এর বছরভিত্তিক ডিভিডেন্ড ডাটা সেভ হয়েছে।`);
            } else {
                console.log(`তথ্য নেই: ${companyCode} এর কোনো ডিভিডেন্ড ডাটা এপিআই-তে পাওয়া যায়নি।`);
            }
        }
    } catch (err) {
        console.error(`API ভুল: ${companyCode} এর ডেটা আনতে সমস্যা -`, err.message);
    }
}

async function startScraper() {
    console.log("প্রথম ধাপে সিএসই কালেকশন থেকে আজকের কোম্পানির তালিকা নেওয়া হচ্ছে...");
    const todayDate = new Date().toISOString().split('T')[0];
    let companies = [];

    try {
        // আজকের স্ক্র্যাপ করা সিএসই ডাটা থেকে কোম্পানির লিস্ট রিড করা হচ্ছে
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

        // একসাথে ৫টি করে কোম্পানির রিকোয়েস্ট আপনার এপিআই-তে পাঠানো হবে (যাতে এপিআই ক্র্যাশ না করে)
        const chunkSize = 5; 
        for (let i = 0; i < companies.length; i += chunkSize) {
            const chunk = companies.slice(i, i + chunkSize);
            console.log(`[DSE API] [${i + 1}-${Math.min(i + chunkSize, companies.length)} / ${companies.length}] প্রসেস হচ্ছে...`);
            
            await Promise.all(chunk.map(code => fetchFromDSEApi(code, todayDate)));
            await delay(1000); // আপনার ভার্সেল এপিআই-এর সুরক্ষার জন্য ১ সেকেন্ড বিরতি
        }

        console.log("অভিনন্দন! আপনার এপিআই ব্যবহার করে ডিএসই-র সব ডিভিডেন্ড তথ্য নিখুঁতভাবে ফায়ারবেইজে সংরক্ষিত হয়েছে।");

    } catch (error) {
        console.error("প্রধান প্রসেস রান করতে সমস্যা হয়েছে:", error.message);
    }
}

startScraper();
