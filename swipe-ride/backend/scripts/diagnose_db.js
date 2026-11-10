const mongoose = require('mongoose');
const dotenv = require('dotenv');
const dns = require('dns').promises;

// Load environment variables
dotenv.config({ path: '../.env' });

async function diagnose() {
    console.log('--- SwipeRide MongoDB Diagnostic Tool ---');
    console.log(`Time: ${new Date().toLocaleString()}`);

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌ MONGODB_URI not found in .env');
        return;
    }

    console.log(`Checking URI: ${uri.replace(/\/\/.*@/, '//****:****@')}`); // Shield password

    // Check DNS for the host
    try {
        const hostMatch = uri.match(/@([^/?#]+)/);
        if (hostMatch) {
            const host = hostMatch[1];
            console.log(`Checking DNS for host: ${host}`);
            const lookup = await dns.lookup(host);
            console.log(`✅ DNS resolved host ${host} to IP: ${lookup.address}`);
        }
    } catch (err) {
        console.error(`❌ DNS Lookup Failed (ENOTFOUND): ${err.message}`);
        console.log('💡 TIP: Your internet might be unstable or your ISP/DNS is blocking MongoDB Atlas.');
        console.log('💡 Try changing your DNS (e.g., to Google 8.8.8.8 or Cloudflare 1.1.1.1).');
    }

    // Attempt Mongoose connection
    console.log('Attempting MongoDB connection...');
    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ MongoDB connected successfully!');

        // Check database status
        const admin = mongoose.connection.db.admin();
        const serverStatus = await admin.serverStatus();
        console.log(`✅ Server version: ${serverStatus.version}`);

        await mongoose.disconnect();
        console.log('Disconnected.');
    } catch (err) {
        console.error(`❌ MongoDB Connection Failed: ${err.message}`);
        if (err.name === 'MongoServerSelectionError') {
            console.log('💡 TIP: This usually means the server cannot reach MongoDB Atlas.');
            console.log('1. Check if your current IP is whitelisted in MongoDB Atlas Network Access.');
            console.log('2. Check if your Atlas cluster is "Paused".');
            console.log('3. Check your firewall/VPN.');
        }
    }
}

diagnose();
