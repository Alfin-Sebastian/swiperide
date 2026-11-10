const mongoose = require('mongoose');
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
const path = require('path');

// Load env from backend
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

async function checkConnections() {
  console.log('--- SwipeRide Health Check ---');

  // 1. MongoDB Check
  try {
    console.log('Checking MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ MongoDB: Connected Successfully');
    await mongoose.connection.close();
  } catch (err) {
    console.error('❌ MongoDB: Connection Failed ->', err.message);
  }

  // 2. AWS S3 Check
  try {
    console.log('Checking AWS S3...');
    const s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    await s3Client.send(new ListBucketsCommand({}));
    console.log(`✅ AWS S3: Connected Successfully (Bucket Access Verified)`);
    console.log(`   Target Bucket: ${process.env.AWS_BUCKET_NAME}`);
  } catch (err) {
    console.error('❌ AWS S3: Connection Failed ->', err.message);
  }

  process.exit();
}

checkConnections();
