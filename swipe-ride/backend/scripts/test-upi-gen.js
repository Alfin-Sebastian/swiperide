const { generateUPIUri, generateUPIQR } = require('../utils/paymentUtils');

async function testUPI() {
    const upiId = 'driver@okaxis';
    const name = 'John Doe';
    const amount = 150.50;

    const uri = generateUPIUri(upiId, name, amount);
    console.log('Generated URI:', uri);

    if (uri === `upi://pay?pa=${upiId}&pn=John%20Doe&am=150.50&cu=INR`) {
        console.log('✅ URI Match!');
    } else {
        console.log('❌ URI Mismatch!');
    }

    try {
        const qr = await generateUPIQR(upiId, name, amount);
        if (qr.startsWith('data:image/png;base64,')) {
            console.log('✅ QR Image Generated (Base64)!');
        }
    } catch (err) {
        console.error('❌ QR Generation Failed:', err);
    }
}

testUPI();
