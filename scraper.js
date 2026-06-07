const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

try {
    // গিটহাব সিক্রেটস থেকে আসা JSON স্ট্রিং-এর ব্যাকс্ল্যাশ বাগ ফিক্স করার ট্রিক
    let secretStr = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    // ব্যাকস্ল্যাশ এবং নিউলাইনের সমস্যাগুলো ঠিক করা হচ্ছে
    secretStr = secretStr.replace(/\\n/g, '\n'); 

    const serviceAccount = JSON.parse(secretStr);

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    console.log("फায়ারবেইজ অ্যাডমিন সফলভাবে ইনিশিয়ালাইজ হয়েছে।");
} catch (initError) {
    console.error("ফায়ারবেইজ ইনিশিয়ালাইজ করতে সমস্যা হয়েছে। আপনার GitHub Secret চেক করুন।", initError.message);
    process.exit(1);
}

const db = admin.firestore();

async function scrapeCSE() {
    console.log("CSE ওয়েবসাইট থেকে ডেটা স্ক্র্যাপ করা শুরু হচ্ছে...");
    const url = "https://www.cse.com.bd/market/current_market";

    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(data);
        const todayDate = new Date().toISOString().split('T')[0];
        
        let batch = db.batch();
        let count = 0;

        $('table tr').each((index, element) => {
            if (index === 0) return; // হেডার বাদ

            const cols = $(element).find('td');
            if (cols.length >= 4) {
                const companyName = $(cols[1]).text().trim().replace(/[/\\.#$/[\]]/g, "-"); 
                const lastPrice = $(cols[2]).text().trim();
                const highPrice = $(cols[3]).text().trim();
                const lowPrice = $(cols[4]).text().trim() || "0";

                if (companyName) {
                    const docRef = db.collection('cse_market_data').doc(`${todayDate}_${companyName}`);
                    
                    batch.set(docRef, {
                        date: todayDate,
                        company: companyName,
                        last_price: lastPrice,
                        high: highPrice,
                        low: lowPrice,
                        updated_at: admin.firestore.FieldValue.serverTimestamp()
                    });
                    
                    count++;
                }
            }
        });

        await batch.commit();
        console.log(`সফলভাবে ${count}টি কোম্পানির ডেটা ফায়ারবেইজে সেভ হয়েছে!`);

    } catch (error) {
        console.error("স্ক্র্যাপ করতে সমস্যা হয়েছে:", error.message);
    }
}

scrapeCSE();
