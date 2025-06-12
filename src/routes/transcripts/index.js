const express = require('express');
const TranscriptsRouter = express.Router({ mergeParams: true });

const { supadata } = require('../../utils/supadata.util');

TranscriptsRouter.post('/test', async (req, res) => {
  try {
    const { videoUrl } = req.body;

    // Extract video ID from URL
    const videoId = videoUrl.split('v=')[1]?.split('&')[0];
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Get transcript with plain text option
    const transcript = await supadata.youtube.transcript({
      videoId,
      text: true
    });

    res.json(transcript);
  } catch (error) {
    console.error('Transcript error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get transcript'
    });
  }
});

TranscriptsRouter.post('/getChannelTranscripts', async (req, res) => {
  const { videoUrls } = req.body;

  try {
    // Check if videoUrls is an array
    if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid video URLs provided'
      });
    }

    // Helper function to delay execution
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Process transcripts sequentially instead of in parallel
    const transcripts = [];
    for (const url of videoUrls) {
      try {
        const videoId = url.split('v=')[1]?.split('&')[0];
        if (!videoId) {
          console.warn(`Invalid YouTube URL: ${url}, skipping`);
          continue;
        }

        // Use Supadata API with rate limiting - using text=true for plain text
        console.log(`Fetching transcript for video ID: ${videoId}`);

        const transcriptData = await supadata.youtube.transcript({
          videoId,
          text: true // Get plain text transcript
        });

        // Print the transcript data to console
        console.log(`Successfully downloaded transcript for ${videoId}:`);
        console.log(JSON.stringify(transcriptData, null, 2));

        // Create a simple transcript object with the plain text
        const transcript = [{
          text: transcriptData.content,
          offset: 0,
          duration: 0
        }];

        console.log(`Transcript for ${videoId} (first 100 chars): ${transcriptData.content.substring(0, 100)}...`);

        transcripts.push({ videoUrl: url, transcript });
      } catch (videoError) {
        console.warn(`Error processing video ${url}: ${videoError.message}`);
        // Continue with other videos instead of failing the entire request
      }

      // Add a delay between requests to avoid rate limiting
      await delay(1000);
    }

    console.log(`Successfully processed ${transcripts.length} transcripts`);
    console.log(`Final response structure: ${JSON.stringify({ success: true, transcripts: transcripts.map(t => ({ videoUrl: t.videoUrl, textLength: t.transcript[0].text.length })) })}`);

    res.json({ success: true, transcripts });
  } catch (error) {
    console.error('Transcript error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = TranscriptsRouter;
