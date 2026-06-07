const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

try {
    // গিটহাব সিক্রেটস থেকে Base64 স্ট্রিংটি নেওয়া হচ্ছে
    const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    // Base64 টেক্সটকে আবার আসল JSON টেক্সটে রূপান্তর করা হচ্ছে
    const decodedKey = Buffer.from(base64Key, 'base64').toString('utf8');
    
    const serviceAccount = JSON.parse(decodedKey);

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    console.log("ফায়ারবেইজ অ্যাডমিন সফলভাবে ইনিশিয়ালাইজ হয়েছে।");
} catch (initError) {
    console.error("ফায়ারবেইজ ইনিশিয়ালাইজ করতে समस्या হয়েছে। আপনার GitHub Secret চেক করুন।", initError.message);
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
