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

// এক লাইনের টেক্সট থেকে বছর ও ডিভিডেন্ডের হার আলাদা করার হেল্পার ফাংশন
function parseDividendHistory(text, type, infoObj) {
    if (!text || text === "N/A" || text === "-") return;
    
    // কমা (,) দিয়ে আলাদা করা (যেমন: "7% 2022" এবং "13% 2021")
    const parts = text.split(',');
    
    parts.forEach(part => {
        const trimmed = part.trim();
        // চার ডিজিটের বছর খোঁজা (যেমন: 2022, 2021)
        const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);
        
        if (yearMatch) {
            const year = yearMatch[0];
            // বছর বাদে বাকি অংশটুকু হলো ডিভিডেন্ডের হার বা পার্সেন্টেজ
            const rate = trimmed.replace(year, '').trim();
            
            if (rate) {
                // ডাইনামিক ফিল্ড তৈরি: যেমন cash_2022 বা stock_2018
                infoObj[`${type}_${year}`] = rate;
            }
        }
    });
}

async function scrapeDSESingle(companyCode, todayDate) {
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
            instrument_type: "N/A",
            sector: "N/A",
            year_end: "N/A",
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        let rawCashDividend = "";
        let rawStockDividend = "";

        $('table tr').each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 2) {
                const label = $(cols[0]).text().trim().toLowerCase();
                const value = $(cols[1]).text().trim();

                if (label.includes('type of instrument')) {
                    dseInfo.instrument_type = value;
                } else if (label.includes('sector')) {
                    dseInfo.sector = value;
                } else if (label.includes('cash dividend')) {
                    rawCashDividend = value;
                } else if (label.includes('bonus issue') || label.includes('(stock dividend)')) {
                    rawStockDividend = value;
                } else if (label.includes('year end')) {
                    dseInfo.year_end = value;
                }
            }
            
            if (cols.length >= 4) {
                const label3 = $(cols[2]).text().trim().toLowerCase();
                const value3 = $(cols[3]).text().trim();
                
                if (label3.includes('type of instrument')) {
                    dseInfo.instrument_type = value3;
                } else if (label3.includes('sector')) {
                    dseInfo.sector = value3;
                }
            }
        });

        // ইতিহাস ভেঙে আলাদা আলাদা বছরের ফিল্ডে রূপান্তর করা হচ্ছে
        parseDividendHistory(rawCashDividend, 'cash_dividend', dseInfo);
        parseDividendHistory(rawStockDividend, 'stock_dividend', dseInfo);

        // ফায়ারবেইজে ক্লিন ডেটা মার্জ করা
        await db.collection('dse_dividend_data').doc(`${todayDate}_${companyCode}`).set(dseInfo, { merge: true });
        console.log(`성공 (DSE): ${companyCode} এর বছরভিত্তিক ক্যাশ ও স্টক ডিভিডেন্ড আলাদা করা হয়েছে।`);

    } catch (err) {
        console.error(`DSE ভুল: ${companyCode} স্ক্র্যাপ করতে সমস্যা -`, err.message);
    }
}

async function startDSEScraper() {
    console.log("DSE কোম্পানির তালিকা সংগ্রহ করা হচ্ছে...");
    const listUrl = "https://www.dsebd.org/latest_share_price_all.php"; 
    const todayDate = new Date().toISOString().split('T')[0];

    try {
        const { data } = await axios.get(listUrl, {
            httpsAgent: httpsAgent,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const $ = cheerio.load(data);
        let companies = [];

        $('table a.bold').each((index, element) => {
            const companyCode = $(element).text().trim().replace(/[/\\.#$/[\]]/g, "-");
            if (companyCode && companyCode !== "" && companyCode.length <= 15 && !companies.includes(companyCode)) {
                companies.push(companyCode);
            }
        });

        if (companies.length === 0) {
            $('table tr').each((index, element) => {
                const cols = $(element).find('td');
                if (cols.length >= 2) {
                    const companyCode = $(cols[1]).text().trim().split(' ')[0].replace(/[/\\.#$/[\]]/g, "-");
                    if (companyCode && companyCode.length >= 2 && companyCode.length <= 12 && !companies.includes(companyCode) && index > 1) {
                        companies.push(companyCode);
                    }
                }
            });
        }

        console.log(`DSE-তে মোট ${companies.length}টি কোম্পানি পাওয়া গেছে। বছরভিত্তিক ডিভিডেন্ড স্ক্র্যাপিং শুরু হচ্ছে...`);

        if (companies.length === 0) {
            console.log("DSE টেবিল ফরম্যাট মেলেনি।");
            return;
        }

        const chunkSize = 10; 
        for (let i = 0; i < companies.length; i += chunkSize) {
            const chunk = companies.slice(i, i + chunkSize);
            console.log(`[DSE] [${i + 1}-${Math.min(i + chunkSize, companies.length)} / ${companies.length}] কোম্পানিগুলো প্রসেস হচ্ছে...`);
            
            await Promise.all(chunk.map(code => scrapeDSESingle(code, todayDate)));
            await delay(500); 
        }

        console.log("অভিনন্দন! ডিএসই-র সব কোম্পানির ডিভিডেন্ড তথ্য নিখুঁতভাবে ফায়ারবেইজে সংরক্ষিত হয়েছে।");

    } catch (error) {
        console.error("DSE প্রধান তালিকা স্ক্র্যাপ করতে সমস্যা হয়েছে:", error.message);
    }
}

startDSEScraper();
