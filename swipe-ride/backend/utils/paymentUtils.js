const QRCode = require('qrcode');

/**
 * Generates a dynamic UPI Payment URI
 * @param {string} upiId - The driver's UPI ID
 * @param {string} name - The driver's name
 * @param {number} amount - The total amount (fare + tip)
 * @returns {string} - The UPI URI
 */
const generateUPIUri = (upiId, name, amount) => {
    const encodedName = encodeURIComponent(name);
    return `upi://pay?pa=${upiId}&pn=${encodedName}&am=${amount.toFixed(2)}&cu=INR`;
};

/**
 * Generates a QR Code as a Base64 image from a UPI URI
 * @param {string} upiId - The driver's UPI ID
 * @param {string} name - The driver's name
 * @param {number} amount - The total amount
 * @returns {Promise<string>} - Base64 image string
 */
const generateUPIQR = async (upiId, name, amount) => {
    try {
        const uri = generateUPIUri(upiId, name, amount);
        const qrImage = await QRCode.toDataURL(uri);
        return qrImage;
    } catch (err) {
        console.error('QR Generation Error:', err);
        throw new Error('Failed to generate UPI QR code');
    }
};

/**
 * Generates a QR Code as a Base64 image from a User ID
 * @param {string} userId - The user's ID
 * @returns {Promise<string>} - Base64 image string
 */
const generateUserQR = async (userId) => {
    try {
        const qrImage = await QRCode.toDataURL(userId);
        return qrImage;
    } catch (err) {
        console.error('User QR Generation Error:', err);
        throw new Error('Failed to generate User QR code');
    }
};

module.exports = {
    generateUPIUri,
    generateUPIQR,
    generateUserQR
};
