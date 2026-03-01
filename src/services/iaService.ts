import { IAItem, IATrack } from '../types';

const SEARCH_URL = 'https://archive.org/advancedsearch.php';
const METADATA_URL = 'https://archive.org/metadata';
const DOWNLOAD_BASE = 'https://archive.org/download';

export async function fetchIAItems(uploader: string): Promise<IAItem[]> {
  // Try searching by uploader handle, creator, or the title string
  const queries = [
    `uploader:${uploader}`,
    `creator:${uploader}`,
    `subject:${uploader}`,
    `"@${uploader}"`,
    `"Angel Girl Brianna"`
  ];
  
  const params = new URLSearchParams({
    q: `(${queries.join(' OR ')}) AND mediatype:(audio)`,
    'fl[]': 'identifier,title,creator,mediatype',
    'sort[]': 'addeddate desc',
    output: 'json',
    rows: '100',
  });

  const response = await fetch(`${SEARCH_URL}?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch items from Internet Archive');
  
  const data = await response.json();
  return data.response.docs || [];
}

export async function fetchItemTracks(identifier: string): Promise<IATrack[]> {
  const response = await fetch(`${METADATA_URL}/${identifier}`);
  if (!response.ok) throw new Error(`Failed to fetch metadata for ${identifier}`);
  
  const data = await response.json();
  const metadata = data.metadata;
  const files = data.files || [];
  
  // Find album art (album.png as requested)
  const albumArtFile = files.find((f: any) => f.name === 'album.png' || f.name.toLowerCase().endsWith('.jpg') || f.name.toLowerCase().endsWith('.png'));
  const albumArtUrl = albumArtFile 
    ? `${DOWNLOAD_BASE}/${identifier}/${albumArtFile.name}`
    : `https://archive.org/services/img/${identifier}`; // Fallback to IA generated thumbnail

  // Find audio files (mp3, ogg, etc.)
  const audioFiles = files.filter((f: any) => {
    const name = f.name.toLowerCase();
    // Exclude metadata and internal files
    if (name.endsWith('.xml') || name.endsWith('.sqlite') || name.endsWith('.json')) return false;
    
    return (
      f.format === 'VBR MP3' || 
      f.format === 'MP3' || 
      f.format === 'Ogg Vorbis' ||
      name.endsWith('.mp3') ||
      name.endsWith('.ogg') ||
      name.endsWith('.wav') ||
      name.endsWith('.m4a')
    );
  });

  return audioFiles.map((f: any) => {
    // Encode the filename part of the URL to handle spaces and special characters
    const encodedName = f.name.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const audioUrl = `${DOWNLOAD_BASE}/${identifier}/${encodedName}`;
    
    // Also encode album art URL if it's a file from the same item
    let finalAlbumArtUrl = albumArtUrl;
    if (albumArtFile && albumArtUrl.startsWith(DOWNLOAD_BASE)) {
      const encodedArtName = albumArtFile.name.split('/').map(segment => encodeURIComponent(segment)).join('/');
      finalAlbumArtUrl = `${DOWNLOAD_BASE}/${identifier}/${encodedArtName}`;
    }

    return {
      identifier,
      title: f.title || f.name.replace(/\.[^/.]+$/, ""),
      creator: metadata.creator || 'Unknown Artist',
      album: metadata.title || 'Unknown Album',
      trackNumber: parseInt(f.track) || undefined,
      audioUrl,
      albumArtUrl: finalAlbumArtUrl,
      originalItemUrl: `https://archive.org/details/${identifier}`,
      format: f.format,
      filename: f.name,
    };
  });
}

export async function fetchAllTracks(uploader: string): Promise<IATrack[]> {
  const items = await fetchIAItems(uploader);
  const trackPromises = items.map(item => fetchItemTracks(item.identifier));
  const trackArrays = await Promise.all(trackPromises);
  return trackArrays.flat();
}
