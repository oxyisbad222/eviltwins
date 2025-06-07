// /api/lyrics.js

// Using 'node-fetch' for making HTTP requests in a Node.js environment.
// You'll need to add this to your package.json dependencies.
import fetch from 'node-fetch';
// A library to scrape lyrics from the Genius song page.
// You'll also need to add 'genius-lyrics-api' to your package.json.
import { getLyrics } from 'genius-lyrics-api';

// This is your handler function for Vercel.
export default async function handler(request, response) {
    // Extract song title and artist from the query parameters.
    const { title, artist } = request.query;

    if (!title || !artist) {
        return response.status(400).json({ error: 'Title and artist are required.' });
    }

    // IMPORTANT: Store your Genius API Access Token as an Environment Variable in Vercel.
    // Do NOT hardcode it here.
    const accessToken = process.env.GENIUS_ACCESS_TOKEN;

    if (!accessToken) {
        return response.status(500).json({ error: 'Genius API token is not configured.' });
    }

    const options = {
        apiKey: accessToken,
        title: title,
        artist: artist,
        optimizeQuery: true, // Helps find the best match
    };

    try {
        // Use the library to fetch the lyrics
        const lyrics = await getLyrics(options);

        if (lyrics) {
            // Send the lyrics back in the response
            response.status(200).json({ lyrics });
        } else {
            // If lyrics are not found
            response.status(404).json({ lyrics: 'Lyrics not found for this song.' });
        }
    } catch (error) {
        console.error('Error fetching lyrics from Genius:', error);
        response.status(500).json({ error: 'Failed to fetch lyrics.' });
    }
}
