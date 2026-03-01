import { useEffect, useRef, useState, ChangeEvent, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  Repeat, 
  Repeat1, 
  Music, 
  ChevronDown, 
  ExternalLink,
  Loader2,
  Settings,
  RefreshCw,
  Shuffle,
  Trash2,
  X,
  Globe,
  AppWindow,
  Heart,
  Download,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { IATrack, RepeatMode, AppSettings } from './types';
import { fetchAllTracks } from './services/iaService';

const CACHE_NAME = 'angel-girl-brianna-music-cache';
// USER: Place your icon as 'logo.png' in the /public/assets folder
const APP_ICON_URL = 'assets/logo.png'; 
const APP_BANNER_URL = 'assets/banner.png';

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

function AppLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`${className} rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center border border-white/20 shadow-lg shadow-emerald-500/20`}>
      {APP_ICON_URL ? (
        <img src={APP_ICON_URL} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <Heart className="w-1/2 h-1/2 text-white fill-current" />
      )}
    </div>
  );
}

export default function App() {
  const [tracks, setTracks] = useState<IATrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('agb-music-settings');
    if (saved) {
      try {
        return JSON.parse(saved) as AppSettings;
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }
    }
    return {
      isCachingEnabled: false,
      isShuffleEnabled: false
    };
  });

  const [cachedUrls, setCachedUrls] = useState<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentTrack = currentTrackIndex >= 0 ? tracks[currentTrackIndex] : null;

  const addNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const handleDownload = async (track: IATrack) => {
    try {
      addNotification(`Downloading ${track.title}...`, 'info');
      
      // Check if File System Access API is supported AND not in an iframe
      // showSaveFilePicker is restricted in cross-origin iframes
      const isInIframe = window.self !== window.top;
      
      if ('showSaveFilePicker' in window && !isInIframe) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: track.filename,
            types: [{
              description: 'Audio File',
              accept: { 'audio/*': [`.${track.filename.split('.').pop()}`] },
            }],
          });
          
          addNotification('Saving file...', 'info');
          const response = await fetch(track.audioUrl);
          const blob = await response.blob();
          
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          
          addNotification(`Successfully downloaded ${track.title}!`, 'success');
          return; // Exit if successful
        } catch (err: any) {
          // If user cancels or it fails, we'll fall through to the standard download
          if (err.name === 'AbortError') {
            addNotification('Download cancelled.', 'info');
            return;
          }
          console.warn('File System API failed, falling back to standard download:', err);
        }
      }

      // Standard download fallback (works in iframes)
      const response = await fetch(track.audioUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = track.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      addNotification(`Successfully downloaded ${track.title}!`, 'success');
      
    } catch (error: any) {
      console.error('Download error:', error);
      addNotification('Failed to download file.', 'error');
    }
  };

  // Save settings
  useEffect(() => {
    localStorage.setItem('agb-music-settings', JSON.stringify(settings));
  }, [settings]);

  const loadTracks = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      
      const allTracks = await fetchAllTracks('angelgirlbrianna');
      setTracks(allTracks);
      
      setCurrentTrackIndex(prev => (prev === -1 && allTracks.length > 0 ? 0 : prev));
    } catch (error) {
      console.error('Failed to load tracks:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []); // Removed currentTrackIndex dependency

  // Fetch tracks on mount
  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  // Caching logic
  useEffect(() => {
    const handleCaching = async () => {
      if (!currentTrack || !settings.isCachingEnabled) return;

      try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(currentTrack.audioUrl);

        if (cachedResponse) {
          const blob = await cachedResponse.blob();
          const objectUrl = URL.createObjectURL(blob);
          setCachedUrls(prev => ({ ...prev, [currentTrack.audioUrl]: objectUrl }));
        } else {
          // Fetch and cache
          const response = await fetch(currentTrack.audioUrl);
          if (response.ok) {
            await cache.put(currentTrack.audioUrl, response.clone());
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            setCachedUrls(prev => ({ ...prev, [currentTrack.audioUrl]: objectUrl }));
          }
        }
      } catch (error) {
        console.error('Caching error:', error);
      }
    };

    handleCaching();
  }, [currentTrack, settings.isCachingEnabled]);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      Object.values(cachedUrls).forEach((url: string) => URL.revokeObjectURL(url));
    };
  }, [cachedUrls]);

  // Audio control effects
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const playAudio = async () => {
      if (!audioRef.current) return;

      if (isPlaying) {
        try {
          // Check if we're already playing or if we can play
          if (audioRef.current.paused) {
            await audioRef.current.play();
          }
        } catch (e: any) {
          if (e.name !== 'AbortError') {
            console.error('Playback failed:', e);
          }
        }
      } else {
        audioRef.current.pause();
      }
    };

    playAudio();
  }, [isPlaying]);

  // Handle track changes separately
  useEffect(() => {
    if (audioRef.current && currentTrack) {
      audioRef.current.load();
      if (isPlaying) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            if (e.name !== 'AbortError') {
              console.error('Track change playback failed:', e);
            }
          });
        }
      }
    }
  }, [currentTrackIndex]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    if (tracks.length === 0) return;

    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }

    if (settings.isShuffleEnabled) {
      const nextIndex = Math.floor(Math.random() * tracks.length);
      setCurrentTrackIndex(nextIndex);
      return;
    }

    if (repeatMode === 'album' && currentTrack) {
      const albumTracks = tracks.filter(t => t.album === currentTrack.album);
      const currentInAlbumIndex = albumTracks.findIndex(t => t.audioUrl === currentTrack.audioUrl);
      const nextInAlbumIndex = (currentInAlbumIndex + 1) % albumTracks.length;
      const nextTrack = albumTracks[nextInAlbumIndex];
      const nextGlobalIndex = tracks.findIndex(t => t.audioUrl === nextTrack.audioUrl);
      setCurrentTrackIndex(nextGlobalIndex);
      return;
    }

    setCurrentTrackIndex((prev) => (prev + 1) % tracks.length);
  };

  const handleBack = () => {
    if (tracks.length === 0) return;
    
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }

    if (repeatMode === 'album' && currentTrack) {
      const albumTracks = tracks.filter(t => t.album === currentTrack.album);
      const currentInAlbumIndex = albumTracks.findIndex(t => t.audioUrl === currentTrack.audioUrl);
      const prevInAlbumIndex = (currentInAlbumIndex - 1 + albumTracks.length) % albumTracks.length;
      const prevTrack = albumTracks[prevInAlbumIndex];
      const prevGlobalIndex = tracks.findIndex(t => t.audioUrl === prevTrack.audioUrl);
      setCurrentTrackIndex(prevGlobalIndex);
      return;
    }

    setCurrentTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleRepeatMode = () => {
    const modes: RepeatMode[] = ['all', 'album', 'one'];
    const currentIndex = modes.indexOf(repeatMode);
    setRepeatMode(modes[(currentIndex + 1) % modes.length]);
  };

  const getRepeatIcon = () => {
    switch (repeatMode) {
      case 'one': return <Repeat1 className="w-5 h-5 text-emerald-400" />;
      case 'album': return <div className="relative"><Repeat className="w-5 h-5 text-blue-400" /><span className="absolute -top-1 -right-1 text-[8px] font-bold">ALB</span></div>;
      default: return <Repeat className="w-5 h-5 text-white/60" />;
    }
  };

  const clearCache = async () => {
    try {
      await caches.delete(CACHE_NAME);
      setCachedUrls({});
      alert('Cache cleared successfully!');
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-6 text-center">
        <motion.div
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="mb-8"
        >
          <AppLogo className="w-24 h-24" />
        </motion.div>
        <h1 className="text-2xl font-bold mb-2">Angel Girl Brianna Music</h1>
        <p className="text-zinc-400">Loading library from Internet Archive...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-emerald-500/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full" />
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-lg mx-auto pb-32">
        {/* Banner */}
        <div className="w-full h-48 overflow-hidden rounded-b-[40px] shadow-2xl shadow-emerald-500/10 border-b border-white/5 relative">
          <img 
            src={APP_BANNER_URL} 
            alt="Banner" 
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/music/800/400';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
        </div>

        <header className="p-6 pt-8 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <AppLogo className="w-12 h-12 flex-shrink-0" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">
                Angel Girl Brianna <span className="text-emerald-400">Music</span>
              </h1>
              <p className="text-zinc-500 text-xs mt-0.5">Powered by Internet Archive</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => loadTracks(true)}
              disabled={isRefreshing}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
              title="Refresh Music"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Library List */}
        <div className="px-4 space-y-2">
          {tracks.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">
              <Music className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No tracks found in this collection.</p>
            </div>
          ) : (
            tracks.map((track, index) => (
              <motion.div
                key={`${track.identifier}-${index}`}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setCurrentTrackIndex(index);
                  setIsPlaying(true);
                }}
                className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-colors cursor-pointer ${
                  currentTrackIndex === index 
                    ? 'bg-white/10 border border-white/10' 
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
                  <img 
                    src={track.albumArtUrl} 
                    alt={track.album}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  {currentTrackIndex === index && isPlaying && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="flex gap-0.5 items-end h-3">
                        <motion.div animate={{ height: [4, 12, 6, 10] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-0.5 bg-emerald-400" />
                        <motion.div animate={{ height: [8, 4, 12, 6] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 bg-emerald-400" />
                        <motion.div animate={{ height: [12, 6, 10, 4] }} transition={{ repeat: Infinity, duration: 0.4 }} className="w-0.5 bg-emerald-400" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <h3 className={`font-medium truncate ${currentTrackIndex === index ? 'text-emerald-400' : 'text-white'}`}>
                    {track.title}
                  </h3>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-zinc-500 truncate">{track.album}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 font-mono uppercase">
                      {track.format || track.filename.split('.').pop()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(track);
                    }}
                    className="p-2 rounded-full hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400 transition-colors"
                    title="Download Track"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <div className="text-zinc-600">
                    <Music className="w-4 h-4" />
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <AppLogo className="w-8 h-8" />
                  <h2 className="text-xl font-bold">Settings</h2>
                </div>
                <button onClick={() => setShowSettings(false)} className="p-2 rounded-full hover:bg-white/5">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Caching Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Enable Caching</h3>
                    <p className="text-xs text-zinc-500">Save music locally while playing</p>
                  </div>
                  <button 
                    onClick={() => setSettings(s => ({ ...s, isCachingEnabled: !s.isCachingEnabled }))}
                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.isCachingEnabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                  >
                    <motion.div 
                      animate={{ x: settings.isCachingEnabled ? 26 : 2 }}
                      className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>

                {/* Clear Cache */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Clear Cache</h3>
                    <p className="text-xs text-zinc-500">Remove all saved music files</p>
                  </div>
                  <button 
                    onClick={clearCache}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors text-sm font-medium"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </button>
                </div>

                {/* External Links */}
                <div className="space-y-3 pt-4 border-t border-white/5">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Links</h3>
                  <a 
                    href="https://AngelGirlBrianna.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-blue-400" />
                      <span className="text-sm font-medium">AngelGirlBrianna.com</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-zinc-600" />
                  </a>
                  <a 
                    href="https://App.AngelGirlBrianna.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <AppWindow className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-medium">App.AngelGirlBrianna.com</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-zinc-600" />
                  </a>
                </div>
              </div>
              
              <div className="p-6 bg-white/5 text-center">
                <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">Version 2.0.0</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notifications */}
      <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border ${
                n.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/20 text-emerald-400' :
                n.type === 'error' ? 'bg-red-500/20 border-red-500/20 text-red-400' :
                'bg-zinc-900/90 border-white/10 text-white'
              }`}
            >
              {n.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
               n.type === 'error' ? <AlertCircle className="w-5 h-5" /> :
               <Loader2 className="w-5 h-5 animate-spin" />}
              <span className="text-sm font-medium">{n.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Mini Player / Expanded Player */}
      <AnimatePresence>
        {currentTrack && (
          <motion.div
            layout
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className={`fixed bottom-0 left-0 right-0 z-50 bg-zinc-900/95 backdrop-blur-xl border-t border-white/5 transition-all duration-500 ease-in-out ${
              isPlayerExpanded ? 'h-full' : 'h-24'
            }`}
          >
            {isPlayerExpanded ? (
              /* Expanded Player View */
              <div className="h-full flex flex-col p-8 pt-12 max-w-lg mx-auto">
                <button 
                  onClick={() => setIsPlayerExpanded(false)}
                  className="absolute top-6 left-6 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <ChevronDown className="w-6 h-6" />
                </button>

                <div className="flex-1 flex flex-col items-center justify-center gap-8">
                  <motion.div 
                    layoutId="album-art"
                    className="w-full aspect-square rounded-3xl overflow-hidden shadow-2xl shadow-emerald-500/10 border border-white/5"
                  >
                    <img 
                      src={currentTrack.albumArtUrl} 
                      alt={currentTrack.album}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>

                  <div className="w-full text-center space-y-2">
                    <motion.h2 layoutId="track-title" className="text-2xl font-bold truncate px-4">
                      {currentTrack.title}
                    </motion.h2>
                    <motion.p layoutId="track-album" className="text-emerald-400 font-medium">
                      {currentTrack.album}
                    </motion.p>
                    <p className="text-zinc-500 text-sm">{currentTrack.creator}</p>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full space-y-2">
                    <input 
                      type="range"
                      min="0"
                      max={duration || 0}
                      value={currentTime}
                      onChange={handleSeek}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                      <div className="flex gap-2">
                        <span className="text-emerald-400">{formatTime(currentTime)}</span>
                        <span className="opacity-30">/</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                      <div className="flex gap-1 items-center">
                        <span className="opacity-50">REMAINING</span>
                        <span className="text-white">-{formatTime(duration - currentTime)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="w-full flex items-center justify-between px-4">
                    <div className="flex gap-2">
                      <button onClick={toggleRepeatMode} className="p-2 rounded-full hover:bg-white/5">
                        {getRepeatIcon()}
                      </button>
                      <button 
                        onClick={() => setSettings(s => ({ ...s, isShuffleEnabled: !s.isShuffleEnabled }))}
                        className={`p-2 rounded-full hover:bg-white/5 transition-colors ${settings.isShuffleEnabled ? 'text-emerald-400' : 'text-white/30'}`}
                      >
                        <Shuffle className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-8">
                      <button onClick={handleBack} className="p-2 text-white/80 hover:text-white">
                        <SkipBack className="w-8 h-8 fill-current" />
                      </button>
                      <button 
                        onClick={handlePlayPause}
                        className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
                      >
                        {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
                      </button>
                      <button onClick={handleNext} className="p-2 text-white/80 hover:text-white">
                        <SkipForward className="w-8 h-8 fill-current" />
                      </button>
                    </div>

                    <a 
                      href={currentTrack.originalItemUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 rounded-full hover:bg-white/5 text-zinc-500"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>

                  {/* Volume */}
                  <div className="w-full flex items-center gap-4 px-4">
                    <Volume2 className="w-5 h-5 text-zinc-500" />
                    <input 
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white/40"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Mini Player View */
              <div className="h-full flex items-center px-4 gap-4">
                <div 
                  onClick={() => setIsPlayerExpanded(true)}
                  className="flex-1 flex items-center gap-3 cursor-pointer min-w-0"
                >
                  <motion.div 
                    layoutId="album-art"
                    className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-800 border border-white/5"
                  >
                    <img 
                      src={currentTrack.albumArtUrl} 
                      alt={currentTrack.album}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                  <div className="min-w-0">
                    <motion.h4 layoutId="track-title" className="font-bold text-sm truncate">
                      {currentTrack.title}
                    </motion.h4>
                    <motion.p layoutId="track-album" className="text-xs text-emerald-400 truncate">
                      {currentTrack.album}
                    </motion.p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={handleBack} className="p-2 text-zinc-400 hover:text-white">
                    <SkipBack className="w-5 h-5 fill-current" />
                  </button>
                  <button 
                    onClick={handlePlayPause}
                    className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                  </button>
                  <button onClick={handleNext} className="p-2 text-zinc-400 hover:text-white">
                    <SkipForward className="w-5 h-5 fill-current" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Audio Element */}
      {currentTrack && (
        <audio
          ref={audioRef}
          src={cachedUrls[currentTrack.audioUrl] || currentTrack.audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleNext}
          onLoadedMetadata={handleTimeUpdate}
          onCanPlay={() => {
            if (isPlaying && audioRef.current && audioRef.current.paused) {
              audioRef.current.play().catch(e => {
                if (e.name !== 'AbortError') console.error('onCanPlay playback failed:', e);
              });
            }
          }}
          onError={(e) => {
            const target = e.target as HTMLAudioElement;
            console.error('Audio playback error:', target.error);
            // If it's a source error, try to skip to next
            if (target.error?.code === 4 || target.error?.code === 3) {
              addNotification('Error loading track. Skipping...', 'error');
              setTimeout(handleNext, 2000);
            }
          }}
        />
      )}
    </div>
  );
}
