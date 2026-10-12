import { randomBytes } from 'node:crypto';
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
        const songId = songIdFromPath(pathname);
        if (pathname !== '/api/songs' && pathname !== '/api/songs/directories' && !songId) {
          next();
          return;
        }
        handleSongsRequest(req, res, pathname, songId).catch((error) => {
          sendJson(res, error.statusCode || 500, { error: error.message || 'Song request failed' });
        });
      });
    },
  };
}

function songIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/songs\/([^/]+)$/);
  if (!match || match[1] === 'directories') {
    return '';
  }
  return decodeURIComponent(match[1]);
}

async function handleSongsRequest(req, res, pathname, songId) {
  fs.mkdirSync(songsRoot, { recursive: true });
  if (req.method === 'GET' && songId) {
    const song = findSongById(songId);
    if (!song) {
      throw httpError(404, 'Song not found');
    }
    sendJson(res, 200, song);
    return;
  }
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

function walk(dir, rel, directories, songs, seen = new Set()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      directories.push({ path: childRel, name: entry.name });
      walk(full, childRel, directories, songs, seen);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const source = fs.readFileSync(full, 'utf8');
      const song = parseSongSource(source);
      const filePath = childRel.split(path.sep).join('/');
      const directory = rel.split(path.sep).join('/');
      if (!song.id || seen.has(song.id)) {
        song.id = createSongId(seen);
        fs.writeFileSync(full, serializeSong(song.id, song.title, song.code));
      }
      seen.add(song.id);
      songs.push({
        id: song.id,
        path: filePath,
        directory,
        title: song.title,
        code: song.code,
      });
    }
  }
}

export function findSongById(id) {
  if (!isSongId(id)) {
    return null;
  }
  return listSongs().songs.find((song) => song.id === id) || null;
}

export function saveSong(body) {
  const title = cleanTitle(body?.title);
  const code = cleanCode(body?.code);
  if (body?.path) {
    const file = resolveSongFile(body.path);
    if (!fs.existsSync(file.full)) {
      throw httpError(404, 'Song file not found');
    }
    const existing = parseSongSource(fs.readFileSync(file.full, 'utf8'));
    const id = existing.id || createSongId(collectIds());
    fs.writeFileSync(file.full, serializeSong(id, title, code));
    return { id, path: file.rel, directory: file.directory, title, code };
  }
  const directory = resolveDirectory(body?.directory || '');
  const filename = uniqueFilename(directory.full, slugify(title));
  const rel = directory.rel ? `${directory.rel}/${filename}` : filename;
  const id = createSongId(collectIds());
  fs.writeFileSync(path.join(directory.full, filename), serializeSong(id, title, code));
  return { id, path: rel, directory: directory.rel, title, code };
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

export function serializeSong(id, title, code) {
  return `export const id = ${JSON.stringify(id)};\nexport const title = ${JSON.stringify(title)};\nexport const code = ${JSON.stringify(code)};\n`;
}

export function parseSongSource(source) {
  const title = readExportString(source, 'title');
  const code = readExportString(source, 'code');
  const id = readExportString(source, 'id', true);
  if (typeof title !== 'string' || typeof code !== 'string') {
    throw httpError(400, 'Song title and code must be strings');
  }
  return { id: isSongId(id) ? id : '', title, code };
}

function readExportString(source, name, optional = false) {
  const at = source.indexOf(`export const ${name}`);
  if (at === -1) {
    if (optional) {
      return '';
    }
    throw httpError(400, name === 'title' ? 'Song file is missing a title' : 'Song file is missing code');
  }
  const eq = source.indexOf('=', at);
  if (eq === -1) {
    throw httpError(400, 'Song file has an unreadable value');
  }
  return readJsonString(source, eq + 1).value;
}

export function isSongId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(id);
}

function createSongId(seen) {
  let id = '';
  do {
    id = randomBytes(9).toString('base64url');
  } while (seen.has(id));
  return id;
}

function collectIds() {
  return new Set(listSongs().songs.map((song) => song.id));
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
