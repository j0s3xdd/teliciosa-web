const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const MENU_FILE = path.join(ROOT, 'menu.json');
const ASSETS_DIR = path.join(ROOT, 'assets');

// Sirve menu-static.js ANTES de cualquier otra cosa
app.get('/menu-static.js', (req, res) => {
  try {
    res.type('application/javascript');
    res.send(fs.readFileSync(path.join(ROOT, 'menu-static.js'), 'utf8'));
  } catch(e) { res.status(500).send(''); }
});

app.use(express.json());
app.use('/assets', express.static(ASSETS_DIR));

// ── Auth ─────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.headers['x-admin-token'] === config.password) return next();
  res.status(401).json({ error: 'No autorizado' });
}

// ── Helpers ───────────────────────────────────────────────────────
function readMenu() { return JSON.parse(fs.readFileSync(MENU_FILE, 'utf8')); }

function writeMenu(data) {
  fs.writeFileSync(MENU_FILE, JSON.stringify(data, null, 2), 'utf8');
  // Genera el fallback estático para cuando se abre el HTML sin servidor
  fs.writeFileSync(
    path.join(ROOT, 'menu-static.js'),
    `window.__MENU__=${JSON.stringify(data)};`,
    'utf8'
  );
}

// ── API menú ──────────────────────────────────────────────────────
app.get('/api/menu', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readMenu());
});

app.post('/api/menu', requireAuth, (req, res) => {
  try { writeMenu(req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API imágenes ──────────────────────────────────────────────────
app.get('/api/images', requireAuth, (req, res) => {
  const files = fs.readdirSync(ASSETS_DIR)
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map(f => 'assets/' + f);
  res.json(files);
});

// ── Subida de fotos ───────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: ASSETS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext)
        .toLowerCase().replace(/[^a-z0-9]/g, '_') + ext;
      cb(null, name);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.post('/admin/upload', requireAuth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sin archivo' });
  res.json({ path: 'assets/' + req.file.filename });
});

// ── Archivos estáticos del raíz ───────────────────────────────────
function sendRoot(file, mime) {
  return (req, res) => {
    res.type(mime);
    res.send(fs.readFileSync(path.join(ROOT, file)));
  };
}
app.get('/', sendRoot('teliciosa.html', 'text/html'));
app.get('/teliciosa.html', sendRoot('teliciosa.html', 'text/html'));
app.get('/admin', sendRoot('admin.html', 'text/html'));
app.get('/admin.html', sendRoot('admin.html', 'text/html'));
app.get('/menu-static.js', sendRoot('menu-static.js', 'application/javascript'));

// ── Arranque ──────────────────────────────────────────────────────
writeMenu(readMenu()); // regenera menu-static.js al iniciar

app.listen(PORT, () => {
  console.log(`\n✅ Teliciosa en marcha`);
  console.log(`   Web:   http://localhost:${PORT}`);
  console.log(`   Admin: http://localhost:${PORT}/admin`);
  console.log(`   Contraseña: ${config.password}\n`);
});
