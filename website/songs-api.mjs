import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const songsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'songs');
const MAX_BODY_BYTES = 1_000_000;

export function songsApiPlugin() {
  return {
    name: 'strudel-songs-api',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0].replace(/\/$/, '') || '/';
        if (pathname !== '/api/songs' && pathname !== '/api/songs/directories') {
          next();
          return;
        }
        handleSongsRequest(req, res, pathname).catch((error) => {
          sendJson(res, error.statusCode || 500, { error: error.message || 'Song request failed' });
        });
      });
    },
  };
}

async function handleSongsRequest(req, res, pathname) {
  fs.mkdirSync(songsRoot, { recursive: true });
  if (req.method === 'GET' && pathname === '/api/songs') {
    sendJson(res, 200, listSongs());
    return;
  }
  if (req.method === 'POST' && pathname === '/api/songs') {
    const body = await readJson(req);
    sendJson(res, 200, saveSong(body));
    return;
  }
  if (req.method === 'POST' && pathname === '/api/songs/directories') {
    const body = await readJson(req);
    sendJson(res, 200, createDirectory(body));
    return;
  }
  sendJson(res, 405, { error: 'Method not allowed' });
}

export function listSongs() {
  const directories = [];
  const songs = [];
  walk(songsRoot, '', directories, songs);
  directories.sort((a, b) => a.path.localeCompare(b.path));
  songs.sort((a, b) => a.path.localeCompare(b.path));
  return { directories, songs };
}

function walk(dir, rel, directories, songs) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      directories.push({ path: childRel, name: entry.name });
      walk(full, childRel, directories, songs);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const source = fs.readFileSync(full, 'utf8');
      const song = parseSongSource(source);
      songs.push({
        path: childRel.split(path.sep).join('/'),
        directory: rel.split(path.sep).join('/'),
        title: song.title,
        code: song.code,
      });
    }
  }
}

export function saveSong(body) {
  const title = cleanTitle(body?.title);
  const code = cleanCode(body?.code);
  if (body?.path) {
    const file = resolveSongFile(body.path);
    if (!fs.existsSync(file.full)) {
      throw httpError(404, 'Song file not found');
    }
    fs.writeFileSync(file.full, serializeSong(title, code));
    return { path: file.rel, directory: file.directory, title, code };
  }
  const directory = resolveDirectory(body?.directory || '');
  const filename = uniqueFilename(directory.full, slugify(title));
  const rel = directory.rel ? `${directory.rel}/${filename}` : filename;
  fs.writeFileSync(path.join(directory.full, filename), serializeSong(title, code));
  return { path: rel, directory: directory.rel, title, code };
}

export function createDirectory(body) {
  const parent = resolveDirectory(body?.parent || '');
  const name = slugify(body?.name || '');
  if (!name) {
    throw httpError(400, 'Enter a folder name');
  }
  const full = path.join(parent.full, name);
  const rel = parent.rel ? `${parent.rel}/${name}` : name;
  fs.mkdirSync(full, { recursive: true });
  const keep = path.join(full, '.gitkeep');
  if (!fs.existsSync(keep)) {
    fs.writeFileSync(keep, '');
  }
  return { path: rel, name };
}

export function serializeSong(title, code) {
  return `export const title = ${JSON.stringify(title)};\nexport const code = ${JSON.stringify(code)};\n`;
}

export function parseSongSource(source) {
  let index = source.indexOf('export const title');
  if (index === -1) {
    throw httpError(400, 'Song file is missing a title');
  }
  index = source.indexOf('=', index) + 1;
  const title = readJsonString(source, index);
  index = skipSpace(source, title.index);
  if (source[index] === ';') {
    index += 1;
  }
  const codeAt = source.indexOf('export const code', index);
  if (codeAt === -1) {
    throw httpError(400, 'Song file is missing code');
  }
  index = source.indexOf('=', codeAt) + 1;
  const code = readJsonString(source, index);
  if (typeof title.value !== 'string' || typeof code.value !== 'string') {
    throw httpError(400, 'Song title and code must be strings');
  }
  return { title: title.value, code: code.value };
}

function readJsonString(source, index) {
  index = skipSpace(source, index);
  if (source[index] !== '"') {
    throw httpError(400, 'Song file has an unreadable value');
  }
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source[cursor] === '"') {
      const literal = source.slice(index, cursor + 1);
      return { value: JSON.parse(literal), index: cursor + 1 };
    }
    cursor += 1;
  }
  throw httpError(400, 'Song file has an unclosed string');
}

function skipSpace(source, index) {
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }
  return index;
}

function cleanTitle(title) {
  if (typeof title !== 'string' || !title.trim()) {
    throw httpError(400, 'Enter a title');
  }
  const trimmed = title.trim();
  if (trimmed.length > 120) {
    throw httpError(400, 'Title must be 120 characters or fewer');
  }
  return trimmed;
}

function cleanCode(code) {
  if (typeof code !== 'string' || !code.trim()) {
    throw httpError(400, 'There is no code to save');
  }
  if (code.length > MAX_BODY_BYTES) {
    throw httpError(400, 'Song code is too large');
  }
  return code;
}

export function slugify(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug;
}

function uniqueFilename(dir, slug) {
  const base = slug || 'song';
  let name = `${base}.js`;
  let count = 2;
  while (fs.existsSync(path.join(dir, name))) {
    name = `${base}-${count}.js`;
    count += 1;
  }
  return name;
}

function resolveDirectory(rel) {
  const location = resolveInside(rel);
  if (!fs.existsSync(location.full)) {
    throw httpError(400, 'Folder not found');
  }
  if (!fs.statSync(location.full).isDirectory()) {
    throw httpError(400, 'Folder not found');
  }
  return location;
}

function resolveSongFile(rel) {
  const location = resolveInside(rel);
  if (!location.rel.endsWith('.js') || location.rel.includes('..')) {
    throw httpError(400, 'Invalid song file');
  }
  return location;
}

function resolveInside(rel) {
  const parts = String(rel || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || part.startsWith('.'))) {
    throw httpError(400, 'Invalid path');
  }
  const full = path.resolve(songsRoot, ...parts);
  const rootWithSep = songsRoot.endsWith(path.sep) ? songsRoot : songsRoot + path.sep;
  if (full !== songsRoot && !full.startsWith(rootWithSep)) {
    throw httpError(400, 'Invalid path');
  }
  return { full, rel: parts.join('/'), directory: parts.slice(0, -1).join('/') };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(httpError(413, 'Song code is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(httpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
