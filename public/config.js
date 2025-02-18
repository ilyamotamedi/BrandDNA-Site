// Create a new file called config.js in your public folder
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://branddna.googleplex.com';

// Export for use in other files
window.API_BASE_URL = API_BASE_URL;