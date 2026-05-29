const fs = require('fs');
const path = require('path');

const owner = 'Alexandre-Rafael';
const repo = 'lamorye';

// Helper to get file SHA from GitHub API
async function getSha(filePath, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Vercel-Serverless-Function'
    }
  });
  if (res.status === 200) {
    const data = await res.json();
    return data.sha;
  }
  return null;
}

// Helper to commit file to GitHub API using base64
async function commitImageToGitHub(filePath, base64Content, message, token) {
  const sha = await getSha(filePath, token);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  
  const body = {
    message: message,
    content: base64Content,
    branch: 'main'
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Vercel-Serverless-Function'
    },
    body: JSON.stringify(body)
  });

  return res.status === 200 || res.status === 201;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { filename, base64 } = req.body;
    if (!filename || !base64) {
      res.status(400).json({ error: 'Filename and base64 content are required' });
      return;
    }

    // Clean up filename: replace spaces and weird characters, but keep it readable
    const cleanFilename = filename.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\.-]/g, '');
    const token = process.env.GITHUB_TOKEN;

    if (token) {
      // We are on Vercel: commit directly to GitHub
      console.log(`Committing image ${cleanFilename} to GitHub...`);
      const success = await commitImageToGitHub(cleanFilename, base64, `Upload image ${cleanFilename} from admin panel`, token);
      if (success) {
        res.status(200).json({ success: true, url: cleanFilename, message: 'Image uploaded to GitHub!' });
      } else {
        res.status(500).json({ success: false, error: 'Failed to commit image to GitHub' });
      }
    } else if (process.env.VERCEL) {
      // Running on Vercel but GITHUB_TOKEN is missing
      res.status(400).json({
        success: false,
        error: 'Erro de permissão: A variável GITHUB_TOKEN não foi configurada nas configurações de variáveis de ambiente do projeto na Vercel.'
      });
    } else {
      // We are local: write directly to disk
      const filePath = path.join(process.cwd(), cleanFilename);
      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(filePath, buffer);
      res.status(200).json({ success: true, url: cleanFilename, message: 'Image saved locally!' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
