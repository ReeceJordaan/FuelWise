// Global state for map and marker instances
let map = null;
let currentMarker = null;
let autocomplete = null;
let sessionToken = null;
let directionsService = null;
let directionsRenderer = null;

// Constants
const API_BASE_URL = 'http://localhost:3000';
const MAP_CONFIG = {
    zoom: 4,
    mapId: 'map'
};

// Initialize the application
window.onload = async () => {
    try {
        await loadGoogleMapsScript();
        await initMap();
        await initializeInputListeners();
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
};

// Initialize or update the map with a random location
async function initMap() {
    try {
        if (!window.google) {
            await loadGoogleMapsScript();
        }
        
        const location = await fetchRandomLocation();
        updateMap(location);
        updateMarker(location);
        
        // Initialize autocomplete after map is loaded
        initAutocomplete();
    } catch (error) {
        console.error('Failed to initialize map:', error);
    }
}

// Show the user's current location on the map
async function showMyLocation() {
    try {
        if (!window.google) {
            await loadGoogleMapsScript();
        }

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const location = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    updateMap(location);
                    updateMarker(location);
                    // Zoom in closer for user location
                    map.setZoom(12);
                },
                async (error) => {
                    // Fall back to IP geolocation if browser geolocation fails
                    try {
                        const response = await fetch('https://ipapi.co/json/');
                        if (!response.ok) {
                            throw new Error('IP geolocation failed');
                        }
                        const data = await response.json();
                        const location = {
                            lat: parseFloat(data.latitude),
                            lng: parseFloat(data.longitude)
                        };
                        updateMap(location);
                        updateMarker(location);
                        map.setZoom(12);
                    } catch (ipError) {
                        // If both methods fail, show error
                        let errorMsg = "Failed to get location. ";
                        switch(error.code) {
                            case error.PERMISSION_DENIED:
                                errorMsg += "Location permission denied by user.";
                                break;
                            case error.POSITION_UNAVAILABLE:
                                errorMsg += "Location information is unavailable.";
                                break;
                            case error.TIMEOUT:
                                errorMsg += "Location request timed out.";
                                break;
                            default:
                                errorMsg += "An unknown error occurred.";
                        }
                        alert(errorMsg);
                    }
                }
            );
        } else {
            // If browser doesn't support geolocation, try IP geolocation directly
            try {
                const response = await fetch('https://ipapi.co/json/');
                if (!response.ok) {
                    throw new Error('IP geolocation failed');
                }
                const data = await response.json();
                const location = {
                    lat: parseFloat(data.latitude),
                    lng: parseFloat(data.longitude)
                };
                updateMap(location);
                updateMarker(location);
                map.setZoom(12);
            } catch (ipError) {
                alert('Geolocation is not supported by your browser and IP geolocation failed');
            }
        }
    } catch (error) {
        console.error('Failed to show user location:', error);
    }
}

// Fetch random coordinates from the API
async function fetchRandomLocation() {
    const response = await fetch(`${API_BASE_URL}/api/random-location`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

// Update or initialize the map with given coordinates
function updateMap(location) {
    if (!map) {
        map = new google.maps.Map(document.getElementById(MAP_CONFIG.mapId), {
            center: location,
            zoom: MAP_CONFIG.zoom
        });
    } else {
        map.setCenter(location);
    }
}

// Update or create a marker at the given location
function updateMarker(location) {
    if (currentMarker) {
        currentMarker.setMap(null);
    }

    currentMarker = new google.maps.Marker({
        position: location,
        map: map,
        title: "Random Location"
    });
}

// Initialize autocomplete
function initAutocomplete() {
    const startInput = document.getElementById('start-input');
    const destinationInput = document.getElementById('destination-input');
    const autocompleteResults = document.getElementById('autocomplete-results');
    
    // Initialize Places Service
    placesService = new google.maps.places.PlacesService(map);

    // Add input listeners for both inputs
    [startInput, destinationInput].forEach(input => {
        input.addEventListener('input', debounce((e) => {
            const value = e.target.value;
            if (value.length > 0) {
                // Create a new session token for each new request
                sessionToken = new google.maps.places.AutocompleteSessionToken();
                getPlacePredictions(value, input.id);
            } else {
                autocompleteResults.style.display = 'none';
            }
        }, 300));

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
            }
        });
    });

    // Handle clicks outside
    document.addEventListener('click', (e) => {
        if (!startInput.contains(e.target) && 
            !destinationInput.contains(e.target) && 
            !autocompleteResults.contains(e.target)) {
            autocompleteResults.style.display = 'none';
        }
    });
}

// Get place predictions
function getPlacePredictions(input, sourceId) {
    const autocompleteService = new google.maps.places.AutocompleteService();
    const autocompleteResults = document.getElementById('autocomplete-results');

    const request = {
        input: input,
        sessionToken: sessionToken
    };

    autocompleteService.getPlacePredictions(request, (predictions, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            autocompleteResults.style.display = 'none';
            return;
        }

        // Clear previous results
        autocompleteResults.innerHTML = '';

        // Add "Your location" option for all input fields
        const yourLocationDiv = createAutocompleteItem(null, true);
        yourLocationDiv.addEventListener('click', () => {
            const inputElement = document.getElementById(sourceId);
            setMyLocationStyle(inputElement);
            showMyLocation();
            autocompleteResults.style.display = 'none';
        });
        autocompleteResults.appendChild(yourLocationDiv);

        // Add predictions
        predictions.forEach(prediction => {
            const div = createAutocompleteItem(prediction);
            div.addEventListener('click', () => {
                const inputElement = document.getElementById(sourceId);
                // Fill the textbox with the full address including secondary text
                inputElement.value = prediction.structured_formatting.main_text + ' ' + prediction.structured_formatting.secondary_text;
                getPlaceDetails(prediction.place_id, sourceId);
                autocompleteResults.style.display = 'none';
            });
            autocompleteResults.appendChild(div);
        });

        // Show results
        autocompleteResults.style.display = 'block';
    });
}

// Set the style for "My Location" input
function setMyLocationStyle(inputElement) {
    // Create wrapper if it doesn't exist
    let wrapper = inputElement.closest('.location-input-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'location-input-wrapper';
        inputElement.parentElement.insertBefore(wrapper, inputElement);
        wrapper.appendChild(inputElement);
    }

    // Add the location icon if it doesn't exist
    if (!wrapper.querySelector('.input-location-icon')) {
        const icon = document.createElement('svg');
        icon.className = 'input-location-icon';
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.innerHTML = `
            <path fill="currentColor" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
        `;
        wrapper.appendChild(icon);
    }

    inputElement.value = 'My Location';
    inputElement.classList.add('my-location-text');

    // Add input event listener to handle text changes
    inputElement.addEventListener('input', handleInputChange);
}

// Clear the style for "My Location" input
function clearMyLocationStyle(inputElement) {
    inputElement.classList.remove('my-location-text');
    const wrapper = inputElement.closest('.location-input-wrapper');

    if (wrapper) {
        const icon = wrapper.querySelector('.input-location-icon');
        if (icon) icon.remove();
        wrapper.replaceWith(inputElement);
    }
}

// Handle input changes for "My Location" input
function handleInputChange(event) {
    const inputElement = event.target;
    inputElement.value = '';

    clearMyLocationStyle(inputElement);
    inputElement.removeEventListener('input', handleInputChange);
    
    if (event.data) {
        inputElement.value = event.data;
    }

    inputElement.focus();
}

// Get place details
function getPlaceDetails(placeId, sourceId) {
    const request = {
        placeId: placeId,
        fields: ['geometry']
    };

    placesService.getDetails(request, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            const location = {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng()
            };
            updateMap(location);
            updateMarker(location);
            map.setZoom(15);
        }
    });
}

// Debounce function for input events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Create an autocomplete item
function createAutocompleteItem(prediction, isCurrentLocation = false) {
    const div = document.createElement('div');
    div.className = 'autocomplete-item';

    if (isCurrentLocation) {
        div.innerHTML = `
            <svg class="location-icon" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
            <div class="location-details">
                <span class="location-main">Your location</span>
            </div>
        `;
        div.classList.add('your-location');
    } else {
        div.innerHTML = `
            <svg class="location-icon" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
            </svg>
            <div class="location-details">
                <span class="location-main">${prediction.structured_formatting.main_text}</span>
                <span class="location-secondary">${prediction.structured_formatting.secondary_text || ''}</span>
            </div>
        `;
    }

    return div;
}

// Handle place selection
function handlePlaceSelection(autocomplete, type) {
    const place = autocomplete.getPlace();

    if (!place.geometry) {
        alert("No location details available for this place.");
        return;
    }

    const location = {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng()
    };

    updateMap(location);
    updateMarker(location);
    map.setZoom(15);
}

// Swap the locations
function swapLocations() {
    const startInput = document.getElementById('start-input');
    const destinationInput = document.getElementById('destination-input');
    const tempValue = startInput.value;
    startInput.value = destinationInput.value;
    destinationInput.value = tempValue;
}

// Search for an address
function searchAddress() {
    const input = document.getElementById('address-input');
    if (!input.value.trim()) {
        alert('Please enter an address to search');
        return;
    }

    // Trigger place selection if user hasn't selected from dropdown
    const place = autocomplete.getPlace();
    if (!place || !place.geometry) {
        // If no place selected, use Geocoding service to find the location
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: input.value }, (results, status) => {
            if (status === 'OK' && results[0]) {
                const location = {
                    lat: results[0].geometry.location.lat(),
                    lng: results[0].geometry.location.lng()
                };
                updateMap(location);
                updateMarker(location);
                map.setZoom(15);
            } else {
                alert('Location not found');
            }
        });
    } else {
        // Use the selected place from autocomplete
        const location = {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng()
        };
        updateMap(location);
        updateMarker(location);
        map.setZoom(15);
    }
}

// Load the Google Maps script dynamically
async function loadGoogleMapsScript() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/maps-credentials`);
        const { scriptUrl } = await response.json();
        
        return new Promise((resolve, reject) => {
            const script = document.getElementById('google-maps-api');
            
            window.googleMapsCallback = () => {
                resolve();
            };
            
            script.async = true;
            script.src = `${scriptUrl}&libraries=places&callback=googleMapsCallback`;
            script.onerror = reject;
        });
    } catch (error) {
        console.error('Failed to load Google Maps:', error);
        throw error;
    }
}

// Debounced function for getting place predictions
const debouncedGetPlacePredictions = debounce((input, sourceId) => {
    getPlacePredictions(input, sourceId);
}, 50); // Adjust the delay as needed

// Initialize input listeners
function initializeInputListeners() {
    const startInput = document.getElementById('start-input');
    const destinationInput = document.getElementById('destination-input');

    startInput.addEventListener('input', (event) => {
        debouncedGetPlacePredictions(event.target.value, 'start-input');
    });

    destinationInput.addEventListener('input', (event) => {
        debouncedGetPlacePredictions(event.target.value, 'destination-input');
    });
}

// Navigate from start to destination
async function navigate() {
    const startInput = document.getElementById('start-input').value;
    const destinationInput = document.getElementById('destination-input').value;

    // Error checking
    if (!startInput || !destinationInput) {
        alert('Please enter both a starting point and a destination.');
        return;
    }

    try {
        if (directionsRenderer) {
            directionsRenderer.setMap(null);
        }

        const response = await fetch(`${API_BASE_URL}/api/navigate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                start: startInput,
                destination: destinationInput,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to fetch route');
        }

        const data = await response.json();
        console.log('Response Data:', data); // Log the entire response

        // Check if route exists
        if (!data.route || !data.route.start_location || !data.route.end_location) {
            throw new Error('Route not found in response');
        }

        // Pass the coordinates directly to plotRoute
        const origin = {
            lat: data.route.start_location.lat,
            lng: data.route.start_location.lng,
        };
        const destination = {
            lat: data.route.end_location.lat,
            lng: data.route.end_location.lng,
        };

        // Update the Distance and Time values
        document.getElementById('distance').innerText = data.route.distance.text; // Update distance
        document.getElementById('time').innerText = data.route.duration.text; // Update duration

        plotRoute(origin, destination); // Call function to plot the route on the map
    } catch (error) {
        console.error('Error navigating:', error);
        alert('Failed to navigate. Please try again.');
    }
}

// Function to plot the route on the map
function plotRoute(origin, destination) {
    if(!directionsService) directionsService = new google.maps.DirectionsService();
    if(!directionsRenderer) directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map);

    const request = {
        origin: new google.maps.LatLng(origin.lat, origin.lng), // Use LatLng object
        destination: new google.maps.LatLng(destination.lat, destination.lng), // Use LatLng object
        travelMode: google.maps.TravelMode.DRIVING,
    };

    directionsService.route(request, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
        } else {
            alert('Directions request failed due to ' + status);
        }
    });
}