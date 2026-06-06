const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

// গিটহাব সিক্রেটস থেকে ফায়ারবেইজ চাবি রিড করা হচ্ছে
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
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

        // সিএসই ওয়েবসাইটের টেবিল থেকে ডেটা নেওয়া
        $('table tr').each((index, element) => {
            if (index === 0) return; // টেবিল হেডার বাদ

            const cols = $(element).find('td');
            if (cols.length >= 4) {
                // কোম্পানির নাম থেকে ফায়ারবেইজের নিষিদ্ধ ক্যারেক্টারগুলো পরিষ্কার করা হলো
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
