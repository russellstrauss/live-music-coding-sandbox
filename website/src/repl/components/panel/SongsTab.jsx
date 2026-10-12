import { useEffect, useState } from 'react';
import cx from '@src/cx.mjs';
import { ActionButton } from '../button/action-button.jsx';
import { Textbox } from '../textbox/Textbox.jsx';
import { SelectInput } from './SelectInput.jsx';
import { createSongDirectory, fetchSongs, saveSong } from '../../songs-client.mjs';

export function SongsTab({ context }) {
  const [directories, setDirectories] = useState([]);
  const [songs, setSongs] = useState([]);
  const [directory, setDirectory] = useState('');
  const [folderName, setFolderName] = useState('');
  const [title, setTitle] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const catalog = await fetchSongs();
    setDirectories(catalog.directories);
    setSongs(catalog.songs);
    return catalog;
  };

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  const run = async (action) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const currentCode = () => context.editorRef.current?.code ?? '';

  const onSave = (asNew) =>
    run(async () => {
      const saved = await saveSong({
        path: asNew ? undefined : selectedPath || undefined,
        directory,
        title,
        code: currentCode(),
      });
      setSelectedPath(saved.path);
      setDirectory(saved.directory);
      setTitle(saved.title);
      setMessage(`Saved website/songs/${saved.path}`);
      await refresh();
    });

  const onAddFolder = () =>
    run(async () => {
      const created = await createSongDirectory({ parent: directory, name: folderName });
      setFolderName('');
      setDirectory(created.path);
      setMessage(`Added folder website/songs/${created.path}`);
      await refresh();
    });

  const onSelectSong = (song) => {
    context.editorRef.current?.setCode(song.code);
    if (context.started) {
      context.handleEvaluate();
    }
    setSelectedPath(song.path);
    setDirectory(song.directory);
    setTitle(song.title);
    setError('');
    setMessage(`Loaded ${song.title}`);
  };

  const folderOptions = new Map([['', 'top level']]);
  directories.forEach((folder) => folderOptions.set(folder.path, folder.path));

  const folders = [{ path: '', name: 'songs' }, ...directories];

  return (
    <div className="flex h-full w-full min-w-0 flex-col gap-3 px-4 py-2 text-foreground">
      <p className="text-sm opacity-70">
        Songs are saved as JavaScript files in website/songs so they can be committed and loaded again.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Title
        <Textbox value={title} placeholder="song title" onChange={setTitle} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Folder
        <SelectInput value={directory} options={folderOptions} onChange={setDirectory} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Textbox value={folderName} placeholder="new folder" onChange={setFolderName} />
        <ActionButton label="add folder" disabled={busy || !folderName.trim()} onClick={onAddFolder} />
      </div>
      <div className="flex flex-wrap gap-3">
        <ActionButton label={selectedPath ? 'save' : 'save new'} disabled={busy} onClick={() => onSave(false)} />
        {selectedPath && <ActionButton label="save as new" disabled={busy} onClick={() => onSave(true)} />}
      </div>
      {message && <p className="text-sm">{message}</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto rounded-md bg-background p-2">
        {songs.length === 0 && <p className="opacity-70">No saved songs yet.</p>}
        {folders.map((folder) => {
          const inFolder = songs.filter((song) => song.directory === folder.path);
          if (folder.path && inFolder.length === 0 && folder.path !== directory) {
            return (
              <FolderButton
                key={folder.path}
                folder={folder}
                selected={directory === folder.path}
                onClick={() => setDirectory(folder.path)}
              />
            );
          }
          return (
            <div key={folder.path || 'root'}>
              <FolderButton
                folder={folder}
                selected={directory === folder.path}
                onClick={() => setDirectory(folder.path)}
              />
              {inFolder.map((song) => (
                <button
                  key={song.path}
                  type="button"
                  className={cx(
                    'block w-full cursor-pointer py-1 text-left hover:opacity-50',
                    selectedPath === song.path && 'underline',
                  )}
                  style={{ paddingLeft: `${(folder.path ? folder.path.split('/').length : 0) * 12 + 16}px` }}
                  onClick={() => onSelectSong(song)}
                >
                  {song.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FolderButton({ folder, selected, onClick }) {
  const depth = folder.path ? folder.path.split('/').length - 1 : 0;
  return (
    <button
      type="button"
      className={cx('block w-full cursor-pointer py-1 text-left hover:opacity-50', selected && 'underline')}
      style={{ paddingLeft: `${depth * 12}px` }}
      onClick={onClick}
    >
      {folder.path || 'songs'}/
    </button>
  );
}
