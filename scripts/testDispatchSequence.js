import dotenv from 'dotenv';
dotenv.config();

import { sendSMS } from '../src/utils/sendSMS.js';

const targetNumbers = process.argv.slice(2);
const toPhones = targetNumbers.length > 0 ? targetNumbers : ['+923132748554'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const messages = [
  {
    step: 1,
    name: 'Order Confirmation & Scheduled',
    text: '📦 Bins & Dumpsters: Your order #ORD-480623 has been confirmed! 20-Yard Standard Dumpster scheduled for delivery to Batala Colony, Faisalabad. View order details: https://binsapp.ai/rentee/orders?orderId=ORD-480623',
  },
  {
    step: 2,
    name: 'Driver On The Way (Live Dispatch)',
    text: '🚚 Bins & Dumpsters: Driver is on the way to Batala Colony, Faisalabad with your dumpster! ETA ~15-20 mins. Track driver live arrival: https://binsapp.ai/orders/track?orderId=ORD-480623',
  },
  {
    step: 3,
    name: 'Dumpster Delivered & Safe Placement Confirmed',
    text: '📸 Bins & Dumpsters: Your dumpster has been safely placed at Batala Colony, Faisalabad! Placement confirmed. View verified placement photos: https://binsapp.ai/orders/track?orderId=ORD-480623',
  },
];

async function runSequence() {
  console.log(`\n======================================================`);
  console.log(`🚀 Starting Automated Dispatch SMS Sequence`);
  console.log(`📱 Target Recipients: ${toPhones.join(', ')}`);
  console.log(`⏱️ Interval: 60 seconds between each message`);
  console.log(`======================================================\n`);

  for (let i = 0; i < messages.length; i++) {
    const item = messages[i];
    console.log(`\n[${new Date().toLocaleTimeString()}] 📤 Sending Step ${item.step}/3: "${item.name}"`);

    for (const phone of toPhones) {
      try {
        const res = await sendSMS({ to: phone, body: item.text });
        if (res.success) {
          console.log(`   ✅ Sent to ${phone} | SID: ${res.sid || 'ok'}`);
        } else {
          console.log(`   ❌ Failed for ${phone} | Error: ${res.error || res.message}`);
        }
      } catch (err) {
        console.error(`   ❌ Exception for ${phone}:`, err.message);
      }
    }

    if (i < messages.length - 1) {
      console.log(`   ⏳ Waiting 60 seconds before sending Step ${item.step + 1}...`);
      await sleep(60000);
    }
  }

  console.log(`\n🎉 All 3 automated dispatch lifecycle messages have been sent successfully!\n`);
}

runSequence().catch(console.error);
