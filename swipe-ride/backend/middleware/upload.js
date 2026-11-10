const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const s3Client = require('../utils/s3Config');

// Allowed file types
const allowedTypes = /jpeg|jpg|png|webp|pdf/;

// Check file type
const fileFilter = (req, file, cb) => {
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only JPG, PNG, WEBP, or PDF files are allowed'));
    }
};

// Storage engine - AWS S3
const storage = multerS3({
    s3: s3Client,
    bucket: process.env.AWS_BUCKET_NAME,
    metadata: function (req, file, cb) {
        cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        const folder = file.fieldname === 'recording' ? 'recordings/' : 'documents/';
        cb(null, folder + file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Multer upload config
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

module.exports = upload;
