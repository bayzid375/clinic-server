const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const SSLCommerzPayment = require('sslcommerz-lts');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const app = express();

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASSWD;
const is_live = false;

const API_URL = 'https://home-fix-server-nine.vercel.app';
const FRONTEND_URL ="https://clinic-indol.vercel.app";
console.log(FRONTEND_URL);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);


app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


app.get('/', (req, res) => {
  res.send(`Express Server is running locally on vercel`);
});

app.post('/api/pay', async (req, res) => {
  try {
    const transactionId = uuidv4();
    const {
      service_id, user_id, provider_id, date,
      time, address, notes, status, total_amount,payment_status
    } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required." });
    }

    const data = {
      store_id,
      store_passwd,
      tran_id: transactionId,
      total_amount: total_amount,
      currency:'BDT',
      success_url: `${API_URL}/payment-success/${service_id}/${user_id}/${provider_id}/${date}/${time}/${encodeURIComponent(address)}/${encodeURIComponent(notes)}/${status}/${total_amount}/${payment_status}`,
      fail_url: `${API_URL}/payment-fail`,
      cancel_url: `${API_URL}/payment-cancel`,
      ipn_url: `${API_URL}/ipn`,
      shipping_method: 'No',
      product_name:service_id,
      product_category: service_id,
      product_profile: 'non-physical-goods',
      cus_name:user_id,
      cus_email: user_id,
      cus_add1: address,
      cus_city: 'N/A',
      cus_postcode: 'N/A',
      cus_country: 'Bangladesh',
      cus_phone: '+8801706846444',
      ship_name: provider_id,
      ship_add1: provider_id,
      ship_city: 'N/A',
      ship_postcode: 'N/A',
      ship_country: 'Bangladesh',
    };

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const apiResponse = await sslcz.init(data);

    if (apiResponse?.GatewayPageURL) {
      res.json({ url: apiResponse.GatewayPageURL });
    } else {
      console.error('SSLCommerz Init Error:', apiResponse);
      res.status(500).json({ error: 'Failed to initiate payment', details: apiResponse });
    }
  } catch (error) {
    console.error('Payment Error:', error);
    res.status(500).json({ error: error.message || 'Payment initiation failed' });
  }
});

app.post('/payment-success/:serviceId/:userID/:providerId/:date/:time/:address/:notes/:status/:total_amount/:payment_status', async (req, res) => {
  try {
    const paymentInfo = req.body;
    const {
        serviceId,
        userID,
        providerId,
        date,
        time,
        address,
        notes,
        status,
        total_amount,
        payment_status
    } = req.params;

    console.log('✅ Payment Success:', paymentInfo);

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const isValid = await sslcz.validate(paymentInfo);

    if (!isValid) {
      console.error("❌ Invalid webhook.");
      return res.redirect(`${FRONTEND_URL}/payment-fail?error=validation`);
    }

    const insertData = {
        service_id: serviceId,
        user_id: userID,
        provider_id: providerId,
        date,
        time,
        address,
        notes,
        status,
        total_amount,
        payment_method: paymentInfo.card_type,
        payment_status
    };


    console.log(insertData);
    console.log(paymentInfo);
    const { data, error } = await supabase.from('bookings').insert([insertData]);

    if (error) {
      console.error('❌ DB Insert Error:', error);
      return res.redirect(`${FRONTEND_URL}/payment-fail?error=database`);
    }

    res.redirect(`${FRONTEND_URL}/payment-success`);
  } catch (err) {
    console.error('🚨 Success Handler Error:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/payment-fail', (req, res) => {
  console.log('❌ Payment Failed:', req.body);
  res.redirect(`${FRONTEND_URL}/payment-fail`);
});

app.post('/payment-cancel', (req, res) => {
  console.log('⚠️ Payment Cancelled:', req.body);
  res.redirect(`${FRONTEND_URL}/payment-cancel`);
});


app.post('/ipn', (req, res) => {
    console.log('🔔 IPN Received:', req.body);
    res.status(200).send('IPN received successfully.');
});



module.exports = app;