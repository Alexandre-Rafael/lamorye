const fs = require('fs');
const path = require('path');

function getFilesRecursively(dir, rootDir, result = []) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && !file.startsWith('.')) {
        getFilesRecursively(fullPath, rootDir, result);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        result.push(relPath);
      }
    }
  });
  return result;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const images = getFilesRecursively(process.cwd(), process.cwd());
    res.status(200).json(images);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
