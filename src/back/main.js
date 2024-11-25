require('dotenv').config();  // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Client } = require('@googlemaps/google-maps-services-js');
const client = new Client({});

const app = express();

// Enable CORS for frontend requests
app.use(cors());

// Add this line to parse JSON bodies
app.use(express.json());

// Serve the HTML and other static files (like CSS and JS)
app.use(express.static(path.join(__dirname, 'src', 'front')));

// Route to get a random location
app.get('/api/random-location', (req, res) => {
  // Generate random coordinates within valid ranges
  // Latitude: -90 to 90 degrees
  // Longitude: -180 to 180 degrees
  const lat = Math.random() * 180 - 90;  // Random latitude
  const lng = Math.random() * 360 - 180; // Random longitude

  res.json({ lat, lng });
});

// Serve the HTML file with the injected API key
app.get('/', (req, res) => {
  // Read the HTML file and inject the API key
  res.sendFile(path.join(__dirname, 'src', 'front', 'index.html'), (err, data) => {
    if (err) {
      return res.status(500).send('Error loading page');
    }
    
    const updatedData = data.replace('YOUR_API_KEY', apiKey);
    res.send(updatedData);
  });
});

// Add new endpoint to serve the Google Maps script URL
app.get('/api/maps-credentials', (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const scriptUrl = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
  res.json({ scriptUrl });
});

// Route to get directions from start to destination
app.post('/api/navigate', async (req, res) => {
    const { start, destination } = req.body;

    try {
        // Geocode the origin
        const originResponse = await client.geocode({
            params: {
                address: start,
                key: process.env.GOOGLE_MAPS_API_KEY,
            },
        });

        // Check if results are returned
        if (!originResponse.data.results || originResponse.data.results.length === 0) {
            return res.status(400).send('Origin address not found');
        }

        const originLocation = originResponse.data.results[0].geometry.location;

        // Geocode the destination
        const destinationResponse = await client.geocode({
            params: {
                address: destination,
                key: process.env.GOOGLE_MAPS_API_KEY,
            },
        });

        // Check if results are returned
        if (!destinationResponse.data.results || destinationResponse.data.results.length === 0) {
            return res.status(400).send('Destination address not found');
        }

        const destinationLocation = destinationResponse.data.results[0].geometry.location;

        // Request directions using the geocoded locations
        const directionsResponse = await client.directions({
            params: {
                origin: `${originLocation.lat},${originLocation.lng}`,
                destination: `${destinationLocation.lat},${destinationLocation.lng}`,
                key: process.env.GOOGLE_MAPS_API_KEY,
                mode: 'driving',
                departure_time: 'now'
            },
        });

        const route = directionsResponse.data.routes[0]; // Get the first route
        if (!route) {
            return res.status(404).send('No route found');
        }

        // Return the route with start and end locations, distance, and duration
        res.json({
            route: {
                start_location: {
                    lat: originLocation.lat,
                    lng: originLocation.lng,
                },
                end_location: {
                    lat: destinationLocation.lat,
                    lng: destinationLocation.lng,
                },
                distance: route.legs[0].distance, // Distance information
                duration: route.legs[0].duration, // Duration information
            },
        });
    } catch (error) {
        console.error('Error fetching directions:', error);
        res.status(500).send('Error fetching directions');
    }
});

// Listen for incoming requests
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});