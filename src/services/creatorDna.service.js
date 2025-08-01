const path = require('path');
const fs = require('fs').promises;

// Add this function after the getChannelTranscripts endpoint
async function getAverageViews(channelId) {
  const API_KEY = process.env.BRANDCONNECT_API_KEY;

  try {
    console.log(`Calculating average views for channel: ${channelId}`);

    // Step 1: Get the uploads playlist ID for the channel
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${API_KEY}`
    );
    const channelData = await channelResponse.json();

    if (!channelData.items || channelData.items.length === 0) {
      console.error('No channel found with ID:', channelId);
      return 0;
    }

    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
    console.log(`Uploads playlist ID: ${uploadsPlaylistId}`);

    // Step 2: Get the most recent videos from the uploads playlist (up to 50)
    const playlistResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&key=${API_KEY}`
    );
    const playlistData = await playlistResponse.json();

    if (!playlistData.items || playlistData.items.length === 0) {
      console.error('No videos found in uploads playlist');
      return 0;
    }

    // Get the video IDs
    const videoIds = playlistData.items.map(item => item.contentDetails.videoId);
    console.log(`Found ${videoIds.length} videos in uploads playlist`);

    // Step 3: Get video details including statistics and publish dates
    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(',')}&key=${API_KEY}`
    );
    const videosData = await videosResponse.json();

    if (!videosData.items || videosData.items.length === 0) {
      console.error('No video details found');
      return 0;
    }

    // Step 4: Filter videos from the last 3 months and calculate average views
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Sort videos by publish date (newest first)
    const sortedVideos = videosData.items.sort((a, b) => {
      const dateA = new Date(a.snippet.publishedAt);
      const dateB = new Date(b.snippet.publishedAt);
      return dateB - dateA;
    });

    // First try to get videos from the last 3 months
    let recentVideos = sortedVideos.filter(video => {
      const publishDate = new Date(video.snippet.publishedAt);
      return publishDate >= threeMonthsAgo;
    });

    // If no videos in the last 3 months, use the 5 most recent videos
    let timeframe = "past 3 months";
    if (recentVideos.length === 0) {
      console.log('No videos published in the last 3 months, using 5 most recent videos instead');
      recentVideos = sortedVideos.slice(0, 5);
      timeframe = "5 most recent videos";
    }

    console.log(`Found ${recentVideos.length} videos for average calculation (${timeframe})`);

    if (recentVideos.length === 0) {
      console.log('No videos available for average calculation');
      return { averageViews: 0, timeframe: "no videos available" };
    }

    // Calculate total views and average
    let totalViews = 0;

    recentVideos.forEach(video => {
      const views = parseInt(video.statistics.viewCount) || 0;
      console.log(`Video ${video.id}: ${video.snippet.title} - ${views} views (published: ${video.snippet.publishedAt})`);
      totalViews += views;
    });

    const averageViews = Math.round(totalViews / recentVideos.length);
    console.log(`Total views: ${totalViews}, Average views: ${averageViews} (${timeframe})`);

    return { averageViews, timeframe };
  } catch (error) {
    console.error('Error calculating average views:', error);
    return { averageViews: 0, timeframe: "error" };
  }
}

module.exports = {
  getAverageViews,
};
