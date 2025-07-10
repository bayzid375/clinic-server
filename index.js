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
const is_live = false; // Set to true for live production

// API and Frontend URLs
const API_URL = "https://clinic-server-rho.vercel.app"; // Fallback for local dev
const FRONTEND_URL = 'https://clinic-six-sand.vercel.app';

console.log(`Backend API URL configured as: ${API_URL}`);
console.log(`Frontend URL configured as: ${FRONTEND_URL}`);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// --- MIDDLEWARE ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(bodyParser.json()); // Parse JSON bodies
app.use(bodyParser.urlencoded({ extended: false })); // Parse URL-encoded bodies

// --- ROUTES ---

// Root route for health check
app.get('/', (req, res) => {
  res.send(`Express Server is running. Ready to handle payments.`);
});

app.post('/api/pay', async (req, res) => {
  try {
    const transactionId = uuidv4();
    const {
      patient_id,
      department,
      doctor_id,
      appointment_date,
      appointment_time,
      patient_name,
      patient_phone,
      patient_email,
      patient_age,
      health_issues,
      appointment_status,
      fee
    } = req.body;

    const data = {
      store_id,
      store_passwd,
      tran_id: transactionId,
      total_amount: fee,
      currency: 'BDT',
      success_url: `${API_URL}/payment-success/${encodeURIComponent(patient_id)}/${encodeURIComponent(department)}/${encodeURIComponent(doctor_id)}/${encodeURIComponent(appointment_date)}/${encodeURIComponent(appointment_time)}/${encodeURIComponent(patient_name)}/${encodeURIComponent(patient_phone)}/${encodeURIComponent(patient_email || 'null')}/${encodeURIComponent(patient_age)}/${encodeURIComponent(health_issues)}/${encodeURIComponent(appointment_status)}/${encodeURIComponent(fee)}`,
      fail_url: `${API_URL}/payment-fail`,
      cancel_url: `${API_URL}/payment-cancel`,
      ipn_url: `${API_URL}/ipn`,
      shipping_method: 'No',
      product_name: 'Clinic Appointment',
      product_category: 'Healthcare',
      product_profile: 'non-physical-goods',
      cus_name: patient_name,
      cus_email: patient_email,
      cus_phone: patient_phone,
      cus_add1: 'N/A',
      cus_city: 'N/A',
      cus_postcode: 'N/A',
      cus_country: 'Bangladesh',
      ship_name: 'N/A',
      ship_add1: 'N/A',
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
    console.error('Payment Initiation Error:', error);
    res.status(500).json({ error: error.message || 'Payment initiation failed' });
  }
});

app.post('/payment-success/:patient_id/:department/:doctor_id/:appointment_date/:appointment_time/:patient_name/:patient_phone/:patient_email/:patient_age/:health_issues/:appointment_status/:fee', async (req, res) => {
  try {
    const paymentInfo = req.body; // Data from SSLCommerz
    const {
        patient_id,
        department,
        doctor_id,
        appointment_date,
        appointment_time,
        patient_name,
        patient_phone,
        patient_email,
        patient_age,
        health_issues,
        appointment_status,
        fee,
    } = req.params; // Data we passed in the URL

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const isValid = await sslcz.validate(paymentInfo);

    if (!isValid) {
      console.error("❌ Invalid payment webhook. SSLCommerz validation failed.");
      return res.redirect(`${FRONTEND_URL}/payment-fail?error=validation`);
    }

    const insertData = {
        patient_id: patient_id,
        department: department,
        doctor_id: doctor_id,
        appointment_date: appointment_date,
        appointment_time: appointment_time,
        patient_name: patient_name,
        patient_phone: patient_phone,
        // Handle nullable email that might be passed as a string 'null'
        patient_email: patient_email === 'null' ? null : patient_email,
        // CRITICAL: Convert string from URL to integer for the 'INTEGER' column
        patient_age: parseInt(patient_age, 10),
        health_issues: health_issues,
        // Get the specific payment method from the SSLCommerz response
        payment_method: paymentInfo.card_issuer || paymentInfo.card_type || 'Online',
        payment_status: 'completed',
        appointment_status: appointment_status,
        // CRITICAL: Convert string from URL to number for the 'DECIMAL' column
        fee: parseFloat(fee),
    };

    console.log('Attempting to insert into Supabase:', insertData);

    const { data, error } = await supabase
      .from('appointments')
      .insert([insertData])
      .select();

    if (error) {
      console.error('❌ Supabase DB Insert Error:', error);
      return res.redirect(`${FRONTEND_URL}/payment-fail?error=database&code=${error.code}`);
    }

    console.log('✅ Appointment successfully saved to database:', data);
    res.redirect(`${FRONTEND_URL}/payment-success`);

  } catch (err) {
    console.error('🚨 Global Success Handler Error:', err);
    res.redirect(`${FRONTEND_URL}/payment-fail?error=server`);
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