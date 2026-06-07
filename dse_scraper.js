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

// ১. DSEX ইনডেক্স ভ্যালু স্ক্র্যাপ করার জন্য অত্যন্ত শক্তিশালী ও আপগ্রেডেড ফাংশন
async function scrapeDSEIndices(todayDate) {
    console.log("DSE হোমপেজ থেকে DSEX এবং অন্যান্য ইনডেক্স ভ্যালু সংগ্রহ করা হচ্ছে...");
    const homeUrl = "https://dsebd.org/index.php";
    
    try {
        const { data } = await axios.get(homeUrl, {
            httpsAgent: httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        const $ = cheerio.load(data);
        let savedCount = 0;

        // ডিএসই-র যেকোনো ধরনের টেবিল রো (.box-body, .table, tr) স্ক্যান করার জন্য ফ্লেক্সিবল লজিক
        $('tr, .index-box, div.bg-blue-light').each((index, element) => {
            const rowText = $(element).text();
            
            // আমরা যে ইনডেক্সগুলো খুঁজছি তা এই লাইনে আছে কিনা চেক করা
            if (rowText.includes('DSEX') || rowText.includes('DSES') || rowText.includes('D30')) {
                const cols = $(element).find('td');
                
                if (cols.length >= 3) {
                    let indexName = $(cols[0]).text().trim().replace(/[/\\.#$/[\]]/g, "-");
                    let value = $(cols[1]).text().trim();
                    let change = $(cols[2]).text().trim();
                    let changePercent = cols.length >= 4 ? $(cols[3]).text().trim() : "0.0%";

                    // ক্লীনআপ: নাম থেকে অতিরিক্ত স্পেস বা অপ্রয়োজনীয় লেখা বাদ দেওয়া
                    if (indexName.includes('DSEX')) indexName = 'DSEX';
                    if (indexName.includes('DSES')) indexName = 'DSES';
                    if (indexName.includes('D30')) indexName = 'D30';

                    // সঠিক ভ্যালু থাকলে ডাটাবেজে পুশ হবে
                    if (value && value !== "" && !isNaN(parseFloat(value))) {
                        const indexInfo = {
                            index_name: indexName,
                            date: todayDate,
                            value: value,
                            change: change,
                            change_percent: changePercent,
                            updated_at: admin.firestore.FieldValue.serverTimestamp()
                        };

                        db.collection('dse_index_data').doc(`${todayDate}_${indexName}`).set(indexInfo, { merge: true });
                        console.log(`성공 (DSE Index): ${indexName} -> Value: ${value}, Change: ${change}`);
                        savedCount++;
                    }
                }
            }
        });

        // ব্যাকআপ মেথড: যদি প্রথম সিলেক্টরে কোনো কারণে কাজ না করে (Direct Class Matching)
        if (savedCount === 0) {
            console.log("ব্যাকআপ সিলেক্টর দিয়ে ইনডেক্স খোঁজা হচ্ছে...");
            $('table').each((tIdx, tbl) => {
                if ($(tbl).text().includes('DSEX')) {
                    $(tbl).find('tr').each((rIdx, tr) => {
                        const tds = $(tr).find('td');
                        if (tds.length >= 2) {
                            const nameText = $(tds[0]).text().trim();
                            if (nameText === 'DSEX' || nameText === 'DSES' || nameText === 'D30') {
                                const indexInfo = {
                                    index_name: nameText,
                                    date: todayDate,
                                    value: $(tds[1]).text().trim(),
                                    change: tds.length >= 3 ? $(tds[2]).text().trim() : "0",
                                    change_percent: tds.length >= 4 ? $(tds[3]).text().trim() : "0%",
                                    updated_at: admin.firestore.FieldValue.serverTimestamp()
                                };
                                db.collection('dse_index_data').doc(`${todayDate}_${nameText}`).set(indexInfo, { merge: true });
                                console.log(`성공 (Backup Index): ${nameText} -> Value: ${indexInfo.value}`);
                            }
                        }
                    });
                }
            });
        }
    } catch (err) {
        console.error("DSEX ইনডেক্স স্ক্র্যাপ করতে সমস্যা হয়েছে, তবে মূল প্রসেস সচল থাকবে। এরর:", err.message);
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
            console.log(`성공 (DSE API): ${companyCode} -> ক্যাশ ও স্টক ডিভিডেন্ড সেভ হয়েছে।`);
        }
    } catch (err) {
        console.error(`API ভুল: ${companyCode} এর ডেটা রিড করতে সমস্যা -`, err.message);
    }
}

// ৩. কোড এক্সিকিউশনের প্রধান ফাংশন
async function startScraper() {
    const todayDate = new Date().toISOString().split('T')[0];
    
    // কোম্পানি ডিভিডেন্ড রান করার আগে প্রথমে DSEX ইনডেক্স ডেটা তুলবে
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
            console.log(`[DSE API] [${i + 1}-${Math.min(i + chunkSize, companies.length)} / ${companies.length}] প্রসেস হচ্ছে...`);
            
            await Promise.all(chunk.map(code => fetchFromDSEApi(code, todayDate)));
            await delay(1000); 
        }

        console.log("অভিনন্দন! DSEX ভ্যালু এবং সমস্ত কোম্পানির ডিভিডেন্ড তথ্য সফলভাবে ফায়ারবেইজে সংরক্ষিত হয়েছে।");

    } catch (error) {
        console.error("প্রধান প্রসেস রান করতে সমস্যা হয়েছে:", error.message);
    }
}

startScraper();
