const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 8);
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);

if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const appId = req.params.id || 'unassigned';
    const dir = path.join(UPLOAD_ROOT, String(appId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const docType = (req.body.doc_type || 'document').replace(/[^a-z_]/gi, '');
    const ext = path.extname(file.originalname) || '';
    cb(null, `${docType}-${Date.now()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('Only PDF, JPG or PNG files are accepted.'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

module.exports = { upload, UPLOAD_ROOT };
