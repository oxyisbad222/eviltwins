import {
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    collection,
    query,
    getDocs,
    increment,
    limit,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- DOM ELEMENTS ---
const audioPlayer = document.getElementById('audioPlayer');
const playlistContainer = document.getElementById('playlist');
const searchInput = document.getElementById('searchInput');
const playPauseBtn = document.getElementById('playPauseBtn');
const playPauseIcon = document.getElementById('playPauseIcon');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const seekBar = document.getElementById('seekBar');
const volumeBar = document.getElementById('volumeBar');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const playerAlbumArt = document.getElementById('player-album-art');
const playerSongTitle = document.getElementById('player-song-title');
const playerSongArtist = document.getElementById('player-song-artist');
const userAuthContainer = document.getElementById('user-auth-container');
const accountModal = document.getElementById('accountModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const logoutBtn = document.getElementById('logoutBtn');
const accountInfoContainer = document.getElementById('account-info');
const lyricsContent = document.getElementById('lyrics-content');
const lyricsSongTitle = document.getElementById('lyrics-song-title');
const lyricsSongArtist = document.getElementById('lyrics-song-artist');
const topTracksList = document.getElementById('top-tracks-list');
const downloadBtn = document.getElementById('downloadBtn');
const lyricsSection = document.getElementById('lyrics-section');
const lyricsToggleBtn = document.getElementById('lyricsToggleBtn');

// --- APP STATE ---
let hls;
let playlist = [];
let currentIndex = -1;
let isPlaying = false;
let currentUser = null;

// The URL to your M3U8 playlist file.
// Make sure this is publicly accessible, e.g., in your public GitHub repo folder.
const playlistUrl = 'juice.m3u8';
// URL for the Vercel serverless function to fetch lyrics.
// You'll create this in the deployment steps.
const geniusApiUrl = '/api/lyrics'; 


// --- INITIALIZATION ---
// Wait for the 'firebase-ready' event from index.html before using firebase services
document.addEventListener('firebase-ready', () => {
    console.log("Firebase is ready. Initializing app...");
    const auth = window.auth;
    const db = window.db;

    // Set up listeners and load initial data
    setupEventListeners(auth);
    setupAuthObserver(auth);
    loadPlaylist();
    setupTopTracksListener(db);
});

/**
 * Loads and parses the M3U8 playlist file.
 */
async function loadPlaylist() {
    try {
        const response = await fetch(playlistUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch playlist: ${response.statusText}`);
        }
        const m3u8Content = await response.text();
        parseM3u8(m3u8Content);
        renderPlaylist();
    } catch (error) {
        console.error("Error loading playlist:", error);
        playlistContainer.innerHTML = `<p class="text-red-400 p-4">Could not load playlist. Please check the console for errors.</p>`;
    }
}

/**
 * Parses the text content of an M3U8 file to build the playlist array.
 * Assumes a format with #EXTINF followed by the MP3 URL.
 * Example:
 * #EXTINF:210,Juice WRLD - Righteous
 * https://.../righteous.mp3
 * @param {string} m3u8Content - The raw text of the M3U8 file.
 */
function parseM3u8(m3u8Content) {
    const lines = m3u8Content.trim().split('\n');
    let newPlaylist = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXTINF:')) {
            const infoLine = lines[i];
            const urlLine = lines[i + 1];
            if (urlLine && !urlLine.startsWith('#')) {
                const durationMatch = infoLine.match(/#EXTINF:([\d\.]+)/);
                const metadataMatch = infoLine.match(/,(.+)/);

                const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;
                let title = 'Unknown Title';
                let artist = 'Unknown Artist';

                if (metadataMatch) {
                    const metadata = metadataMatch[1].split(' - ');
                    artist = metadata[0].trim();
                    title = metadata[1] ? metadata[1].trim() : artist;
                    if (!metadata[1]) artist = "Juice WRLD"; // Default artist if only title is present
                }
                
                newPlaylist.push({
                    id: `song_${newPlaylist.length}`,
                    title,
                    artist,
                    duration,
                    url: urlLine.trim(),
                });
                i++; // Skip the next line as it's the URL
            }
        }
    }
    playlist = newPlaylist;
    console.log(`Playlist loaded with ${playlist.length} songs.`);
}


// --- UI RENDERING ---

/**
 * Renders the entire playlist or a filtered version based on search text.
 * @param {string} [searchText=''] - Text to filter the playlist by.
 */
function renderPlaylist(searchText = '') {
    playlistContainer.innerHTML = '';
    const filteredPlaylist = playlist.filter(song =>
        song.title.toLowerCase().includes(searchText.toLowerCase()) ||
        song.artist.toLowerCase().includes(searchText.toLowerCase())
    );

    if (filteredPlaylist.length === 0) {
        playlistContainer.innerHTML = `<p class="text-gray-400 p-4">No songs found.</p>`;
        return;
    }

    filteredPlaylist.forEach((song, index) => {
        // Find the original index to maintain play order
        const originalIndex = playlist.findIndex(p => p.id === song.id);

        const songEl = document.createElement('div');
        songEl.className = 'song-item flex items-center justify-between p-3 rounded-lg hover:bg-gray-800 cursor-pointer transition';
        if (originalIndex === currentIndex) {
            songEl.classList.add('active');
        }
        songEl.dataset.index = originalIndex;

        songEl.innerHTML = `
            <div class="flex items-center">
                <span class="text-gray-400 w-6">${originalIndex + 1}.</span>
                <div>
                    <p class="font-semibold">${song.title}</p>
                    <p class="text-sm text-gray-400">${song.artist}</p>
                </div>
            </div>
            <span class="text-sm text-gray-400">${formatTime(song.duration)}</span>
        `;
        songEl.addEventListener('click', () => {
            playSong(originalIndex);
        });
        playlistContainer.appendChild(songEl);
    });
}

/**
 * Updates the UI for the currently playing song in the player bar and playlist.
 */
function updateActiveSongUI() {
    // Update player bar
    if (currentIndex > -1 && playlist[currentIndex]) {
        const song = playlist[currentIndex];
        playerSongTitle.textContent = song.title;
        playerSongArtist.textContent = song.artist;
        // You can add album art fetching logic here if available
        playerAlbumArt.src = `https://placehold.co/64x64/1f2937/ffffff?text=${song.title.charAt(0)}`;

        // Update playlist active item
        document.querySelectorAll('.song-item').forEach(item => {
            item.classList.remove('active');
            if (parseInt(item.dataset.index) === currentIndex) {
                item.classList.add('active');
            }
        });

        // Enable download button
        downloadBtn.disabled = false;
        downloadBtn.classList.remove('text-gray-600', 'cursor-not-allowed');
        downloadBtn.classList.add('text-gray-400', 'hover:text-white');
    } else {
         // Disable download button if no song is playing
        downloadBtn.disabled = true;
        downloadBtn.classList.add('text-gray-600', 'cursor-not-allowed');
        downloadBtn.classList.remove('text-gray-400', 'hover:text-white');
    }
}


// --- PLAYER LOGIC ---

/**
 * Plays a song from the playlist at a given index.
 * @param {number} index - The index of the song in the playlist.
 */
function playSong(index) {
    if (index < 0 || index >= playlist.length) return;
    
    currentIndex = index;
    const song = playlist[index];

    if (Hls.isSupported()) {
        if (hls) {
            hls.destroy();
        }
        hls = new Hls();
        hls.loadSource(song.url);
        hls.attachMedia(audioPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            audioPlayer.play();
        });
    } else if (audioPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        audioPlayer.src = song.url;
        audioPlayer.addEventListener('loadedmetadata', function() {
            audioPlayer.play();
        });
    }
    
    isPlaying = true;
    playPauseIcon.className = 'fas fa-pause';
    updateActiveSongUI();
    fetchLyrics(song.title, song.artist);
    trackSongPlay(song);
}

function togglePlayPause() {
    if (currentIndex === -1) {
        playSong(0); // Play the first song if nothing is selected
        return;
    }

    if (isPlaying) {
        audioPlayer.pause();
        isPlaying = false;
        playPauseIcon.className = 'fas fa-play';
    } else {
        audioPlayer.play();
        isPlaying = true;
        playPauseIcon.className = 'fas fa-pause';
    }
}

function playNext() {
    let nextIndex = currentIndex + 1;
    if (nextIndex >= playlist.length) {
        nextIndex = 0; // Loop to the start
    }
    playSong(nextIndex);
}

function playPrev() {
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
        prevIndex = playlist.length - 1; // Loop to the end
    }
    playSong(prevIndex);
}

// --- LYRICS ---

/**
 * Fetches lyrics from the Genius API via our serverless function.
 * @param {string} title - The title of the song.
 * @param {string} artist - The artist of the song.
 */
async function fetchLyrics(title, artist) {
    lyricsSongTitle.textContent = title;
    lyricsSongArtist.textContent = artist;
    lyricsContent.innerHTML = `<i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-2">Searching for lyrics...</p>`;

    try {
        const response = await fetch(`${geniusApiUrl}?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
        if (!response.ok) {
            throw new Error('Lyrics not found or API error.');
        }
        const data = await response.json();
        lyricsContent.textContent = data.lyrics || "Lyrics not available for this song.";
    } catch (error) {
        console.error("Error fetching lyrics:", error);
        lyricsContent.textContent = "Could not load lyrics.";
    }
}

// --- AUTHENTICATION ---

/**
 * Sets up an observer on the Firebase Auth object.
 * @param {object} auth - The Firebase Auth instance.
 */
function setupAuthObserver(auth) {
    onAuthStateChanged(auth, user => {
        currentUser = user;
        if (user) {
            // User is signed in
            console.log("User signed in:", user.displayName);
            renderUserProfile(user);
        } else {
            // User is signed out
            console.log("User signed out.");
            renderLoginButton();
        }
    });
}

function renderUserProfile(user) {
    userAuthContainer.innerHTML = `
        <img src="${user.photoURL || 'https://placehold.co/40x40/374151/ffffff?text=U'}" alt="User Profile" id="userProfileBtn" class="w-10 h-10 rounded-full cursor-pointer hover:ring-2 hover:ring-purple-500 transition">
    `;
    document.getElementById('userProfileBtn').addEventListener('click', () => showAccountModal(user));
}

function renderLoginButton() {
    userAuthContainer.innerHTML = `
        <button id="loginBtn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-full transition">
            Login with Google
        </button>
    `;
    document.getElementById('loginBtn').addEventListener('click', signInWithGoogle);
}

async function signInWithGoogle() {
    const auth = window.auth;
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Error signing in with Google:", error);
    }
}

async function signOutUser() {
    const auth = window.auth;
    try {
        await signOut(auth);
        accountModal.classList.add('hidden');
    } catch (error) {
        console.error("Error signing out:", error);
    }
}

function showAccountModal(user) {
    accountInfoContainer.innerHTML = `
        <div class="flex items-center space-x-4">
            <img src="${user.photoURL}" alt="Profile" class="w-16 h-16 rounded-full">
            <div>
                <p class="text-xl font-bold">${user.displayName}</p>
                <p class="text-gray-400">${user.email}</p>
            </div>
        </div>
    `;
    accountModal.classList.remove('hidden');
}

// --- FIRESTORE DATA ---

/**
 * Increments the play count for a song in Firestore.
 * @param {object} song - The song object to track.
 */
async function trackSongPlay(song) {
    if (!song || !song.title) return;
    const db = window.db;
    // Sanitize title to use as a document ID
    const songId = song.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    const songRef = doc(db, "songs", songId);

    try {
        // Use setDoc with merge to create or update
        await setDoc(songRef, {
            title: song.title,
            artist: song.artist,
            playCount: increment(1)
        }, { merge: true });
        console.log(`Tracked play for: ${song.title}`);
    } catch (error) {
        console.error("Error tracking song play:", error);
    }
}

/**
 * Sets up a real-time listener for the top tracks.
 * @param {object} db - The Firestore instance.
 */
function setupTopTracksListener(db) {
    const songsRef = collection(db, "songs");
    // NOTE: Firestore requires creating an index for this query.
    // The console error message will provide a direct link to create it.
    const q = query(songsRef);

    onSnapshot(q, (snapshot) => {
        let topSongs = [];
        snapshot.forEach(doc => {
            topSongs.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort in memory and get top 5
        topSongs.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
        topSongs = topSongs.slice(0, 5);

        renderTopTracks(topSongs);
    }, (error) => {
        console.error("Error getting top tracks:", error);
        topTracksList.innerHTML = `<p class="text-red-400">Could not load top tracks.</p>`;
    });
}

function renderTopTracks(songs) {
    if (songs.length === 0) {
        topTracksList.innerHTML = `<p class="text-gray-500">No listening data yet.</p>`;
        return;
    }
    topTracksList.innerHTML = '';
    songs.forEach((song, index) => {
        const trackEl = document.createElement('div');
        trackEl.className = 'flex items-center justify-between text-sm p-2 rounded hover:bg-gray-800';
        trackEl.innerHTML = `
            <div class="flex items-center">
                <span class="text-gray-400 w-6">${index + 1}.</span>
                <div>
                    <p class="font-semibold">${song.title}</p>
                    <p class="text-xs text-gray-400">${song.artist}</p>
                </div>
            </div>
            <span class="text-gray-500"><i class="fas fa-headphones mr-1"></i> ${song.playCount}</span>
        `;
        topTracksList.appendChild(trackEl);
    });
}


// --- EVENT LISTENERS ---
function setupEventListeners() {
    playPauseBtn.addEventListener('click', togglePlayPause);
    nextBtn.addEventListener('click', playNext);
    prevBtn.addEventListener('click', playPrev);

    audioPlayer.addEventListener('timeupdate', () => {
        if (audioPlayer.duration) {
            seekBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
        }
    });

    audioPlayer.addEventListener('loadedmetadata', () => {
        durationEl.textContent = formatTime(audioPlayer.duration);
    });

    audioPlayer.addEventListener('ended', playNext);
    
    seekBar.addEventListener('input', () => {
        if (audioPlayer.duration) {
            audioPlayer.currentTime = (seekBar.value / 100) * audioPlayer.duration;
        }
    });

    volumeBar.addEventListener('input', () => {
        audioPlayer.volume = volumeBar.value;
    });

    searchInput.addEventListener('input', (e) => {
        renderPlaylist(e.target.value);
    });
    
    closeModalBtn.addEventListener('click', () => accountModal.classList.add('hidden'));
    logoutBtn.addEventListener('click', signOutUser);

    downloadBtn.addEventListener('click', downloadCurrentSong);

    lyricsToggleBtn.addEventListener('click', () => {
        lyricsSection.classList.toggle('hidden');
    });
}

// --- UTILITY FUNCTIONS ---

/**
 * Formats time in seconds to a "m:ss" format.
 * @param {number} seconds - The time in seconds.
 * @returns {string} The formatted time string.
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Downloads the currently playing song.
 */
async function downloadCurrentSong() {
    if (currentIndex === -1) {
        alert("Please play a song first to download it.");
        return;
    }

    const song = playlist[currentIndex];
    
    // Show a downloading indicator
    const originalIcon = downloadBtn.innerHTML;
    downloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    downloadBtn.disabled = true;

    try {
        const response = await fetch(song.url);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        // Sanitize filename
        a.download = `${song.artist} - ${song.title}.mp3`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

    } catch (error) {
        console.error('Download failed:', error);
        alert('Could not download the song. Please try again.');
    } finally {
        // Restore button state
        downloadBtn.innerHTML = originalIcon;
        downloadBtn.disabled = false;
    }
}
