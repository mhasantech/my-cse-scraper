const axios = require('axios');
const admin = require('firebase-admin');

// ============= FIREBASE CONFIGURATION =============
const serviceAccount = {
  "type": "service_account",
  "project_id": "dse-scraper-c651b",
  "private_key_id": "5c90f5654231207278a93cc9eaeac72e5194709e",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCbu0Vlln8RNCAa\nN8eWs0P/Wk/k+mJpTLCJKhnN2a6rqXW8cGA+TE2s9G0q/I1KFHzALZlagfecj/BR\nEgOs0y9R1q7AtKkuaaja3p2Wa+nf+bDWCuFAHsaAyhIjKx1sCx1MH5/LeOf4Yreb\nMOCOH3sA7rvrleyA5i4xeeig8PJ1yDHmGrlbqZqrWsjmib37B7lhqsBGPxKSfj9j\ngpHWqv4A1fJvtsoKaCt0WyyC7wGmH5XHDnVWqc7egyAcE/Vm/p3N+TsQpRsRechS\nr5vHLHS5UJPFm2smHGQ6BQrUl9D6GoXLHEb5ctnqux7sm1rl0b953nBOlKK3Db4j\n1rFBViB/AgMBAAECggEAFQGFstZB/YgSbHbprSIxIdiEvlYnwBxgE6BiKqoaLX2G\nLAzcborMT3AI6at3Q27QBPwhm1u8kpm3yLetVzqFP3y9xbCYwXHvHNa6WvfjbBq6\nB6UgDQ4ZqHWZTLUcGt7E7Oe3HjMI1zA5o+1L3N/SL6YEIxrt89UYlgPjpRHbIpfQ\nhX5D60xYWp6b7lbb1My8G9fE8Jd+FMPIJDcboGzwupj0wB5BOmXV0MyIp3ytuAUK\npKF6VlddD3pS10BXNC2wg82V2hxqoVMg+/AoQq5ZQ2F7crxe35WiIZWz4bHxuqrO\nI6V0fCjQtd8vU+whQTtaJLPVoXWmhMt75gELrwA3QQKBgQDIvR7VvY59Ajc9NCLl\nh80TOqSS2PO1+HaebVM1R/UVkcYEwYSTCoDvhqnN6WBDwDiS/q8TuVVMvtMqvZ4K\n5YGAK685kf1jVLCM7CCthOtr+P2sV5VD5ZH6nOI1L9/I9x4ECQSxPGjP2EBviaiu\nXA2K1kshNLRuR60dIU4d838f9QKBgQDGmk7Jn/OgH43tFqLJSQxJspyC531xGO7t\n4Kk6DTAy0IxbOzLe8cxajI2mTWn8i7OAiIr3SAZV6FXFIpi2P40ycP9b20JWuzqv\nfxUuHmKDQcAOdef9NFz0aMhSw9OAWUT/XtTb45NH95up99B3yvcTggqNu0H40vB6\ngkZEiJJ6IwKBgFFza2+O2qIepAtRfFdmIvAKe3yaS0kq5/agpYKZD/kQjSig3QpM\n2MRX/85tQ4I6HLqIXMHEEbhyNXzCM754IXPARfk2I3qKgpirtxaxOFU3Urb7UrWa\nEQF/ZsnuAv+oRaWdgynnOSAcvwiC8s7MyzHqgdGXcR7ONo/7U5cTliGBAoGBAIzT\nSEDSKceF+HaAkYeXQ55Sh4aPLTTwECQfJQAj7+RoWs4qKQVLgbNHbP3acOgCC5N9\nvsRfjxaFe6Qgxxab87wrwfbZf63Ob2uX+mXMZ+BY1B2s34Z9BdjNIBcIAsZFBpbq\nIJeXRI1Id1nLfkgjZJWxpVggy0PsF1dXXwojqXHvAoGBAJZP9AKWJBaKkRFK9G8k\npyYa4p/eh/pFgpKJpQr+9ccdihIl3y4T1vJ9OTvLAPlLhYz7IfMY1ZhtPNJZuVj4\nO0IIvDMm8sWciDsVDkwFmE+FuICgYvU/PlWZhpAFQt2QZ9G38mDK446+OfvhyTJa\nGWEUjP4Ti9rjvvC5m/L3WS+t\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@dse-scraper-c651b.iam.gserviceaccount.com",
  "client_id": "114634141840338686284",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40dse-scraper-c651b.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

// Firebase Initialize
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// ============= লোকাল রেকর্ড ডেট ডাটাবেস =============
const RECORD_DATES = {
  "UTTARABANK": "05-Sep-2024",
  "EBL": "15-May-2024",
  "GP": "20-Jun-2024",
  "SQUARE": "25-Jul-2024",
  "BATASHUR": "10-Aug-2024",
  "BRACBANK": "12-Oct-2024",
  "DUTCHBANGLA": "18-Nov-2024",
  "ROBI": "22-Dec-2024",
  "BEXIMCO": "30-Jan-2025"
};

// ============= ডিভিডেন্ড পার্সিং ফাংশন =============

// ক্যাশ ডিভিডেন্ড থেকে লেটেস্ট বছর ও পার্সেন্ট বের করা
function parseLatestCashDividend(cashDividendStr) {
  if (!cashDividendStr || cashDividendStr === 'N/A') return { year: 'N/A', percent: 'N/A' };
  
  const firstYear = cashDividendStr.split(',')[0].trim();
  const match = firstYear.match(/(\d+(?:\.\d+)?)%\s*(\d{4})/);
  if (match) {
    return { percent: match[1] + '%', year: match[2] };
  }
  return { percent: firstYear.split('%')[0] + '%', year: 'N/A' };
}

// স্টক ডিভিডেন্ড থেকে লেটেস্ট বছর ও পার্সেন্ট বের করা
function parseLatestStockDividend(stockDividendStr) {
  if (!stockDividendStr || stockDividendStr === 'N/A') return { year: 'N/A', percent: 'N/A' };
  
  const firstYear = stockDividendStr.split(',')[0].trim();
  const match = firstYear.match(/(\d+(?:\.\d+)?)%\s*(\d{4})/);
  if (match) {
    return { percent: match[1] + '%', year: match[2] };
  }
  return { percent: firstYear.split('%')[0] + '%', year: 'N/A' };
}

// ডিভিডেন্ড হিস্ট্রি পার্স করা
function parseDividendHistory(cashDividendStr, stockDividendStr) {
  const cashHistory = [];
  const stockHistory = [];
  
  // ক্যাশ হিস্ট্রি
  if (cashDividendStr && cashDividendStr !== 'N/A') {
    const cashParts = cashDividendStr.split(',');
    for (const part of cashParts) {
      const match = part.trim().match(/(\d+(?:\.\d+)?)%\s*(\d{4})/);
      if (match) {
        cashHistory.push({ year: match[2], percent: match[1] + '%', type: 'cash' });
      }
    }
  }
  
  // স্টক হিস্ট্রি
  if (stockDividendStr && stockDividendStr !== 'N/A') {
    const stockParts = stockDividendStr.split(',');
    for (const part of stockParts) {
      const match = part.trim().match(/(\d+(?:\.\d+)?)%\s*(\d{4})/);
      if (match) {
        stockHistory.push({ year: match[2], percent: match[1] + '%', type: 'stock' });
      }
    }
  }
  
  return { cashHistory, stockHistory };
}

// ============= API থেকে ডাটা নেওয়া এবং Firebase এ সেভ করা =============

// একক কোম্পানি সেভ
async function saveCompanyDividend(tradingCode) {
  try {
    console.log(`📊 Fetching dividend data for ${tradingCode}...`);
    
    // আপনার বিদ্যমান API কল
    const apiUrl = `https://dse-scrape.vercel.app/api/scrape?action=all&tradingCode=${tradingCode}`;
    const response = await axios.get(apiUrl, { timeout: 15000 });
    
    if (!response.data.success) {
      console.log(`❌ API failed for ${tradingCode}`);
      return null;
    }
    
    const details = response.data.data.details;
    const price = response.data.data.price;
    
    // ডিভিডেন্ড পার্সিং
    const latestCash = parseLatestCashDividend(details.cashDividend);
    const latestStock = parseLatestStockDividend(details.stockDividend);
    const history = parseDividendHistory(details.cashDividend, details.stockDividend);
    
    // ফায়ারবেজ ডাটা প্রস্তুত
    const dividendData = {
      tradingCode: tradingCode,
      companyName: details.companyName || tradingCode,
      shareCategory: details.shareCategory || 'N/A',
      listingYear: details.listingYear || 'N/A',
      recordDate: RECORD_DATES[tradingCode] || 'N/A',
      
      // লেটেস্ট ডিভিডেন্ড
      latestCashDividend: latestCash.percent,
      latestCashDividendYear: latestCash.year,
      latestStockDividend: latestStock.percent,
      latestStockDividendYear: latestStock.year,
      totalDividend: latestCash.percent !== 'N/A' && latestStock.percent !== 'N/A' 
        ? (parseFloat(latestCash.percent) + parseFloat(latestStock.percent)) + '%' 
        : (latestCash.percent !== 'N/A' ? latestCash.percent : latestStock.percent),
      
      // ডিভিডেন্ড হিস্ট্রি
      cashDividendHistory: history.cashHistory,
      stockDividendHistory: history.stockHistory,
      fullCashDividendString: details.cashDividend,
      fullStockDividendString: details.stockDividend,
      
      // অন্যান্য তথ্য
      lastTradedPrice: price.ltp !== 'N/A' ? price.ltp : null,
      marketStatus: price.marketOpen,
      
      // টাইমস্ট্যাম্প
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedISO: new Date().toISOString()
    };
    
    // Firebase এ সেভ
    await db.collection('dividends').doc(tradingCode).set(dividendData, { merge: true });
    console.log(`✅ Saved dividend data for ${tradingCode}`);
    
    return dividendData;
    
  } catch (error) {
    console.error(`❌ Error saving ${tradingCode}:`, error.message);
    return null;
  }
}

// সব কোম্পানি সেভ (ব্যাচ)
async function saveAllDividends() {
  const companies = Object.keys(RECORD_DATES);
  const results = [];
  
  console.log(`🚀 Starting to save ${companies.length} companies...`);
  
  for (let i = 0; i < companies.length; i++) {
    const code = companies[i];
    console.log(`[${i+1}/${companies.length}] Processing ${code}...`);
    
    const result = await saveCompanyDividend(code);
    if (result) results.push(result);
    
    // Rate limiting - 2 সেকেন্ড delay
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // মেটাডাটা আপডেট
  await db.collection('metadata').doc('dividendUpdate').set({
    lastFullUpdate: admin.firestore.FieldValue.serverTimestamp(),
    totalCompanies: results.length,
    companies: companies
  });
  
  console.log(`🎉 Completed! Saved ${results.length} companies`);
  return { success: true, saved: results.length, total: companies.length };
}

// নির্দিষ্ট কোম্পানির ডিভিডেন্ড পড়া
async function getDividendFromFirebase(tradingCode) {
  try {
    const doc = await db.collection('dividends').doc(tradingCode.toUpperCase()).get();
    if (doc.exists) {
      return doc.data();
    }
    return null;
  } catch (error) {
    console.error('Error reading from Firebase:', error);
    return null;
  }
}

// সব ডিভিডেন্ড তালিকা
async function getAllDividends() {
  try {
    const snapshot = await db.collection('dividends').get();
    const dividends = [];
    snapshot.forEach(doc => {
      dividends.push(doc.data());
    });
    return dividends;
  } catch (error) {
    console.error('Error getting all dividends:', error);
    return [];
  }
}

// ============= API HANDLER =============
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { action, tradingCode } = req.query;
    
    // 1. টেস্ট
    if (action === 'test') {
      return res.status(200).json({
        success: true,
        message: 'Dividend Saver API Active',
        endpoints: {
          save: '?action=save&tradingCode=EBL',
          saveAll: '?action=save-all',
          get: '?action=get&tradingCode=EBL',
          getAll: '?action=get-all'
        }
      });
    }
    
    // 2. একক কোম্পানি সেভ
    if (action === 'save' && tradingCode) {
      const result = await saveCompanyDividend(tradingCode.toUpperCase());
      return res.status(200).json({ success: true, data: result });
    }
    
    // 3. সব কোম্পানি সেভ (মেইন ফিচার)
    if (action === 'save-all') {
      const result = await saveAllDividends();
      return res.status(200).json(result);
    }
    
    // 4. ফায়ারবেজ থেকে পড়া
    if (action === 'get' && tradingCode) {
      const data = await getDividendFromFirebase(tradingCode.toUpperCase());
      if (data) {
        return res.status(200).json({ success: true, data: data });
      } else {
        return res.status(200).json({ success: false, message: 'Not found in Firebase' });
      }
    }
    
    // 5. সব ডিভিডেন্ড তালিকা
    if (action === 'get-all') {
      const dividends = await getAllDividends();
      return res.status(200).json({ success: true, count: dividends.length, data: dividends });
    }
    
    // 6. হেল্প
    if (action === 'help' || !action) {
      return res.status(200).json({
        success: true,
        message: 'Dividend Data Saver - Fetches from your DSE API and saves to Firebase',
        endpoints: {
          '💾 Save one company': '?action=save&tradingCode=EBL',
          '🚀 Save all companies': '?action=save-all',
          '📖 Read from Firebase': '?action=get&tradingCode=EBL',
          '📋 Get all dividends': '?action=get-all',
          '🔧 Test': '?action=test'
        },
        note: 'প্রতিদিন auto-save করার জন্য cron-job.org ব্যবহার করুন'
      });
    }
    
    return res.status(400).json({
      success: false,
      message: 'Invalid action',
      availableActions: ['test', 'save', 'save-all', 'get', 'get-all', 'help']
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
